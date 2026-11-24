const Loan = require('../models/Loan');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const CalculationConfiguration = require('../models/CalculationConfiguration');
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
const CONSTANTS = require('../config/constants');
const { escapeRegex } = require('../utils/sanitize');
const { invalidateDashboardCache } = require('./dashboardController');

// Generate sequential Loan ID e.g. CPN-LN-0001
async function generateLoanId() {
  const lastLoan = await Loan.findOne().sort({ loanId: -1 });
  if (!lastLoan || !lastLoan.loanId) {
    return 'CPN-LN-0001';
  }
  const match = lastLoan.loanId.match(/CPN-LN-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-LN-${String(nextSeq).padStart(4, '0')}`;
  }
  return `CPN-LN-${Date.now().toString().slice(-4)}`;
}

async function generateTransactionId() {
  const lastTxn = await Transaction.findOne().sort({ transactionId: -1 });
  if (!lastTxn || !lastTxn.transactionId) {
    return 'CPN-TXN-00001';
  }
  const match = lastTxn.transactionId.match(/CPN-TXN-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-TXN-${String(nextSeq).padStart(5, '0')}`;
  }
  return `CPN-TXN-${Date.now().toString().slice(-5)}`;
}

/**
 * Preview Loan Calculation before saving
 */
const previewLoan = async (req, res, next) => {
  try {
    const vattiType = req.body.financeType || req.body.vattiType;
    const { principalAmount, interestRatePercent, startDate, dueDate } = req.body;

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
        expectedInterestRupees: toRupees(calculation.interestPaise),
        expectedInterestPaise: calculation.interestPaise,
        netAmountGivenRupees: toRupees(calculation.netDisbursementPaise || calculation.netAmountGivenPaise || (calculation.principalPaise - calculation.interestPaise)),
        netAmountGivenPaise: calculation.netDisbursementPaise || calculation.netAmountGivenPaise || (calculation.principalPaise - calculation.interestPaise),
        expectedTotalPayableRupees: toRupees(calculation.totalPayablePaise),
        expectedTotalPayablePaise: calculation.totalPayablePaise,
        dailyInstalmentRupees: calculation.dailyInstalmentPaise ? toRupees(calculation.dailyInstalmentPaise) : undefined,
        dailyInstalmentPaise: calculation.dailyInstalmentPaise || undefined,
        durationDays: calculation.eligibleDays || calculation.durationDays || undefined,
        isUpfrontDeduction: vattiType === 'MONTHLY' || vattiType === 'DAILY' || !!calculation.isUpfrontDeduction,
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
    const upfrontInterestPaise = isUpfrontDeduction ? (initialCalc.upfrontInterestPaise || initialCalc.interestPaise || 0) : 0;
    const netDisbursedPaise = isUpfrontDeduction ? Math.max(0, principalPaise - upfrontInterestPaise) : principalPaise;

    // For both Monthly and Daily: customer repays the full original principal P (e.g. 5L)
    const initialOutstandingPrincipalPaise = principalPaise;
    const dailyDurationDays = isDaily ? (initialCalc.eligibleDays || initialCalc.durationDays || 10) : undefined;
    const dailyInstalmentPaise = isDaily ? (initialCalc.dailyInstalmentPaise || Math.floor(principalPaise / (dailyDurationDays || 1))) : undefined;

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
        interestCreditPaise: isUpfrontDeduction ? upfrontInterestPaise : 0,
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
    if (status && status !== 'ALL') query.status = status;

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
      if (loan.vattiType === 'DAILY') {
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
      return {
        ...loan,
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

    const isDaily = loan.vattiType === 'DAILY';
    let penaltyCalc = null;
    if (isDaily) {
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

    const penaltyBreakdown = isDaily && penaltyCalc ? {
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

    const loanObj = loan.toObject ? loan.toObject() : loan;
    loanObj.penaltyBreakdown = penaltyBreakdown;

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
          ? 'Monthly Finance: Interest was deducted upfront at loan disbursement. Strictly no overdue penalties.'
          : loan.vattiType === 'DAILY'
          ? 'Daily Finance: Interest was deducted upfront at loan disbursement. Overdue penalty of 2% per day applies after maturity.'
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

module.exports = {
  previewLoan,
  createLoan,
  listLoans,
  getLoanById,
  amendInterestRate,
};
