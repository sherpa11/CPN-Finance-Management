const Loan = require('../models/Loan');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const Collection = require('../models/Collection');
const CalculationConfiguration = require('../models/CalculationConfiguration');
const { DateTime } = require('luxon');
const { logAuditEvent } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionHelper');
const {
  toPaise,
  toRupees,
  formatINR,
  calculateLoanInterest,
  calculateDailyPenalty,
  getKolkataDate,
} = require('../services/calculationEngine');
const { evaluateDueNotifications } = require('../services/notificationService');
const {
  generateCollectionId,
  generateReceiptNumber,
} = require('./collectionController');
const CONSTANTS = require('../config/constants');
const { escapeRegex } = require('../utils/sanitize');
const { invalidateDashboardCache } = require('./dashboardController');

// Generate sequential Loan ID e.g. CPN-LN-0001 (collision-safe across Loan, Collection, and Transaction)
async function generateLoanId() {
  const [loanList, collectionList, txnList] = await Promise.all([
    Loan.find({}, { loanId: 1 }).lean(),
    Collection.find({}, { loanCode: 1, idempotencyKey: 1 }).lean(),
    Transaction.find({ referenceId: { $regex: /^CPN-LN-\d+/ } }, { referenceId: 1 }).lean(),
  ]);

  let maxSeq = 0;
  for (const l of loanList) {
    if (l.loanId) {
      const match = l.loanId.match(/CPN-LN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  for (const c of collectionList) {
    if (c.loanCode) {
      const match = c.loanCode.match(/CPN-LN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
    if (c.idempotencyKey) {
      const match = c.idempotencyKey.match(/UPFRONT-CPN-LN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  for (const t of txnList) {
    if (t.referenceId) {
      const match = t.referenceId.match(/CPN-LN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  let nextSeq = maxSeq + 1;
  let candidate = `CPN-LN-${String(nextSeq).padStart(4, '0')}`;

  while (
    (await Loan.exists({ loanId: candidate })) ||
    (await Collection.exists({
      $or: [
        { loanCode: candidate },
        { idempotencyKey: `UPFRONT-${candidate}` },
        { idempotencyKey: { $regex: new RegExp(`^UPFRONT-${candidate}`) } },
      ],
    }))
  ) {
    nextSeq++;
    candidate = `CPN-LN-${String(nextSeq).padStart(4, '0')}`;
  }

  return candidate;
}

async function generateTransactionId(offset = 0) {
  const txnList = await Transaction.find({}, { transactionId: 1 }).lean();
  let maxSeq = 0;
  for (const t of txnList) {
    if (t.transactionId) {
      const match = t.transactionId.match(/CPN-TXN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  }

  let nextSeq = maxSeq + 1 + offset;
  let candidate = `CPN-TXN-${String(nextSeq).padStart(5, '0')}`;

  while (await Transaction.exists({ transactionId: candidate })) {
    nextSeq++;
    candidate = `CPN-TXN-${String(nextSeq).padStart(5, '0')}`;
  }

  return candidate;
}

/**
 * Preview Loan Calculation before saving
 */
const previewLoan = async (req, res, next) => {
  try {
    const vattiType = req.body.financeType || req.body.vattiType;
    const { principalAmount, interestRatePercent, startDate, dueDate, interestAmount, upfrontInterestAmount } = req.body;

    if (!vattiType || !principalAmount || interestRatePercent === undefined || !startDate || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters for loan preview',
      });
    }

    const principalPaise = toPaise(principalAmount);
    const rate = Number(interestRatePercent);

    // Fetch active calculation config
    const configDoc = await CalculationConfiguration.findOne({ configType: vattiType, isActive: true });
    const config = configDoc ? configDoc.settings : {};

    const calculation = calculateLoanInterest({
      vattiType,
      principalPaise,
      ratePercent: rate,
      startDate: new Date(startDate),
      asOfDate: new Date(dueDate),
      config,
    });

    // Support admin-adjusted / entered upfront interest amount
    const customAmt = interestAmount !== undefined && interestAmount !== '' ? interestAmount : upfrontInterestAmount;
    const hasCustomInterest = customAmt !== undefined && customAmt !== '' && !isNaN(customAmt);
    const expectedInterestPaise = hasCustomInterest ? toPaise(customAmt) : calculation.interestPaise;
    const isUpfrontDeduction = vattiType === 'MONTHLY' || vattiType === 'DAILY' || !!calculation.isUpfrontDeduction;
    const netGivenPaise = isUpfrontDeduction ? Math.max(0, principalPaise - expectedInterestPaise) : principalPaise;

    res.json({
      success: true,
      preview: {
        financeType: vattiType,
        vattiType,
        principalAmount: toRupees(principalPaise),
        principalPaise,
        interestRatePercent: rate,
        startDate: getKolkataDate(startDate).toISODate(),
        dueDate: getKolkataDate(dueDate).toISODate(),
        expectedInterestRupees: toRupees(expectedInterestPaise),
        expectedInterestPaise,
        netAmountGivenRupees: toRupees(netGivenPaise),
        netAmountGivenPaise: netGivenPaise,
        expectedTotalPayableRupees: toRupees(calculation.totalPayablePaise),
        expectedTotalPayablePaise: calculation.totalPayablePaise,
        dailyInstalmentRupees: calculation.dailyInstalmentPaise ? toRupees(calculation.dailyInstalmentPaise) : undefined,
        dailyInstalmentPaise: calculation.dailyInstalmentPaise || undefined,
        durationDays: calculation.eligibleDays || calculation.durationDays || undefined,
        isUpfrontDeduction,
        eligibleUnits: calculation.eligibleMonths || calculation.eligibleDays || 0,
        unitLabel: vattiType === 'MONTHLY' ? 'Months' : vattiType === 'DAILY' ? 'Days' : 'Units',
        isPendingOwnerConfirmation: !!calculation.isPendingOwnerConfirmation,
        status: calculation.status,
        message: calculation.message,
        details: calculation.calculationDetails,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create New Finance / Loan
 */
const createLoan = async (req, res, next) => {
  try {
    const vattiType = req.body.financeType || req.body.vattiType;
    const {
      customerId,
      principalAmount,
      interestRatePercent,
      startDate,
      dueDate,
      remarks,
      disbursementPaymentMethod,
    } = req.body;

    if (!customerId || !vattiType || !principalAmount || interestRatePercent === undefined || !startDate || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'All loan fields (Customer, Finance Type, Principal, Interest Rate, Start Date, Due Date) are required.',
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Selected customer not found' });
    }

    const principalPaise = toPaise(principalAmount);
    if (principalPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Principal amount must be greater than zero' });
    }

    const rate = Number(interestRatePercent);
    if (rate < 0) {
      return res.status(400).json({ success: false, message: 'Interest rate cannot be negative' });
    }

    // Get active config snapshot
    const configDoc = await CalculationConfiguration.findOne({ configType: vattiType, isActive: true });
    const configSnapshot = configDoc ? configDoc.settings : {};

    // Initial calculation to due date
    const initialCalc = calculateLoanInterest({
      vattiType,
      principalPaise,
      ratePercent: rate,
      startDate: new Date(startDate),
      asOfDate: new Date(dueDate),
      config: configSnapshot,
    });

    const loanId = await generateLoanId();
    const txnId = await generateTransactionId();

    const isMonthly = vattiType === CONSTANTS.VATTI_TYPES.MONTHLY;
    const isDaily = vattiType === CONSTANTS.VATTI_TYPES.DAILY;
    const isUpfrontDeduction = isMonthly || isDaily;
    
    // Support admin-adjusted / custom interest amount entered during loan creation
    const customAmt = req.body.interestAmount !== undefined && req.body.interestAmount !== ''
      ? req.body.interestAmount
      : req.body.upfrontInterestAmount;
    const hasCustomInterest = customAmt !== undefined && customAmt !== '' && !isNaN(customAmt);
    const upfrontInterestPaise = isUpfrontDeduction
      ? (hasCustomInterest ? toPaise(customAmt) : (initialCalc.upfrontInterestPaise || initialCalc.interestPaise || 0))
      : 0;
    const netDisbursedPaise = isUpfrontDeduction ? Math.max(0, principalPaise - upfrontInterestPaise) : principalPaise;

    // For both Monthly and Daily: customer repays the full original principal P (e.g. 5L)
    const initialOutstandingPrincipalPaise = principalPaise;
    const dailyDurationDays = isDaily ? (initialCalc.eligibleDays || initialCalc.durationDays || 10) : undefined;
    const dailyInstalmentPaise = isDaily ? (initialCalc.dailyInstalmentPaise || Math.floor(principalPaise / (dailyDurationDays || 1))) : undefined;

    let upfrontColId = null;
    let upfrontReceiptNum = null;
    let colTxnId = null;
    if (isUpfrontDeduction && upfrontInterestPaise > 0) {
      upfrontColId = await generateCollectionId();
      upfrontReceiptNum = await generateReceiptNumber();
      colTxnId = await generateTransactionId(1);
    }

    const result = await runInTransaction(async (session) => {
      // 1. Create Loan Document
      const loan = new Loan({
        loanId,
        customerId: customer._id,
        customerCode: customer.customerId,
        customerName: customer.name,
        customerMobile: customer.mobileNumber,
        vattiType,
        principalPaise,
        grossPrincipalPaise: principalPaise,
        interestRatePercent: rate,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        status: CONSTANTS.LOAN_STATUS.ACTIVE,
        calculationConfigSnapshot: configSnapshot,
        outstandingPrincipalPaise: initialOutstandingPrincipalPaise,
        accruedInterestPaise: isUpfrontDeduction ? upfrontInterestPaise : (initialCalc.interestPaise || 0),
        outstandingInterestPaise: isUpfrontDeduction ? 0 : (initialCalc.interestPaise || 0),
        totalPrincipalPaidPaise: 0,
        totalInterestPaidPaise: isUpfrontDeduction ? upfrontInterestPaise : 0,
        upfrontInterestPaise: isUpfrontDeduction ? upfrontInterestPaise : 0,
        netDisbursementPaise: isUpfrontDeduction ? netDisbursedPaise : principalPaise,
        renewalCount: 0,
        currentPeriodStartDate: new Date(startDate),
        currentPeriodDueDate: new Date(dueDate),
        renewalHistory: [],
        dailyInstalmentPaise: isDaily ? dailyInstalmentPaise : undefined,
        totalDurationDays: isDaily ? dailyDurationDays : undefined,
        disbursementPaymentMethod: disbursementPaymentMethod || 'CASH',
        remarks: remarks || '',
        monthlyFinanceDetails: isMonthly ? {
          grossPrincipalPaise: principalPaise,
          upfrontInterestPaise,
          netDisbursedPaise,
          totalPayablePaise: initialOutstandingPrincipalPaise,
          monthlyRatePercent: rate,
          eligibleMonths: initialCalc.eligibleMonths,
        } : undefined,
        dailyFinanceDetails: isDaily ? {
          grossPrincipalPaise: principalPaise,
          upfrontInterestPaise,
          upfrontInterestPercent: rate,
          netDisbursedPaise,
          dailyInstalmentPaise,
          totalDurationDays: dailyDurationDays,
          dailyRepaymentTargetPaise: principalPaise,
        } : undefined,
        meaterConfig: vattiType === CONSTANTS.VATTI_TYPES.MEATER ? {
          status: 'PENDING_CONFIRMATION',
          note: 'Formula pending owner confirmation as per business specification',
        } : undefined,
      });

      await loan.save(session ? { session } : undefined);

      // 2. Create Initial Ledger Disbursement Transaction
      const txn = new Transaction({
        transactionId: txnId,
        customerId: customer._id,
        loanId: loan._id,
        date: new Date(startDate),
        type: CONSTANTS.TRANSACTION_TYPES.LOAN_DISBURSEMENT,
        principalDebitPaise: initialOutstandingPrincipalPaise,
        principalCreditPaise: 0,
        interestDebitPaise: 0,
        interestCreditPaise: 0,
        balancePrincipalPaise: initialOutstandingPrincipalPaise,
        balanceInterestPaise: 0,
        balanceTotalPaise: initialOutstandingPrincipalPaise,
        remarks: isDaily
          ? `Disbursed Daily loan ${loan.loanId} to ${customer.name} (Gross Principal: ₹${toRupees(principalPaise)}, Upfront Interest Received: ₹${toRupees(upfrontInterestPaise)}, Net Cash Given: ₹${toRupees(netDisbursedPaise)}, Daily Repayment Target: ₹${toRupees(principalPaise)}, Daily Instalment: ₹${toRupees(dailyInstalmentPaise)}/day for ${dailyDurationDays} days)`
          : isMonthly
          ? `Disbursed Monthly loan ${loan.loanId} to ${customer.name} (Gross Principal: ₹${toRupees(principalPaise)}, Upfront Interest Deducted: ₹${toRupees(upfrontInterestPaise)}, Net Cash Given: ₹${toRupees(netDisbursedPaise)}, Total Repayable Cash: ₹${toRupees(principalPaise)})`
          : `Disbursed ${vattiType} loan ${loan.loanId} to ${customer.name}`,
        referenceId: loan.loanId,
        performedBy: req.user.username,
      });

      await txn.save(session ? { session } : undefined);

      // 2b. Auto-Record Confirmed Upfront Interest Collection
      if (isUpfrontDeduction && upfrontInterestPaise > 0) {
        loan.upfrontReceiptNumber = upfrontReceiptNum;

        // Clean up any stale orphan collections sharing this idempotency key
        await Collection.deleteMany({
          idempotencyKey: { $in: [`UPFRONT-${loan.loanId}`, `UPFRONT-${loan.loanId}-${loan._id}`] },
          loanId: { $ne: loan._id },
        });

        const upfrontCollection = new Collection({
          collectionId: upfrontColId,
          receiptNumber: upfrontReceiptNum,
          loanId: loan._id,
          loanCode: loan.loanId,
          customerId: customer._id,
          customerName: customer.name,
          paymentDate: new Date(startDate),
          paymentMethod: disbursementPaymentMethod || 'CASH',
          totalAmountPaise: upfrontInterestPaise,
          principalAllocationPaise: 0,
          interestAllocationPaise: upfrontInterestPaise,
          penaltyAllocationPaise: 0,
          isUpfrontInterest: true,
          accountedInDisbursement: true,
          collectionType: 'UPFRONT_INTEREST',
          vattiType: loan.vattiType,
          previousOutstandingPrincipalPaise: initialOutstandingPrincipalPaise,
          previousOutstandingInterestPaise: upfrontInterestPaise,
          remainingPrincipalPaise: initialOutstandingPrincipalPaise,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: req.user.username,
          remarks: 'Upfront interest deducted during disbursement',
          idempotencyKey: `UPFRONT-${loan.loanId}-${loan._id}`,
        });

        await upfrontCollection.save(session ? { session } : undefined);
        loan.upfrontCollectionId = upfrontCollection._id;
        await loan.save(session ? { session } : undefined);

        // Linked collection ledger transaction
        const colTxn = new Transaction({
          transactionId: colTxnId,
          customerId: customer._id,
          loanId: loan._id,
          collectionId: upfrontCollection._id,
          date: new Date(startDate),
          type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
          principalDebitPaise: 0,
          principalCreditPaise: 0,
          interestDebitPaise: 0,
          interestCreditPaise: upfrontInterestPaise,
          penaltyDebitPaise: 0,
          penaltyCreditPaise: 0,
          balancePrincipalPaise: initialOutstandingPrincipalPaise,
          balanceInterestPaise: 0,
          balancePenaltyPaise: 0,
          balanceTotalPaise: initialOutstandingPrincipalPaise,
          remarks: `Collection [${upfrontReceiptNum}]: Upfront interest deducted during disbursement`,
          referenceId: upfrontReceiptNum,
          performedBy: req.user.username,
        });

        await colTxn.save(session ? { session } : undefined);
      }

      // 3. Update Customer Financial Aggregates
      customer.totalLentPaise = (customer.totalLentPaise || 0) + netDisbursedPaise;
      customer.outstandingPrincipalPaise = (customer.outstandingPrincipalPaise || 0) + initialOutstandingPrincipalPaise;
      customer.totalInterestPaidPaise = (customer.totalInterestPaidPaise || 0) + (isUpfrontDeduction ? upfrontInterestPaise : 0);
      customer.outstandingInterestPaise = (customer.outstandingInterestPaise || 0) + (isUpfrontDeduction ? 0 : (initialCalc.interestPaise || 0));
      customer.activeLoanCount = (customer.activeLoanCount || 0) + 1;
      customer.totalLoanCount = (customer.totalLoanCount || 0) + 1;

      await customer.save(session ? { session } : undefined);

      return loan;
    });

    // 4. Audit Log
    await logAuditEvent({
      action: 'CREATE_LOAN',
      entityType: 'LOAN',
      entityId: result._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      newState: result.toObject(),
      details: `Created new ${vattiType} loan ${result.loanId} for customer ${customer.name} with principal ₹${toRupees(principalPaise)} at ${rate}%`,
    });

    // 5. Evaluate Notifications immediately
    evaluateDueNotifications().catch((err) => {
      console.error('[Notification Trigger Error]', err.message);
    });

    invalidateDashboardCache();

    res.status(201).json({
      success: true,
      message: `Finance loan ${result.loanId} created successfully`,
      loan: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List Loans with search & filters
 */
const listLoans = async (req, res, next) => {
  try {
    const vattiType = req.query.financeType || req.query.vattiType;
    const { customerId, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (customerId) query.customerId = customerId;
    if (vattiType && vattiType !== 'ALL') {
      if (vattiType === 'DAILY_COLLECTION' || vattiType === 'MEATER') {
        query.vattiType = { $in: ['DAILY_COLLECTION', 'MEATER'] };
      } else {
        query.vattiType = vattiType;
      }
    }
    if (status && status !== 'ALL') {
      query.status = status.includes(',')
        ? { $in: status.split(',').map((s) => s.trim()) }
        : status;
    }

    if (search && search.trim()) {
      const escaped = escapeRegex(search.trim());
      const searchRegex = new RegExp(escaped, 'i');
      query.$or = [
        { loanId: searchRegex },
        { customerName: searchRegex },
        { customerMobile: searchRegex },
        { customerCode: searchRegex },
      ];
    }

    const total = await Loan.countDocuments(query);
    const loans = await Loan.find(query)
      .populate('customerId', 'name mobileNumber customerId address')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const enrichedLoans = loans.map((loan) => {
      const isDailyCollection = loan.vattiType === 'DAILY_COLLECTION' || loan.vattiType === 'MEATER';
      const todayKolkata = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
      const dueKolkata = DateTime.fromJSDate(loan.dueDate, { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');
      const diffDays = Math.round(dueKolkata.diff(todayKolkata, 'days').days);
      const isDueForRenewal = diffDays <= 0 && loan.outstandingPrincipalPaise > 0;
      const currentPeriodInterestPaise = Math.round((loan.outstandingPrincipalPaise * loan.interestRatePercent) / 100);

      if (isDailyCollection) {
        const dailyInstalmentPaise = loan.dailyInstalmentPaise || (loan.totalDurationDays ? Math.floor((loan.principalPaise || 0) / loan.totalDurationDays) : Math.floor((loan.principalPaise || 0) / 10));
        const penaltyCalc = calculateDailyPenalty({
          dailyRepaymentAmountPaise: dailyInstalmentPaise,
          dueDate: loan.dueDate,
          asOfDate: new Date(),
          isFullyRepaid: loan.outstandingPrincipalPaise === 0,
          fullRepaymentDate: loan.settledDate || null,
          penaltyPaidPaise: loan.penaltyPaidPaise || 0,
          penaltyRatePercent: loan.penaltyRatePercent || 2.0,
        });
        return {
          ...loan,
          renewalCount: loan.renewalCount || 0,
          currentPeriodStartDate: loan.currentPeriodStartDate || loan.startDate,
          currentPeriodDueDate: loan.currentPeriodDueDate || loan.dueDate,
          currentPeriodInterestRupees: toRupees(currentPeriodInterestPaise),
          currentPeriodInterestPaise,
          isDueForRenewal,
          penaltyBreakdown: {
            isPenaltyApplicable: true,
            penaltyRatePercent: penaltyCalc.penaltyRatePercent,
            dailyRepaymentAmountRupees: toRupees(penaltyCalc.dailyRepaymentAmountPaise),
            dailyPenaltyRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
            overdueDays: penaltyCalc.overdueDays,
            cumulativePenaltyRupees: toRupees(penaltyCalc.cumulativePenaltyPaise),
            penaltyPaidRupees: toRupees(penaltyCalc.penaltyPaidPaise),
            penaltyOutstandingRupees: toRupees(penaltyCalc.penaltyOutstandingPaise),
            totalAmountToCloseRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + penaltyCalc.penaltyOutstandingPaise),
            dailyRepaymentAmountPaise: penaltyCalc.dailyRepaymentAmountPaise,
            dailyPenaltyPaise: penaltyCalc.dailyPenaltyPaise,
            cumulativePenaltyPaise: penaltyCalc.cumulativePenaltyPaise,
            penaltyPaidPaise: penaltyCalc.penaltyPaidPaise,
            penaltyOutstandingPaise: penaltyCalc.penaltyOutstandingPaise,
            totalAmountToClosePaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + penaltyCalc.penaltyOutstandingPaise,
          },
        };
      }

      // For Monthly Finance and Daily Finance (Renewal Workflow): Strictly NO penalty under any circumstances
      return {
        ...loan,
        renewalCount: loan.renewalCount || 0,
        currentPeriodStartDate: loan.currentPeriodStartDate || loan.startDate,
        currentPeriodDueDate: loan.currentPeriodDueDate || loan.dueDate,
        currentPeriodInterestRupees: toRupees(currentPeriodInterestPaise),
        currentPeriodInterestPaise,
        isDueForRenewal,
        penaltyBreakdown: {
          isPenaltyApplicable: false,
          penaltyRatePercent: 0,
          dailyRepaymentAmountRupees: 0,
          dailyPenaltyRupees: 0,
          overdueDays: 0,
          cumulativePenaltyRupees: 0,
          penaltyPaidRupees: 0,
          penaltyOutstandingRupees: 0,
          totalAmountToCloseRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise),
          dailyRepaymentAmountPaise: 0,
          dailyPenaltyPaise: 0,
          cumulativePenaltyPaise: 0,
          penaltyPaidPaise: 0,
          penaltyOutstandingPaise: 0,
          totalAmountToClosePaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise,
        },
      };
    });

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      loans: enrichedLoans,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Loan by ID with live calculations and transaction history
 */
const getLoanById = async (req, res, next) => {
  try {
    const loan = await Loan.findById(req.params.id).populate('customerId');
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    // Transactions for this loan
    const transactions = await Transaction.find({ loanId: loan._id }).sort({ date: 1, createdAt: 1 }).lean();

    // Live calculation as of today
    const liveCalc = calculateLoanInterest({
      vattiType: loan.vattiType,
      principalPaise: loan.outstandingPrincipalPaise,
      ratePercent: loan.interestRatePercent,
      startDate: loan.startDate,
      asOfDate: new Date(),
      config: loan.calculationConfigSnapshot,
    });

    const isDailyCollection = loan.vattiType === 'DAILY_COLLECTION' || loan.vattiType === 'MEATER';
    let penaltyCalc = null;
    if (isDailyCollection) {
      const dailyInstalmentPaise = loan.dailyInstalmentPaise || (loan.totalDurationDays ? Math.floor((loan.principalPaise || 0) / loan.totalDurationDays) : Math.floor((loan.principalPaise || 0) / 10));
      penaltyCalc = calculateDailyPenalty({
        dailyRepaymentAmountPaise: dailyInstalmentPaise,
        dueDate: loan.dueDate,
        asOfDate: new Date(),
        isFullyRepaid: loan.outstandingPrincipalPaise === 0,
        fullRepaymentDate: loan.settledDate || null,
        penaltyPaidPaise: loan.penaltyPaidPaise || 0,
        penaltyRatePercent: loan.penaltyRatePercent || 2.0,
      });
    }

    const penaltyBreakdown = isDailyCollection && penaltyCalc ? {
      isPenaltyApplicable: true,
      penaltyRatePercent: penaltyCalc.penaltyRatePercent,
      dailyRepaymentAmountRupees: toRupees(penaltyCalc.dailyRepaymentAmountPaise),
      dailyPenaltyRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
      overdueDays: penaltyCalc.overdueDays,
      cumulativePenaltyRupees: toRupees(penaltyCalc.cumulativePenaltyPaise),
      penaltyPaidRupees: toRupees(penaltyCalc.penaltyPaidPaise),
      penaltyOutstandingRupees: toRupees(penaltyCalc.penaltyOutstandingPaise),
      totalAmountToCloseRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + penaltyCalc.penaltyOutstandingPaise),
      dailyRepaymentAmountPaise: penaltyCalc.dailyRepaymentAmountPaise,
      dailyPenaltyPaise: penaltyCalc.dailyPenaltyPaise,
      cumulativePenaltyPaise: penaltyCalc.cumulativePenaltyPaise,
      penaltyPaidPaise: penaltyCalc.penaltyPaidPaise,
      penaltyOutstandingPaise: penaltyCalc.penaltyOutstandingPaise,
      totalAmountToClosePaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + penaltyCalc.penaltyOutstandingPaise,
    } : {
      isPenaltyApplicable: false,
      penaltyRatePercent: 0,
      dailyRepaymentAmountRupees: 0,
      dailyPenaltyRupees: 0,
      overdueDays: 0,
      cumulativePenaltyRupees: 0,
      penaltyPaidRupees: 0,
      penaltyOutstandingRupees: 0,
      totalAmountToCloseRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise),
      dailyRepaymentAmountPaise: 0,
      dailyPenaltyPaise: 0,
      cumulativePenaltyPaise: 0,
      penaltyPaidPaise: 0,
      penaltyOutstandingPaise: 0,
      totalAmountToClosePaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise,
    };

    const todayKolkata = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
    const dueKolkata = DateTime.fromJSDate(loan.dueDate, { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');
    const diffDays = Math.round(dueKolkata.diff(todayKolkata, 'days').days);
    const isDueForRenewal = diffDays <= 0 && loan.outstandingPrincipalPaise > 0;
    const currentPeriodInterestPaise = Math.round((loan.outstandingPrincipalPaise * loan.interestRatePercent) / 100);

    const loanObj = loan.toObject ? loan.toObject() : loan;
    loanObj.penaltyBreakdown = penaltyBreakdown;
    loanObj.renewalCount = loan.renewalCount || 0;
    loanObj.currentPeriodStartDate = loan.currentPeriodStartDate || loan.startDate;
    loanObj.currentPeriodDueDate = loan.currentPeriodDueDate || loan.dueDate;
    loanObj.currentPeriodInterestRupees = toRupees(currentPeriodInterestPaise);
    loanObj.currentPeriodInterestPaise = currentPeriodInterestPaise;
    loanObj.isDueForRenewal = isDueForRenewal;
    loanObj.renewalHistory = loan.renewalHistory || [];

    res.json({
      success: true,
      loan: loanObj,
      transactions,
      penaltyBreakdown,
      liveCalculation: {
        asOfDate: getKolkataDate().toISODate(),
        liveAccruedInterestRupees: (loan.vattiType === 'MONTHLY' || loan.vattiType === 'DAILY') ? 0 : toRupees(liveCalc.interestPaise),
        liveAccruedInterestPaise: (loan.vattiType === 'MONTHLY' || loan.vattiType === 'DAILY') ? 0 : liveCalc.interestPaise,
        outstandingPrincipalRupees: toRupees(loan.outstandingPrincipalPaise),
        outstandingInterestRupees: toRupees(loan.outstandingInterestPaise),
        totalOutstandingRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise),
        penaltyBreakdown,
        isPendingOwnerConfirmation: false,
        message: loan.vattiType === 'MONTHLY'
          ? 'Monthly Finance: First month interest deducted upfront. Customer repays full principal within monthly period or pays renewal interest to extend.'
          : loan.vattiType === 'DAILY'
          ? 'Daily Finance: First 10-day interest deducted upfront. Customer repays full principal within 10 days or pays renewal interest to extend.'
          : liveCalc.message,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Explicit Authorized Rate Amendment
 * Requirement: Once a loan is created, rate changes must require an explicit authorized amendment with an audit record.
 */
const amendInterestRate = async (req, res, next) => {
  try {
    const { newRatePercent, reason } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    if (loan.status === CONSTANTS.LOAN_STATUS.SETTLED || loan.status === CONSTANTS.LOAN_STATUS.CLOSED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot amend interest rate for settled or closed loan accounts.',
      });
    }

    if (newRatePercent === undefined || isNaN(newRatePercent) || Number(newRatePercent) < 0) {
      return res.status(400).json({ success: false, message: 'A valid non-negative interest rate is required' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'An explicit business reason is mandatory for authorized rate amendments.',
      });
    }

    const previousRate = loan.interestRatePercent;
    const newRate = Number(newRatePercent);

    if (previousRate === newRate) {
      return res.status(400).json({ success: false, message: 'New rate is identical to the current rate' });
    }

    // Add amendment record
    const amendment = {
      amendedAt: new Date(),
      previousRatePercent: previousRate,
      newRatePercent: newRate,
      reason: reason.trim(),
      authorizedBy: req.user.username,
      ipAddress: req.ip,
    };

    loan.amendmentHistory.push(amendment);
    loan.interestRatePercent = newRate;

    // Recalculate up to today
    const updatedCalc = calculateLoanInterest({
      vattiType: loan.vattiType,
      principalPaise: loan.outstandingPrincipalPaise,
      ratePercent: newRate,
      startDate: loan.startDate,
      asOfDate: new Date(),
      config: loan.calculationConfigSnapshot,
    });

    loan.accruedInterestPaise = updatedCalc.interestPaise;
    loan.outstandingInterestPaise = Math.max(0, updatedCalc.interestPaise - loan.totalInterestPaidPaise);

    await loan.save();

    await logAuditEvent({
      action: 'AMEND_RATE',
      entityType: 'LOAN',
      entityId: loan._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      previousState: { interestRatePercent: previousRate },
      newState: { interestRatePercent: newRate },
      details: `Rate amended on loan ${loan.loanId} from ${previousRate}% to ${newRate}%. Reason: ${reason}`,
    });

    res.json({
      success: true,
      message: `Interest rate successfully amended to ${newRate}% with authorized audit trail`,
      loan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reverse / Cancel Loan Account and its Linked Upfront Collection
 */
const reverseLoan = async (req, res, next) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan account not found' });
    }

    if (loan.status === 'CANCELLED' || loan.status === 'REVERSED') {
      return res.status(400).json({ success: false, message: 'This loan account is already cancelled/reversed.' });
    }

    const customer = await Customer.findById(loan.customerId);
    const reason = (req.body && req.body.reason && req.body.reason.trim()) || 'Loan reversed/cancelled by admin';

    const result = await runInTransaction(async (session) => {
      // 1. If loan has an upfront interest collection, reverse it
      if (loan.upfrontCollectionId) {
        const upfrontCol = await Collection.findById(loan.upfrontCollectionId);
        if (upfrontCol && upfrontCol.status !== CONSTANTS.COLLECTION_STATUS.REVERSED) {
          upfrontCol.status = CONSTANTS.COLLECTION_STATUS.REVERSED;
          const revTxnId = await generateTransactionId();
          upfrontCol.reversal = {
            reversedAt: new Date(),
            reversedBy: req.user?.username || 'admin',
            reason: `Loan ${loan.loanId} reversed: ${reason}`,
            reversalTransactionId: revTxnId,
          };
          await upfrontCol.save(session ? { session } : undefined);

          // Compensating reversal transaction for upfront collection
          const revColTxn = new Transaction({
            transactionId: revTxnId,
            customerId: loan.customerId,
            loanId: loan._id,
            collectionId: upfrontCol._id,
            date: new Date(),
            type: CONSTANTS.TRANSACTION_TYPES.REVERSAL,
            principalDebitPaise: 0,
            principalCreditPaise: 0,
            interestDebitPaise: upfrontCol.interestAllocationPaise,
            interestCreditPaise: 0,
            penaltyDebitPaise: 0,
            penaltyCreditPaise: 0,
            balancePrincipalPaise: loan.outstandingPrincipalPaise,
            balanceInterestPaise: 0,
            balanceTotalPaise: loan.outstandingPrincipalPaise,
            remarks: `REVERSAL of Upfront Interest [${upfrontCol.receiptNumber}]: ${reason}`,
            referenceId: upfrontCol.receiptNumber,
            performedBy: req.user?.username || 'admin',
          });
          await revColTxn.save(session ? { session } : undefined);
        }
      }

      // 2. Create Reversal Transaction for the Loan Disbursement
      const revDisburseTxnId = await generateTransactionId();
      const revDisburseTxn = new Transaction({
        transactionId: revDisburseTxnId,
        customerId: loan.customerId,
        loanId: loan._id,
        date: new Date(),
        type: CONSTANTS.TRANSACTION_TYPES.REVERSAL,
        principalDebitPaise: 0,
        principalCreditPaise: loan.grossPrincipalPaise || loan.principalPaise,
        interestDebitPaise: 0,
        interestCreditPaise: 0,
        balancePrincipalPaise: 0,
        balanceInterestPaise: 0,
        balanceTotalPaise: 0,
        remarks: `REVERSAL of Loan Disbursement [${loan.loanId}]: ${reason}`,
        referenceId: loan.loanId,
        performedBy: req.user?.username || 'admin',
      });
      await revDisburseTxn.save(session ? { session } : undefined);

      // 3. Mark Loan as CANCELLED
      loan.status = 'CANCELLED';
      loan.outstandingPrincipalPaise = 0;
      loan.outstandingInterestPaise = 0;
      await loan.save(session ? { session } : undefined);

      // 4. Adjust Customer Financial Aggregates
      if (customer) {
        customer.totalLentPaise = Math.max(0, (customer.totalLentPaise || 0) - (loan.netDisbursementPaise || loan.principalPaise));
        customer.outstandingPrincipalPaise = Math.max(0, (customer.outstandingPrincipalPaise || 0) - (loan.grossPrincipalPaise || loan.principalPaise));
        customer.totalInterestPaidPaise = Math.max(0, (customer.totalInterestPaidPaise || 0) - (loan.upfrontInterestPaise || 0));
        customer.activeLoanCount = Math.max(0, (customer.activeLoanCount || 1) - 1);
        await customer.save(session ? { session } : undefined);
      }

      return loan;
    });

    invalidateDashboardCache();

    await logAuditEvent({
      action: 'REVERSE_LOAN',
      entityType: 'LOAN',
      entityId: loan._id,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      details: `Reversed loan ${loan.loanId} and linked upfront interest collection`,
    });

    res.json({
      success: true,
      message: `Loan ${loan.loanId} and linked upfront collection reversed successfully`,
      loan: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Renew Loan for Monthly Finance (extends by 1 month) or Daily Finance (extends by 10 days)
 */
const renewLoan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      paymentAmount,
      renewalInterestAmount,
      paymentMethod = 'CASH',
      paymentDate = new Date(),
      remarks,
    } = req.body;

    const loan = await Loan.findById(id).populate('customerId');
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan account not found' });
    }

    if (loan.status === 'SETTLED' || loan.status === 'CLOSED' || loan.status === 'CANCELLED' || loan.status === 'REVERSED') {
      return res.status(400).json({ success: false, message: `Cannot renew loan with status ${loan.status}` });
    }

    if (loan.outstandingPrincipalPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Loan has zero outstanding principal; cannot be renewed' });
    }

    if (loan.vattiType !== 'MONTHLY' && loan.vattiType !== 'DAILY') {
      return res.status(400).json({
        success: false,
        message: `Loan renewal is only applicable for Monthly Finance and Daily Finance. Current type: ${loan.vattiType}`,
      });
    }

    // Calculate standard renewal interest based on current remaining principal:
    // Renewal Interest = Outstanding Principal × Rate / 100
    const standardRenewalInterestPaise = Math.round((loan.outstandingPrincipalPaise * loan.interestRatePercent) / 100);
    const amountToCharge = paymentAmount !== undefined && paymentAmount !== ''
      ? paymentAmount
      : renewalInterestAmount;
    const renewalPaymentPaise = amountToCharge !== undefined && amountToCharge !== '' && !isNaN(amountToCharge)
      ? toPaise(amountToCharge)
      : standardRenewalInterestPaise;

    if (renewalPaymentPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Renewal payment amount must be greater than zero' });
    }

    // Previous due date in Asia/Kolkata
    const prevDueKolkata = DateTime.fromJSDate(loan.dueDate, { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');

    // Calculate new extended due date
    let newDueKolkata;
    if (loan.vattiType === 'MONTHLY') {
      // Monthly Finance: extend to the next monthly period, handling calendar month-ends safely
      newDueKolkata = prevDueKolkata.plus({ months: 1 });
    } else {
      // Daily Finance: extend by exactly 10 calendar days
      newDueKolkata = prevDueKolkata.plus({ days: 10 });
    }

    const renewalNumber = (loan.renewalCount || 0) + 1;
    const upfrontReceiptNum = await generateReceiptNumber();
    const upfrontColId = await generateCollectionId();
    const colTxnId = await generateTransactionId();

    const payDate = paymentDate ? new Date(paymentDate) : new Date();
    const todayKolkata = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');

    const result = await runInTransaction(async (session) => {
      // 1. Create Confirmed Renewal Interest Collection Record
      const collection = new Collection({
        collectionId: upfrontColId,
        receiptNumber: upfrontReceiptNum,
        loanId: loan._id,
        loanCode: loan.loanId,
        customerId: loan.customerId._id,
        customerName: loan.customerName,
        paymentDate: payDate,
        paymentMethod: paymentMethod || 'CASH',
        totalAmountPaise: renewalPaymentPaise,
        principalAllocationPaise: 0, // Renewal interest strictly does NOT reduce principal!
        interestAllocationPaise: renewalPaymentPaise,
        penaltyAllocationPaise: 0,
        isUpfrontInterest: false,
        accountedInDisbursement: false,
        isRenewalInterest: true,
        renewalNumber,
        collectionType: 'RENEWAL_INTEREST',
        vattiType: loan.vattiType,
        previousOutstandingPrincipalPaise: loan.outstandingPrincipalPaise,
        previousOutstandingInterestPaise: 0,
        remainingPrincipalPaise: loan.outstandingPrincipalPaise, // Principal remains unchanged!
        remainingInterestPaise: 0,
        status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
        collectedBy: req.user?.username || 'admin',
        remarks: remarks || `Renewal #${renewalNumber} Interest: ₹${toRupees(renewalPaymentPaise)} paid. Extended to ${newDueKolkata.toISODate()}`,
        idempotencyKey: `RENEW-${loan.loanId}-${renewalNumber}-${Date.now()}`,
      });

      await collection.save(session ? { session } : undefined);

      // 2. Create Ledger Transaction for Renewal Interest
      const txn = new Transaction({
        transactionId: colTxnId,
        customerId: loan.customerId._id,
        loanId: loan._id,
        collectionId: collection._id,
        date: payDate,
        type: 'RENEWAL_INTEREST',
        principalDebitPaise: 0,
        principalCreditPaise: 0,
        interestDebitPaise: 0,
        interestCreditPaise: renewalPaymentPaise,
        penaltyDebitPaise: 0,
        penaltyCreditPaise: 0,
        balancePrincipalPaise: loan.outstandingPrincipalPaise,
        balanceInterestPaise: 0,
        balancePenaltyPaise: 0,
        balanceTotalPaise: loan.outstandingPrincipalPaise,
        remarks: `Renewal #${renewalNumber} Interest: ₹${toRupees(renewalPaymentPaise)} (${loan.vattiType === 'MONTHLY' ? '1 Month' : '10 Days'} extension to ${newDueKolkata.toISODate()})`,
        referenceId: upfrontReceiptNum,
        performedBy: req.user?.username || 'admin',
      });

      await txn.save(session ? { session } : undefined);

      // 3. Update Loan Record
      loan.renewalCount = renewalNumber;
      loan.currentPeriodStartDate = loan.dueDate;
      loan.dueDate = newDueKolkata.toJSDate();
      loan.currentPeriodDueDate = newDueKolkata.toJSDate();
      loan.totalInterestPaidPaise = (loan.totalInterestPaidPaise || 0) + renewalPaymentPaise;

      // Update status: If new due date is >= today, loan becomes ACTIVE; if still < today, remains OVERDUE
      if (newDueKolkata >= todayKolkata) {
        loan.status = CONSTANTS.LOAN_STATUS.ACTIVE;
      } else {
        loan.status = CONSTANTS.LOAN_STATUS.OVERDUE;
      }

      if (!loan.renewalHistory) {
        loan.renewalHistory = [];
      }

      loan.renewalHistory.push({
        renewalNumber,
        renewalDate: payDate,
        previousDueDate: prevDueKolkata.toJSDate(),
        newDueDate: newDueKolkata.toJSDate(),
        renewalInterestPaise: renewalPaymentPaise,
        principalPaiseAtRenewal: loan.outstandingPrincipalPaise,
        interestRatePercent: loan.interestRatePercent,
        collectionId: collection._id,
        receiptNumber: upfrontReceiptNum,
        paymentMethod: paymentMethod || 'CASH',
        remarks: remarks || '',
        recordedBy: req.user?.username || 'admin',
        createdAt: new Date(),
      });

      await loan.save(session ? { session } : undefined);

      // 4. Update Customer record
      const customer = await Customer.findById(loan.customerId._id);
      if (customer) {
        customer.totalInterestPaidPaise = (customer.totalInterestPaidPaise || 0) + renewalPaymentPaise;
        await customer.save(session ? { session } : undefined);
      }

      return { loan, collection, receiptNumber: upfrontReceiptNum };
    });

    // 5. Invalidate caches and trigger notifications
    invalidateDashboardCache();
    evaluateDueNotifications().catch((err) => console.error('Notification evaluation error after renewal:', err));

    await logAuditEvent({
      action: 'RENEW_LOAN',
      entityType: 'LOAN',
      entityId: loan._id,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      details: `Renewed ${loan.vattiType} loan ${loan.loanId} (Renewal #${renewalNumber}) with ₹${toRupees(renewalPaymentPaise)} interest paid. Extended to ${newDueKolkata.toISODate()}`,
    });

    res.json({
      success: true,
      message: `Loan successfully renewed (Renewal #${renewalNumber}). Extended to ${newDueKolkata.toISODate()}.`,
      loan: result.loan,
      collection: result.collection,
      receiptNumber: result.receiptNumber,
      renewalNumber,
      previousDueDate: prevDueKolkata.toISODate(),
      newDueDate: newDueKolkata.toISODate(),
      renewalInterestRupees: toRupees(renewalPaymentPaise),
      outstandingPrincipalRupees: toRupees(loan.outstandingPrincipalPaise),
    });
  } catch (error) {
    next(error);
  }
};

const deleteLoan = async (req, res, next) => {
  return reverseLoan(req, res, next);
};

module.exports = {
  previewLoan,
  createLoan,
  listLoans,
  getLoanById,
  amendInterestRate,
  reverseLoan,
  deleteLoan,
  renewLoan,
};
