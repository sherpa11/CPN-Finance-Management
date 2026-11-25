const Loan = require('../models/Loan');
const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const Collection = require('../models/Collection');
const Transaction = require('../models/Transaction');
const {
  generateCollectionId,
  generateReceiptNumber,
  generateTransactionId,
} = require('../controllers/collectionController');
const CONSTANTS = require('../config/constants');
const { toRupees } = require('./calculationEngine');

let lastSyncTimestamp = 0;

/**
 * Safe, Idempotent Historical Upfront-Interest Collection Reconciliation
 * Supports --dry-run to preview changes without modifying database.
 */
async function syncHistoricalUpfrontCollections({ dryRun = false } = {}) {
  // Throttle pre-flight existence checks to at most once per 3 seconds if not dry-run
  if (!dryRun && Date.now() - lastSyncTimestamp < 3000) {
    return { dryRun, skipped: true };
  }
  lastSyncTimestamp = Date.now();

  const report = {
    dryRun,
    loansScanned: 0,
    loansFixed: 0,
    dcAccountsScanned: 0,
    dcAccountsFixed: 0,
    createdCollections: [],
    errors: [],
  };

  try {
    // Self-healing: clean up orphan upfront collections whose parent loan was deleted
    if (!dryRun) {
      try {
        const orphanUpfronts = await Collection.find({
          $or: [
            { isUpfrontInterest: true },
            { collectionType: 'UPFRONT_INTEREST' },
            { idempotencyKey: { $regex: /^UPFRONT-/ } },
          ],
        }).select('_id loanId loanCode idempotencyKey').lean();

        for (const col of orphanUpfronts) {
          let activeExists = false;
          if (col.loanId) {
            activeExists = (await Loan.exists({ _id: col.loanId })) ||
                           (await DailyCollectionAccount.exists({ $or: [{ _id: col.loanId }, { loanId: col.loanId }] }));
          }
          if (!activeExists && col.loanCode) {
            activeExists = (await Loan.exists({ loanId: col.loanCode })) ||
                           (await DailyCollectionAccount.exists({ $or: [{ accountId: col.loanCode }, { loanCode: col.loanCode }] }));
          }
          if (!activeExists) {
            await Collection.deleteOne({ _id: col._id });
            await Transaction.deleteMany({ collectionId: col._id });
          }
        }
      } catch (cleanErr) {
        console.warn('[syncHistoricalUpfrontCollections] Orphan cleanup warning:', cleanErr.message);
      }
    }

    // Quick pre-flight check: Are there ANY loans or DC accounts that might have unhealed upfront collections?
    if (!dryRun) {
      const hasUnsyncedLoan = await Loan.exists({
        isLegacyLoan: { $ne: true },
        upfrontInterestPaise: { $gt: 0 },
        status: { $nin: ['CANCELLED', 'REVERSED'] },
      });
      const hasUnsyncedDc = await DailyCollectionAccount.exists({
        scheme: 'UPFRONT_DEDUCTION',
        upfrontInterestPaise: { $gt: 0 },
        status: { $nin: ['CANCELLED', 'REVERSED'] },
      });

      if (!hasUnsyncedLoan && !hasUnsyncedDc) {
        return report;
      }
    }
    // 1. Process Monthly and Daily Loans with Upfront Interest
    const loans = await Loan.find({
      isLegacyLoan: { $ne: true },
      upfrontInterestPaise: { $gt: 0 },
      status: { $nin: ['CANCELLED', 'REVERSED'] },
    }).lean();

    report.loansScanned = loans.length;

    for (const loan of loans) {
      const existing = await Collection.findOne({
        isRenewalInterest: { $ne: true },
        collectionType: { $ne: 'RENEWAL_INTEREST' },
        $or: [
          ...(loan.upfrontCollectionId ? [{ _id: loan.upfrontCollectionId }] : []),
          ...(loan.upfrontReceiptNumber ? [{ receiptNumber: loan.upfrontReceiptNumber }] : []),
          { idempotencyKey: `UPFRONT-${loan.loanId}` },
          { idempotencyKey: `UPFRONT-${loan.loanId}-${loan._id}` },
          { loanId: loan._id, isUpfrontInterest: true },
          { loanId: loan._id, principalAllocationPaise: 0, interestAllocationPaise: loan.upfrontInterestPaise },
          { loanCode: loan.loanId, principalAllocationPaise: 0, interestAllocationPaise: loan.upfrontInterestPaise },
        ],
      });

      if (existing) {
        if (!existing.isUpfrontInterest || !existing.accountedInDisbursement || existing.collectionType !== 'UPFRONT_INTEREST') {
          if (!dryRun) {
            await Collection.findByIdAndUpdate(existing._id, {
              isUpfrontInterest: true,
              accountedInDisbursement: true,
              collectionType: 'UPFRONT_INTEREST',
              vattiType: loan.vattiType || existing.vattiType || 'MONTHLY',
              idempotencyKey: existing.idempotencyKey || `UPFRONT-${loan.loanId}-${loan._id}`,
            });
          }
          report.loansFixed += 1;
        }

        if (!dryRun && (!loan.upfrontCollectionId || !loan.upfrontReceiptNumber)) {
          await Loan.findByIdAndUpdate(loan._id, {
            upfrontCollectionId: existing._id,
            upfrontReceiptNumber: existing.receiptNumber,
          });
        }
      } else {
        if (dryRun) {
          report.loansFixed += 1;
          report.createdCollections.push({
            type: 'LOAN',
            loanCode: loan.loanId,
            customerName: loan.customerName,
            vattiType: loan.vattiType,
            upfrontInterestRupees: toRupees(loan.upfrontInterestPaise),
            action: 'WOULD_CREATE_UPFRONT_COLLECTION',
          });
          continue;
        }

        const upfrontColId = await generateCollectionId();
        const upfrontReceiptNum = await generateReceiptNumber();
        const txnId = await generateTransactionId();

        // Clean up any stale collection with matching idempotency key not belonging to this loan
        await Collection.deleteMany({
          idempotencyKey: { $in: [`UPFRONT-${loan.loanId}`, `UPFRONT-${loan.loanId}-${loan._id}`] },
          loanId: { $ne: loan._id },
        });

        const newCol = new Collection({
          collectionId: upfrontColId,
          receiptNumber: upfrontReceiptNum,
          loanId: loan._id,
          loanCode: loan.loanId,
          customerId: loan.customerId,
          customerName: loan.customerName,
          paymentDate: loan.startDate || loan.createdAt || new Date(),
          paymentMethod: loan.disbursementPaymentMethod || 'CASH',
          totalAmountPaise: loan.upfrontInterestPaise,
          principalAllocationPaise: 0,
          interestAllocationPaise: loan.upfrontInterestPaise,
          penaltyAllocationPaise: 0,
          isUpfrontInterest: true,
          accountedInDisbursement: true,
          collectionType: 'UPFRONT_INTEREST',
          vattiType: loan.vattiType || 'MONTHLY',
          previousOutstandingPrincipalPaise: loan.grossPrincipalPaise || loan.principalPaise,
          previousOutstandingInterestPaise: loan.upfrontInterestPaise,
          remainingPrincipalPaise: loan.grossPrincipalPaise || loan.principalPaise,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: 'admin',
          remarks: 'Upfront interest deducted during disbursement (Historical Reconciliation)',
          idempotencyKey: `UPFRONT-${loan.loanId}-${loan._id}`,
        });

        await newCol.save();

        await Loan.findByIdAndUpdate(loan._id, {
          upfrontCollectionId: newCol._id,
          upfrontReceiptNumber: upfrontReceiptNum,
        });

        // Ensure ledger transaction exists without duplicate interest credit
        const existingInterestTxn = await Transaction.findOne({
          loanId: loan._id,
          interestCreditPaise: { $gt: 0 },
          type: { $ne: 'RENEWAL_INTEREST' },
        });

        if (existingInterestTxn) {
          if (!existingInterestTxn.collectionId || !existingInterestTxn.referenceId) {
            await Transaction.findByIdAndUpdate(existingInterestTxn._id, {
              collectionId: newCol._id,
              referenceId: upfrontReceiptNum,
            });
          }
        } else {
          const colTxn = new Transaction({
            transactionId: txnId,
            customerId: loan.customerId,
            loanId: loan._id,
            collectionId: newCol._id,
            date: loan.startDate || loan.createdAt || new Date(),
            type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
            principalDebitPaise: 0,
            principalCreditPaise: 0,
            interestDebitPaise: 0,
            interestCreditPaise: loan.upfrontInterestPaise,
            penaltyDebitPaise: 0,
            penaltyCreditPaise: 0,
            balancePrincipalPaise: loan.grossPrincipalPaise || loan.principalPaise,
            balanceInterestPaise: 0,
            balancePenaltyPaise: 0,
            balanceTotalPaise: loan.grossPrincipalPaise || loan.principalPaise,
            remarks: `Collection [${upfrontReceiptNum}]: Upfront interest deducted during disbursement`,
            referenceId: upfrontReceiptNum,
            performedBy: 'admin',
          });
          await colTxn.save();
        }

        report.loansFixed += 1;
        report.createdCollections.push({
          type: 'LOAN',
          loanCode: loan.loanId,
          receiptNumber: upfrontReceiptNum,
          customerName: loan.customerName,
          upfrontInterestRupees: toRupees(loan.upfrontInterestPaise),
          action: 'CREATED_UPFRONT_COLLECTION',
        });
      }
    }

    // 2. Process Daily Collection Accounts with Scheme A (Upfront Deduction)
    const dcAccounts = await DailyCollectionAccount.find({
      scheme: 'UPFRONT_DEDUCTION',
      upfrontInterestPaise: { $gt: 0 },
      status: { $nin: ['CANCELLED', 'REVERSED'] },
    }).lean();

    report.dcAccountsScanned = dcAccounts.length;

    for (const dc of dcAccounts) {
      const targetLoanCode = dc.accountId || dc.loanCode || `CPN-DC-${dc._id.toString().slice(-4)}`;
      const existing = await Collection.findOne({
        $or: [
          ...(dc.upfrontReceiptNumber ? [{ receiptNumber: dc.upfrontReceiptNumber }] : []),
          { idempotencyKey: `UPFRONT-${dc.accountId}` },
          { idempotencyKey: `UPFRONT-${dc.accountId}-${dc._id}` },
          ...(dc.loanId ? [{ idempotencyKey: `UPFRONT-${dc.loanCode}-${dc.loanId}` }] : []),
          { loanCode: targetLoanCode, isUpfrontInterest: true },
          ...(dc.loanId ? [{ loanId: dc.loanId, isUpfrontInterest: true }] : []),
          { loanCode: targetLoanCode, principalAllocationPaise: 0, interestAllocationPaise: dc.upfrontInterestPaise },
          ...(dc.loanId ? [{ loanId: dc.loanId, principalAllocationPaise: 0, interestAllocationPaise: dc.upfrontInterestPaise }] : []),
        ],
      });

      if (existing) {
        if (!existing.isUpfrontInterest || !existing.accountedInDisbursement || existing.collectionType !== 'UPFRONT_INTEREST') {
          if (!dryRun) {
            await Collection.findByIdAndUpdate(existing._id, {
              isUpfrontInterest: true,
              accountedInDisbursement: true,
              collectionType: 'UPFRONT_INTEREST',
              vattiType: 'DAILY_COLLECTION',
              idempotencyKey: existing.idempotencyKey || `UPFRONT-${dc.accountId}-${dc._id}`,
            });
          }
          report.dcAccountsFixed += 1;
        }

        if (!dryRun) {
          if (!dc.upfrontReceiptNumber) {
            await DailyCollectionAccount.findByIdAndUpdate(dc._id, {
              upfrontReceiptNumber: existing.receiptNumber,
            });
          }
          if (dc.loanId) {
            await Loan.findByIdAndUpdate(dc.loanId, {
              upfrontCollectionId: existing._id,
              upfrontReceiptNumber: existing.receiptNumber,
            });
          }
        }
      } else {
        if (dryRun) {
          report.dcAccountsFixed += 1;
          report.createdCollections.push({
            type: 'DAILY_COLLECTION',
            accountCode: dc.accountId,
            customerName: dc.customerName,
            upfrontInterestRupees: toRupees(dc.upfrontInterestPaise),
            action: 'WOULD_CREATE_UPFRONT_COLLECTION',
          });
          continue;
        }

        const upfrontColId = await generateCollectionId();
        const upfrontReceiptNum = await generateReceiptNumber();
        const txnId = await generateTransactionId();

        // Clean up any stale collection with matching idempotency key not belonging to this account
        await Collection.deleteMany({
          idempotencyKey: { $in: [`UPFRONT-${dc.accountId}`, `UPFRONT-${dc.accountId}-${dc._id}`] },
          loanId: { $nin: [dc._id, dc.loanId].filter(Boolean) },
        });

        const newCol = new Collection({
          collectionId: upfrontColId,
          receiptNumber: upfrontReceiptNum,
          loanId: dc.loanId || null,
          loanCode: targetLoanCode,
          customerId: dc.customerId,
          customerName: dc.customerName,
          paymentDate: dc.startDate || dc.createdAt || new Date(),
          paymentMethod: 'CASH',
          totalAmountPaise: dc.upfrontInterestPaise,
          principalAllocationPaise: 0,
          interestAllocationPaise: dc.upfrontInterestPaise,
          penaltyAllocationPaise: 0,
          isUpfrontInterest: true,
          accountedInDisbursement: true,
          collectionType: 'UPFRONT_INTEREST',
          vattiType: 'DAILY_COLLECTION',
          previousOutstandingPrincipalPaise: dc.grossPrincipalPaise || 0,
          previousOutstandingInterestPaise: dc.upfrontInterestPaise || 0,
          remainingPrincipalPaise: dc.grossPrincipalPaise || 0,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: 'admin',
          remarks: 'Upfront interest deducted during disbursement (Historical Reconciliation)',
          idempotencyKey: `UPFRONT-${dc.accountId}-${dc._id}`,
        });

        await newCol.save();

        await DailyCollectionAccount.findByIdAndUpdate(dc._id, {
          upfrontReceiptNumber: upfrontReceiptNum,
        });

        if (dc.loanId) {
          await Loan.findByIdAndUpdate(dc.loanId, {
            upfrontCollectionId: newCol._id,
            upfrontReceiptNumber: upfrontReceiptNum,
          });

          const existingInterestTxn = await Transaction.findOne({
            loanId: dc.loanId,
            interestCreditPaise: { $gt: 0 },
          });

          if (existingInterestTxn) {
            if (!existingInterestTxn.collectionId || !existingInterestTxn.referenceId) {
              await Transaction.findByIdAndUpdate(existingInterestTxn._id, {
                collectionId: newCol._id,
                referenceId: upfrontReceiptNum,
              });
            }
          } else {
            const colTxn = new Transaction({
              transactionId: txnId,
              customerId: dc.customerId,
              loanId: dc.loanId,
              collectionId: newCol._id,
              date: dc.startDate || dc.createdAt || new Date(),
              type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
              principalDebitPaise: 0,
              principalCreditPaise: 0,
              interestDebitPaise: 0,
              interestCreditPaise: dc.upfrontInterestPaise,
              penaltyDebitPaise: 0,
              penaltyCreditPaise: 0,
              balancePrincipalPaise: dc.grossPrincipalPaise || 0,
              balanceInterestPaise: 0,
              balancePenaltyPaise: 0,
              balanceTotalPaise: dc.grossPrincipalPaise || 0,
              remarks: `Collection [${upfrontReceiptNum}]: Upfront interest deducted during disbursement for Daily Collection ${dc.accountId}`,
              referenceId: upfrontReceiptNum,
              performedBy: 'admin',
            });
            await colTxn.save();
          }
        }

        report.dcAccountsFixed += 1;
        report.createdCollections.push({
          type: 'DAILY_COLLECTION',
          accountCode: dc.accountId,
          receiptNumber: upfrontReceiptNum,
          customerName: dc.customerName,
          upfrontInterestRupees: toRupees(dc.upfrontInterestPaise),
          action: 'CREATED_UPFRONT_COLLECTION',
        });
      }
    }
  } catch (err) {
    console.error('[syncHistoricalUpfrontCollections Error]', err.message);
    report.errors.push(err.message);
  }

  return report;
}

module.exports = {
  syncHistoricalUpfrontCollections,
};
