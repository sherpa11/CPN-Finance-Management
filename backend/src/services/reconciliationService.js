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
    // Quick pre-flight check: Are there ANY loans or DC accounts that might be missing an upfront collection?
    if (!dryRun) {
      const hasUnsyncedLoan = await Loan.exists({
        upfrontInterestPaise: { $gt: 0 },
        status: { $nin: ['CANCELLED', 'REVERSED'] },
        $or: [
          { upfrontCollectionId: { $exists: false } },
          { upfrontCollectionId: null },
        ],
      });
      const hasUnsyncedDc = await DailyCollectionAccount.exists({
        scheme: 'UPFRONT_DEDUCTION',
        upfrontInterestPaise: { $gt: 0 },
        status: { $nin: ['CANCELLED', 'REVERSED'] },
        $or: [
          { upfrontReceiptNumber: { $exists: false } },
          { upfrontReceiptNumber: null },
        ],
      });

      if (!hasUnsyncedLoan && !hasUnsyncedDc) {
        return report;
      }
    }
    // 1. Process Monthly and Daily Loans with Upfront Interest
    const loans = await Loan.find({
      upfrontInterestPaise: { $gt: 0 },
      status: { $nin: ['CANCELLED', 'REVERSED'] },
    }).lean();

    report.loansScanned = loans.length;

    for (const loan of loans) {
      const existing = await Collection.findOne({
        $or: [
          { idempotencyKey: `UPFRONT-${loan.loanId}` },
          { loanId: loan._id, isUpfrontInterest: true },
        ],
      });

      if (!existing) {
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
          idempotencyKey: `UPFRONT-${loan.loanId}`,
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
      } else if (!loan.upfrontCollectionId || !loan.upfrontReceiptNumber) {
        if (!dryRun) {
          await Loan.findByIdAndUpdate(loan._id, {
            upfrontCollectionId: existing._id,
            upfrontReceiptNumber: existing.receiptNumber,
          });
        }
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
          { idempotencyKey: `UPFRONT-${dc.accountId}` },
          { loanCode: targetLoanCode, isUpfrontInterest: true },
          ...(dc.loanId ? [{ loanId: dc.loanId, isUpfrontInterest: true }] : []),
        ],
      });

      if (!existing) {
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
          idempotencyKey: `UPFRONT-${dc.accountId}`,
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
      } else if (!dc.upfrontReceiptNumber) {
        if (!dryRun) {
          await DailyCollectionAccount.findByIdAndUpdate(dc._id, {
            upfrontReceiptNumber: existing.receiptNumber,
          });
          if (dc.loanId) {
            await Loan.findByIdAndUpdate(dc.loanId, {
              upfrontCollectionId: existing._id,
              upfrontReceiptNumber: existing.receiptNumber,
            });
          }
        }
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
