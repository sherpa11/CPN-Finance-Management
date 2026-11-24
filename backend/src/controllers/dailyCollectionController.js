const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const DailyCollectionPayment = require('../models/DailyCollectionPayment');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Collection = require('../models/Collection');
const {
  generateCollectionId,
  generateReceiptNumber,
} = require('./collectionController');
const { logAuditEvent } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionHelper');
const {
  toPaise,
  toRupees,
  formatINR,
  getKolkataDate,
  calculateDailyCollectionSchemeA,
  calculateDailyCollectionSchemeB,
  calculateDailyPenalty,
} = require('../services/calculationEngine');
const CONSTANTS = require('../config/constants');
const { DateTime } = require('luxon');
const { escapeRegex } = require('../utils/sanitize');

// Generate sequential Account ID e.g. CPN-DC-0001
async function generateDailyCollectionAccountId() {
  const lastAcc = await DailyCollectionAccount.findOne().sort({ accountId: -1 });
  if (!lastAcc || !lastAcc.accountId) {
    return 'CPN-DC-0001';
  }
  const match = lastAcc.accountId.match(/CPN-DC-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-DC-${String(nextSeq).padStart(4, '0')}`;
  }
  return `CPN-DC-${Date.now().toString().slice(-4)}`;
}

// Generate sequential Payment ID e.g. DCP-2026-0001
async function generateDailyPaymentId() {
  const year = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).year;
  const lastPayment = await DailyCollectionPayment.findOne().sort({ paymentId: -1 });
  if (!lastPayment || !lastPayment.paymentId) {
    return `DCP-${year}-0001`;
  }
  const match = lastPayment.paymentId.match(/DCP-\d+-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `DCP-${year}-${String(nextSeq).padStart(4, '0')}`;
  }
  return `DCP-${year}-${Date.now().toString().slice(-4)}`;
}

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

async function generateTransactionId(offset = 0) {
  const lastTxn = await Transaction.findOne().sort({ transactionId: -1 });
  if (!lastTxn || !lastTxn.transactionId) {
    return `CPN-TXN-${String(1 + offset).padStart(5, '0')}`;
  }
  const match = lastTxn.transactionId.match(/CPN-TXN-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1 + offset;
    return `CPN-TXN-${String(nextSeq).padStart(5, '0')}`;
  }
  return `CPN-TXN-${(Date.now() + offset).toString().slice(-5)}`;
}

/**
 * Preview Daily Collection calculation
 */
const previewDailyCollection = async (req, res, next) => {
  try {
    const {
      grossPrincipal,
      upfrontInterestRupees,
      upfrontInterestPercent,
      totalDurationDays = 100,
      startDate = new Date(),
    } = req.body;
    const scheme = req.body.scheme || 'UPFRONT_DEDUCTION';

    const grossPaise = toPaise(grossPrincipal);
    if (grossPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Gross principal must be greater than zero.' });
    }

    const duration = Number(totalDurationDays) === 70 ? 70 : 100;
    const upfrontPaise = upfrontInterestRupees !== undefined && upfrontInterestRupees !== '' ? toPaise(upfrontInterestRupees) : undefined;
    const calculation = calculateDailyCollectionSchemeA({
      grossLoanAmountPaise: grossPaise,
      upfrontInterestPaise: upfrontPaise,
      upfrontInterestPercent: upfrontInterestPercent !== undefined && upfrontInterestPercent !== '' ? Number(upfrontInterestPercent) : undefined,
      startDate,
      totalDurationDays: duration,
    });

    res.json({
      success: true,
      preview: {
        scheme: calculation.scheme,
        schemeLabel: calculation.schemeLabel,
        grossPrincipalRupees: toRupees(calculation.grossPrincipalPaise),
        grossPrincipalPaise: calculation.grossPrincipalPaise,
        upfrontInterestRupees: toRupees(calculation.upfrontInterestPaise),
        upfrontInterestPaise: calculation.upfrontInterestPaise,
        upfrontInterestPercent: calculation.upfrontInterestPercent,
        netDisbursementRupees: toRupees(calculation.netDisbursementPaise),
        netDisbursementPaise: calculation.netDisbursementPaise,
        dailyInstalmentRupees: toRupees(calculation.dailyInstalmentPaise),
        dailyInstalmentPaise: calculation.dailyInstalmentPaise,
        principalRepaymentDays: calculation.principalRepaymentDays,
        additionalInterestDays: calculation.additionalInterestDays,
        additionalInterestRupees: toRupees(calculation.additionalInterestPaise || 0),
        additionalInterestPaise: calculation.additionalInterestPaise || 0,
        totalDurationDays: calculation.totalDurationDays,
        totalRepaymentRupees: toRupees(calculation.totalRepaymentPaise),
        totalRepaymentPaise: calculation.totalRepaymentPaise,
        startDate: calculation.startDate,
        expectedCompletionDate: calculation.expectedCompletionDate,
        scheduleSummary: {
          totalDays: calculation.schedule.length,
          day1ExpectedRupees: toRupees(calculation.schedule[0].expectedPaise),
          day100ExpectedRupees: toRupees(calculation.schedule[calculation.schedule.length - 1].expectedPaise),
          finalDayExpectedRupees: toRupees(calculation.schedule[calculation.schedule.length - 1].expectedPaise),
          additionalDaysCount: calculation.additionalInterestDays,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create New Daily Collection Account
 */
const createDailyCollectionAccount = async (req, res, next) => {
  try {
    const {
      customerId,
      grossPrincipal,
      upfrontInterestRupees,
      upfrontInterestPercent,
      additionalInterestDays,
      totalDurationDays = 100,
      startDate = new Date(),
      remarks,
    } = req.body;
    const scheme = req.body.scheme || 'UPFRONT_DEDUCTION';

    if (!customerId) {
      return res.status(400).json({ success: false, message: 'Customer ID is required.' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const grossPaise = toPaise(grossPrincipal);
    if (grossPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Gross principal must be greater than zero.' });
    }

    let calc;
    const duration = Number(totalDurationDays) === 70 ? 70 : 100;
    if (scheme === 'EXTENDED_DAYS') {
      calc = calculateDailyCollectionSchemeB({
        grossPrincipalPaise: grossPaise,
        additionalInterestDays: Number(additionalInterestDays || 10),
        startDate,
      });
    } else {
      const upfrontPaise = upfrontInterestRupees !== undefined && upfrontInterestRupees !== '' ? toPaise(upfrontInterestRupees) : undefined;
      calc = calculateDailyCollectionSchemeA({
        grossLoanAmountPaise: grossPaise,
        upfrontInterestPaise: upfrontPaise,
        upfrontInterestPercent: upfrontInterestPercent !== undefined && upfrontInterestPercent !== '' ? Number(upfrontInterestPercent) : undefined,
        startDate,
        totalDurationDays: duration,
      });
    }

    const accountId = await generateDailyCollectionAccountId();
    const loanId = await generateLoanId();
    const txnId = await generateTransactionId();

    let dcUpfrontColId = null;
    let dcUpfrontReceiptNum = null;
    let dcColTxnId = null;
    if (calc.scheme === 'UPFRONT_DEDUCTION' && calc.upfrontInterestPaise > 0) {
      dcUpfrontColId = await generateCollectionId();
      dcUpfrontReceiptNum = await generateReceiptNumber();
      dcColTxnId = await generateTransactionId(1);
    }

    const result = await runInTransaction(async (session) => {
      // 1. Create DailyCollectionAccount
      const dcAccount = new DailyCollectionAccount({
        accountId,
        customerId: customer._id,
        customerCode: customer.customerId,
        customerName: customer.name,
        customerMobile: customer.mobileNumber,
        loanCode: loanId,
        scheme: calc.scheme,
        grossPrincipalPaise: calc.grossPrincipalPaise,
        upfrontInterestPaise: calc.upfrontInterestPaise,
        upfrontInterestPercent: calc.upfrontInterestPercent,
        netDisbursementPaise: calc.netDisbursementPaise,
        dailyInstalmentPaise: calc.dailyInstalmentPaise,
        principalRepaymentDays: calc.principalRepaymentDays,
        additionalInterestDays: calc.additionalInterestDays,
        totalDurationDays: calc.totalDurationDays,
        totalRepaymentPaise: calc.totalRepaymentPaise,
        totalCollectedPaise: 0,
        principalCollectedPaise: 0,
        interestCollectedPaise: 0,
        outstandingPrincipalPaise: calc.grossPrincipalPaise,
        outstandingInterestPaise: calc.additionalInterestPaise || 0,
        totalOutstandingPaise: calc.totalRepaymentPaise,
        startDate: new Date(calc.startDate),
        expectedCompletionDate: new Date(calc.expectedCompletionDate),
        status: 'ACTIVE',
        daysCompleted: 0,
        daysMissed: 0,
        daysRemaining: calc.totalDurationDays,
        remarks: remarks || '',
        schedule: calc.schedule,
      });

      await dcAccount.save(session ? { session } : undefined);

      // 2. Create linked Loan record for unified customer statement & portfolio balance
      const loan = new Loan({
        loanId,
        customerId: customer._id,
        customerCode: customer.customerId,
        customerName: customer.name,
        customerMobile: customer.mobileNumber,
        vattiType: 'DAILY_COLLECTION',
        principalPaise: calc.grossPrincipalPaise,
        grossPrincipalPaise: calc.grossPrincipalPaise,
        upfrontInterestPaise: calc.scheme === 'UPFRONT_DEDUCTION' ? (calc.upfrontInterestPaise || 0) : 0,
        interestRatePercent: calc.scheme === 'UPFRONT_DEDUCTION' ? calc.upfrontInterestPercent : (calc.additionalInterestDays * 1),
        startDate: new Date(calc.startDate),
        dueDate: new Date(calc.expectedCompletionDate),
        status: CONSTANTS.LOAN_STATUS.ACTIVE,
        calculationConfigSnapshot: {
          scheme: calc.scheme,
          upfrontInterestPaise: calc.upfrontInterestPaise,
          additionalInterestDays: calc.additionalInterestDays,
          dailyInstalmentPaise: calc.dailyInstalmentPaise,
          totalDurationDays: calc.totalDurationDays,
        },
        outstandingPrincipalPaise: calc.grossPrincipalPaise,
        accruedInterestPaise: calc.additionalInterestPaise || 0,
        outstandingInterestPaise: calc.additionalInterestPaise || 0,
        totalPrincipalPaidPaise: 0,
        totalInterestPaidPaise: 0,
        netDisbursementPaise: calc.netDisbursementPaise,
        disbursementPaymentMethod: req.body.disbursementPaymentMethod || 'CASH',
        remarks: `Daily Collection [${calc.scheme}] account ${accountId}: ${remarks || ''}`,
        dailyCollectionDetails: {
          collectionAccountId: dcAccount._id,
          collectionAccountCode: accountId,
          scheme: calc.scheme,
          netDisbursementPaise: calc.netDisbursementPaise,
          dailyInstalmentPaise: calc.dailyInstalmentPaise,
          totalDurationDays: calc.totalDurationDays,
        },
      });

      await loan.save(session ? { session } : undefined);

      // Link loanId back to DailyCollectionAccount
      dcAccount.loanId = loan._id;
      await dcAccount.save(session ? { session } : undefined);

      // 3. Create initial ledger disbursement transaction
      const txn = new Transaction({
        transactionId: txnId,
        customerId: customer._id,
        loanId: loan._id,
        date: new Date(calc.startDate),
        type: CONSTANTS.TRANSACTION_TYPES.LOAN_DISBURSEMENT,
        principalDebitPaise: calc.grossPrincipalPaise,
        principalCreditPaise: 0,
        interestDebitPaise: 0,
        interestCreditPaise: 0,
        balancePrincipalPaise: calc.grossPrincipalPaise,
        balanceInterestPaise: 0,
        balanceTotalPaise: calc.grossPrincipalPaise,
        remarks: `Disbursed Daily Collection (${calc.scheme === 'UPFRONT_DEDUCTION' ? 'Scheme A' : 'Scheme B'}) ${accountId} to ${customer.name}. Net cash given: ₹${toRupees(calc.netDisbursementPaise)}`,
        referenceId: accountId,
      });

      await txn.save(session ? { session } : undefined);

      // 3b. Auto-Record Confirmed Upfront Interest Collection for Scheme A
      if (calc.scheme === 'UPFRONT_DEDUCTION' && calc.upfrontInterestPaise > 0) {
        dcAccount.upfrontReceiptNumber = dcUpfrontReceiptNum;
        loan.upfrontReceiptNumber = dcUpfrontReceiptNum;

        const upfrontCollection = new Collection({
          collectionId: dcUpfrontColId,
          receiptNumber: dcUpfrontReceiptNum,
          loanId: loan._id,
          loanCode: loanId,
          customerId: customer._id,
          customerName: customer.name,
          paymentDate: new Date(calc.startDate),
          paymentMethod: req.body.disbursementPaymentMethod || 'CASH',
          totalAmountPaise: calc.upfrontInterestPaise,
          principalAllocationPaise: 0,
          interestAllocationPaise: calc.upfrontInterestPaise,
          penaltyAllocationPaise: 0,
          isUpfrontInterest: true,
          accountedInDisbursement: true,
          collectionType: 'UPFRONT_INTEREST',
          vattiType: 'DAILY_COLLECTION',
          previousOutstandingPrincipalPaise: calc.grossPrincipalPaise,
          previousOutstandingInterestPaise: calc.upfrontInterestPaise,
          remainingPrincipalPaise: calc.grossPrincipalPaise,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: req.user ? req.user.username : 'system',
          remarks: 'Upfront interest deducted during disbursement',
          idempotencyKey: `UPFRONT-${accountId}`,
        });

        await upfrontCollection.save(session ? { session } : undefined);
        loan.upfrontCollectionId = upfrontCollection._id;
        await dcAccount.save(session ? { session } : undefined);
        await loan.save(session ? { session } : undefined);

        const colTxn = new Transaction({
          transactionId: dcColTxnId,
          customerId: customer._id,
          loanId: loan._id,
          collectionId: upfrontCollection._id,
          date: new Date(calc.startDate),
          type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
          principalDebitPaise: 0,
          principalCreditPaise: 0,
          interestDebitPaise: 0,
          interestCreditPaise: calc.upfrontInterestPaise,
          penaltyDebitPaise: 0,
          penaltyCreditPaise: 0,
          balancePrincipalPaise: calc.grossPrincipalPaise,
          balanceInterestPaise: 0,
          balancePenaltyPaise: 0,
          balanceTotalPaise: calc.grossPrincipalPaise,
          remarks: `Collection [${dcUpfrontReceiptNum}]: Upfront interest deducted during disbursement for Daily Collection ${accountId}`,
          referenceId: dcUpfrontReceiptNum,
          performedBy: req.user ? req.user.username : 'system',
        });

        await colTxn.save(session ? { session } : undefined);
        customer.totalInterestPaidPaise = (customer.totalInterestPaidPaise || 0) + calc.upfrontInterestPaise;
      }

      // 4. Update Customer aggregates
      customer.activeLoansCount += 1;
      customer.totalLentPaise += calc.grossPrincipalPaise;
      customer.outstandingPrincipalPaise += calc.grossPrincipalPaise;
      await customer.save(session ? { session } : undefined);

      return { dcAccount, loan };
    });

    // Log Audit Event
    await logAuditEvent({
      action: 'DAILY_COLLECTION_ACCOUNT_CREATE',
      entityType: 'DAILY_COLLECTION_ACCOUNT',
      entityId: result.dcAccount.accountId,
      performedBy: req.user ? req.user.username : 'system',
      ipAddress: req.ip,
      newState: {
        accountId: result.dcAccount.accountId,
        scheme: result.dcAccount.scheme,
        grossPrincipalPaise: result.dcAccount.grossPrincipalPaise,
        netDisbursementPaise: result.dcAccount.netDisbursementPaise,
        dailyInstalmentPaise: result.dcAccount.dailyInstalmentPaise,
        totalDurationDays: result.dcAccount.totalDurationDays,
      },
      details: `Created Daily Collection account ${result.dcAccount.accountId} for ${customer.name}`,
    });

    res.status(201).json({
      success: true,
      message: 'Daily Collection account created successfully.',
      account: result.dcAccount,
      loan: result.loan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Daily Collection Accounts with search, filter, pagination
 */
const getDailyCollectionAccounts = async (req, res, next) => {
  try {
    const {
      search,
      scheme,
      status,
      customerId,
      page = 1,
      limit = 25,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    if (scheme) {
      query.scheme = scheme;
    }
    if (status) {
      query.status = status;
    }
    if (customerId) {
      query.customerId = customerId;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { accountId: searchRegex },
        { customerName: searchRegex },
        { customerMobile: searchRegex },
        { customerCode: searchRegex },
      ];
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const numLimit = parseInt(limit, 10);

    const [accounts, totalCount] = await Promise.all([
      DailyCollectionAccount.find(query)
        .select('-schedule') // Exclude heavy schedule in list view for performance
        .sort(sort)
        .skip(skip)
        .limit(numLimit)
        .lean(),
      DailyCollectionAccount.countDocuments(query),
    ]);

    const accountsWithPenalty = accounts.map((acc) => {
      const penaltyCalc = calculateDailyPenalty({
        dailyRepaymentAmountPaise: acc.dailyInstalmentPaise,
        dueDate: acc.expectedCompletionDate,
        asOfDate: new Date(),
        isFullyRepaid: acc.status === 'COMPLETED' || acc.totalOutstandingPaise === 0,
        fullRepaymentDate: acc.actualCompletionDate,
        penaltyPaidPaise: acc.penaltyPaidPaise || 0,
        penaltyRatePercent: acc.penaltyRatePercent || 2.0,
      });

      return {
        ...acc,
        grossPrincipalRupees: toRupees(acc.grossPrincipalPaise),
        netDisbursementRupees: toRupees(acc.netDisbursementPaise),
        dailyInstalmentRupees: toRupees(acc.dailyInstalmentPaise),
        totalCollectedRupees: toRupees(acc.totalCollectedPaise),
        totalOutstandingRupees: toRupees(acc.totalOutstandingPaise),
        progressPercent: acc.totalRepaymentPaise > 0
          ? Number(((acc.totalCollectedPaise / acc.totalRepaymentPaise) * 100).toFixed(1))
          : 0,
        penaltyBreakdown: {
          isPenaltyApplicable: true,
          penaltyRatePercent: penaltyCalc.penaltyRatePercent,
          dailyRepaymentAmountRupees: toRupees(penaltyCalc.dailyRepaymentAmountPaise),
          dailyPenaltyRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
          overdueDays: penaltyCalc.overdueDays,
          cumulativePenaltyRupees: toRupees(penaltyCalc.cumulativePenaltyPaise),
          penaltyPaidRupees: toRupees(penaltyCalc.penaltyPaidPaise),
          penaltyOutstandingRupees: toRupees(penaltyCalc.penaltyOutstandingPaise),
          totalAmountToCloseRupees: toRupees(acc.totalOutstandingPaise + penaltyCalc.penaltyOutstandingPaise),
          dailyRepaymentAmountPaise: penaltyCalc.dailyRepaymentAmountPaise,
          dailyPenaltyPaise: penaltyCalc.dailyPenaltyPaise,
          cumulativePenaltyPaise: penaltyCalc.cumulativePenaltyPaise,
          penaltyPaidPaise: penaltyCalc.penaltyPaidPaise,
          penaltyOutstandingPaise: penaltyCalc.penaltyOutstandingPaise,
          totalAmountToClosePaise: acc.totalOutstandingPaise + penaltyCalc.penaltyOutstandingPaise,
        },
      };
    });

    res.json({
      success: true,
      accounts: accountsWithPenalty,
      pagination: {
        page: parseInt(page, 10),
        limit: numLimit,
        totalPages: Math.ceil(totalCount / numLimit),
        totalRecords: totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Daily Collection Account by ID or accountId (includes full schedule)
 */
const getDailyCollectionAccountById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let account;
    if (id.startsWith('CPN-DC-')) {
      account = await DailyCollectionAccount.findOne({ accountId: id });
    } else {
      account = await DailyCollectionAccount.findById(id);
    }

    if (!account) {
      return res.status(404).json({ success: false, message: 'Daily Collection account not found.' });
    }

    // Also fetch all payments recorded for this account
    const payments = await DailyCollectionPayment.find({ collectionAccountId: account._id })
      .sort({ dayNumber: 1, paymentDate: 1 })
      .lean();

    // Calculate live 2% daily penalty if overdue
    const penaltyCalc = calculateDailyPenalty({
      dailyRepaymentAmountPaise: account.dailyInstalmentPaise,
      dueDate: account.expectedCompletionDate,
      asOfDate: new Date(),
      isFullyRepaid: account.status === 'COMPLETED' || account.totalOutstandingPaise === 0,
      fullRepaymentDate: account.actualCompletionDate,
      penaltyPaidPaise: account.penaltyPaidPaise || 0,
      penaltyRatePercent: account.penaltyRatePercent || 2.0,
    });

    // Build schedule list with overdue rows beyond scheduled duration if overdue
    const scheduleList = account.schedule.map((s) => ({
      ...s.toObject(),
      expectedRupees: toRupees(s.expectedPaise),
      collectedRupees: toRupees(s.collectedPaise),
    }));

    if (penaltyCalc.overdueDays > 0) {
      const completionDate = getKolkataDate(account.expectedCompletionDate);
      let remainingPaidPenalty = account.penaltyPaidPaise || 0;
      for (let i = 1; i <= penaltyCalc.overdueDays; i++) {
        const overdueDayNum = account.totalDurationDays + i;
        const scheduledDate = completionDate.plus({ days: i }).toJSDate();
        let status = 'MISSED';
        let collectedPaise = 0;
        if (remainingPaidPenalty >= penaltyCalc.dailyPenaltyPaise) {
          status = 'PAID';
          collectedPaise = penaltyCalc.dailyPenaltyPaise;
          remainingPaidPenalty -= penaltyCalc.dailyPenaltyPaise;
        } else if (remainingPaidPenalty > 0) {
          status = 'PARTIAL';
          collectedPaise = remainingPaidPenalty;
          remainingPaidPenalty = 0;
        }
        scheduleList.push({
          dayNumber: overdueDayNum,
          scheduledDate,
          category: 'PENALTY',
          expectedPaise: penaltyCalc.dailyPenaltyPaise,
          expectedRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
          collectedPaise,
          collectedRupees: toRupees(collectedPaise),
          status,
          remarks: `Overdue Penalty Day ${i} (2% of daily repayment)`,
        });
      }
    }

    const penaltyBreakdown = {
      isPenaltyApplicable: true,
      penaltyRatePercent: penaltyCalc.penaltyRatePercent,
      dailyRepaymentAmountRupees: toRupees(penaltyCalc.dailyRepaymentAmountPaise),
      dailyPenaltyRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
      overdueDays: penaltyCalc.overdueDays,
      cumulativePenaltyRupees: toRupees(penaltyCalc.cumulativePenaltyPaise),
      penaltyPaidRupees: toRupees(penaltyCalc.penaltyPaidPaise),
      penaltyOutstandingRupees: toRupees(penaltyCalc.penaltyOutstandingPaise),
      totalAmountToCloseRupees: toRupees(account.totalOutstandingPaise + penaltyCalc.penaltyOutstandingPaise),
      dailyRepaymentAmountPaise: penaltyCalc.dailyRepaymentAmountPaise,
      dailyPenaltyPaise: penaltyCalc.dailyPenaltyPaise,
      cumulativePenaltyPaise: penaltyCalc.cumulativePenaltyPaise,
      penaltyPaidPaise: penaltyCalc.penaltyPaidPaise,
      penaltyOutstandingPaise: penaltyCalc.penaltyOutstandingPaise,
      totalAmountToClosePaise: account.totalOutstandingPaise + penaltyCalc.penaltyOutstandingPaise,
    };

    res.json({
      success: true,
      account: {
        ...account.toObject(),
        grossPrincipalRupees: toRupees(account.grossPrincipalPaise),
        netDisbursementRupees: toRupees(account.netDisbursementPaise),
        upfrontInterestRupees: toRupees(account.upfrontInterestPaise),
        additionalInterestRupees: toRupees(account.outstandingInterestPaise + account.interestCollectedPaise),
        dailyInstalmentRupees: toRupees(account.dailyInstalmentPaise),
        totalRepaymentRupees: toRupees(account.totalRepaymentPaise),
        totalCollectedRupees: toRupees(account.totalCollectedPaise),
        principalCollectedRupees: toRupees(account.principalCollectedPaise),
        interestCollectedRupees: toRupees(account.interestCollectedPaise),
        totalOutstandingRupees: toRupees(account.totalOutstandingPaise),
        penaltyBreakdown,
        schedule: scheduleList,
        payments: payments.map((p) => ({
          ...p,
          amountRupees: toRupees(p.amountPaise),
          principalAllocationRupees: toRupees(p.principalAllocationPaise || 0),
          interestAllocationRupees: toRupees(p.interestAllocationPaise || 0),
          penaltyAllocationRupees: toRupees(p.penaltyAllocationPaise || 0),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record Daily Payment
 */
const recordDailyCollectionPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      dayNumber,
      paymentDate = new Date(),
      amountRupees,
      paymentMethod = 'CASH',
      status = 'PAID', // PAID, PARTIAL, MISSED
      remarks = '',
      idempotencyKey,
    } = req.body;

    if (!dayNumber || dayNumber < 1) {
      return res.status(400).json({ success: false, message: 'Valid day number is required.' });
    }

    // Check idempotency if provided
    if (idempotencyKey) {
      const existing = await DailyCollectionPayment.findOne({ idempotencyKey });
      if (existing) {
        return res.json({
          success: true,
          message: 'Payment already processed (Idempotency matched)',
          payment: existing,
        });
      }
    }

    const account = await DailyCollectionAccount.findById(id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Daily Collection account not found.' });
    }

    let scheduleItem = account.schedule.find((s) => s.dayNumber === Number(dayNumber));
    const isPenaltyDay = Number(dayNumber) > account.totalDurationDays || scheduleItem?.category === 'PENALTY';
    let scheduledDate = new Date();

    if (scheduleItem && scheduleItem.status === 'PAID') {
      return res.status(400).json({ success: false, message: `Day ${dayNumber} is already fully paid.` });
    }

    if (!scheduleItem) {
      if (Number(dayNumber) > account.totalDurationDays) {
        // Overdue penalty payment day
        const completionDate = getKolkataDate(account.expectedCompletionDate);
        const overdueIndex = Number(dayNumber) - account.totalDurationDays;
        scheduledDate = completionDate.plus({ days: overdueIndex }).toJSDate();
      } else {
        return res.status(400).json({ success: false, message: `Day ${dayNumber} not found in account schedule.` });
      }
    } else {
      scheduledDate = scheduleItem.scheduledDate;
    }

    const amountPaise = status === 'MISSED' ? 0 : toPaise(amountRupees);
    if (status !== 'MISSED' && amountPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    // Calculate live penalty status
    const penaltyCalc = calculateDailyPenalty({
      dailyRepaymentAmountPaise: account.dailyInstalmentPaise,
      dueDate: account.expectedCompletionDate,
      asOfDate: paymentDate ? new Date(paymentDate) : new Date(),
      isFullyRepaid: false,
      penaltyPaidPaise: account.penaltyPaidPaise || 0,
      penaltyRatePercent: account.penaltyRatePercent || 2.0,
    });

    if (isPenaltyDay && penaltyCalc.penaltyOutstandingPaise > 0 && amountPaise > penaltyCalc.penaltyOutstandingPaise) {
      return res.status(400).json({
        success: false,
        message: `Penalty payment amount (₹${toRupees(amountPaise)}) exceeds current outstanding penalty (₹${toRupees(penaltyCalc.penaltyOutstandingPaise)}).`,
      });
    }

    // Allocation logic based on day category:
    // Days 1-100 (and Scheme A): PRINCIPAL
    // Days 101+ (Scheme B): INTEREST
    // Overdue Days (Day D+1+): PENALTY
    let principalAllocationPaise = 0;
    let interestAllocationPaise = 0;
    let penaltyAllocationPaise = 0;
    if (isPenaltyDay) {
      penaltyAllocationPaise = amountPaise;
    } else if (scheduleItem.category === 'PRINCIPAL') {
      principalAllocationPaise = amountPaise;
    } else {
      interestAllocationPaise = amountPaise;
    }

    const paymentId = await generateDailyPaymentId();
    const txnId = await generateTransactionId();

    const result = await runInTransaction(async (session) => {
      // 1. Create Payment record
      const payment = new DailyCollectionPayment({
        paymentId,
        collectionAccountId: account._id,
        accountCode: account.accountId,
        customerId: account.customerId,
        customerName: account.customerName,
        dayNumber: Number(dayNumber),
        scheduledDate,
        paymentDate: new Date(paymentDate),
        amountPaise,
        category: isPenaltyDay ? 'PENALTY' : scheduleItem.category,
        principalAllocationPaise,
        interestAllocationPaise,
        penaltyAllocationPaise,
        paymentMethod,
        idempotencyKey: idempotencyKey || undefined,
        status: 'CONFIRMED',
        remarks,
        recordedBy: req.user ? req.user.username : 'cpnraja',
      });

      await payment.save(session ? { session } : undefined);

      // 2. Update schedule item or push overdue penalty schedule item
      if (scheduleItem) {
        scheduleItem.collectedPaise = amountPaise;
        scheduleItem.paymentDate = status === 'MISSED' ? undefined : new Date(paymentDate);
        scheduleItem.paymentId = payment.paymentId;
        scheduleItem.remarks = remarks;

        if (status === 'MISSED') {
          scheduleItem.status = 'MISSED';
        } else if (amountPaise >= scheduleItem.expectedPaise) {
          scheduleItem.status = 'PAID';
        } else {
          scheduleItem.status = 'PARTIAL';
        }
      } else if (isPenaltyDay) {
        account.penaltyPaidPaise = (account.penaltyPaidPaise || 0) + penaltyAllocationPaise;
        const expectedPenaltyPaise = Math.round((account.dailyInstalmentPaise * (account.penaltyRatePercent || 2.0)) / 100);
        account.schedule.push({
          dayNumber: Number(dayNumber),
          scheduledDate,
          category: 'PENALTY',
          expectedPaise: expectedPenaltyPaise,
          collectedPaise: amountPaise,
          status: status === 'MISSED' ? 'MISSED' : (amountPaise >= expectedPenaltyPaise ? 'PAID' : 'PARTIAL'),
          paymentDate: status === 'MISSED' ? undefined : new Date(paymentDate),
          paymentId: payment.paymentId,
          remarks: remarks || `Overdue Penalty Day ${Number(dayNumber) - account.totalDurationDays}`,
        });
      }

      // 3. Recalculate account totals
      let totalCollected = 0;
      let principalCollected = 0;
      let interestCollected = 0;
      let completedCount = 0;
      let missedCount = 0;

      for (const item of account.schedule) {
        totalCollected += item.collectedPaise || 0;
        if (item.category === 'PRINCIPAL') {
          principalCollected += item.collectedPaise || 0;
        } else {
          interestCollected += item.collectedPaise || 0;
        }

        if (item.status === 'PAID') {
          completedCount += 1;
        } else if (item.status === 'MISSED') {
          missedCount += 1;
        }
      }

      account.totalCollectedPaise = totalCollected;
      account.principalCollectedPaise = principalCollected;
      account.interestCollectedPaise = interestCollected;
      account.outstandingPrincipalPaise = Math.max(0, account.grossPrincipalPaise - principalCollected);
      
      const totalAdditionalInterest = account.scheme === 'EXTENDED_DAYS' ? (account.additionalInterestDays * account.dailyInstalmentPaise) : 0;
      account.outstandingInterestPaise = Math.max(0, totalAdditionalInterest - interestCollected);
      account.totalOutstandingPaise = account.outstandingPrincipalPaise + account.outstandingInterestPaise;

      account.daysCompleted = completedCount;
      account.daysMissed = missedCount;
      account.daysRemaining = Math.max(0, account.totalDurationDays - completedCount);

      // Remaining live penalty after this payment is applied
      const livePenaltyRemaining = isPenaltyDay
        ? Math.max(0, penaltyCalc.penaltyOutstandingPaise - penaltyAllocationPaise)
        : penaltyCalc.penaltyOutstandingPaise;

      const totalRemainingToClosePaise = account.totalOutstandingPaise + livePenaltyRemaining;

      if (totalRemainingToClosePaise === 0 && completedCount >= account.totalDurationDays) {
        account.status = 'COMPLETED';
        account.actualCompletionDate = new Date();
      } else {
        // Check if overdue
        const today = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
        const completionDate = DateTime.fromJSDate(account.expectedCompletionDate).setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
        if (today > completionDate || missedCount > 0 || livePenaltyRemaining > 0) {
          account.status = 'OVERDUE';
        } else {
          account.status = 'ACTIVE';
        }
      }

      await account.save(session ? { session } : undefined);

      // 4. Update linked Loan & Customer if payment > 0
      if (amountPaise > 0 && account.loanId) {
        const loan = await Loan.findById(account.loanId);
        if (loan) {
          loan.outstandingPrincipalPaise = account.outstandingPrincipalPaise;
          loan.outstandingInterestPaise = account.outstandingInterestPaise;
          loan.totalPrincipalPaidPaise += principalAllocationPaise;
          loan.totalInterestPaidPaise += interestAllocationPaise;
          if (penaltyAllocationPaise > 0) {
            loan.penaltyPaidPaise = (loan.penaltyPaidPaise || 0) + penaltyAllocationPaise;
            loan.penaltyOutstandingPaise = Math.max(0, (loan.penaltyOutstandingPaise || 0) - penaltyAllocationPaise);
          }

          if (totalRemainingToClosePaise === 0) {
            loan.status = CONSTANTS.LOAN_STATUS.SETTLED;
            loan.settledDate = new Date();
          } else {
            loan.status = CONSTANTS.LOAN_STATUS.ACTIVE;
          }
          await loan.save(session ? { session } : undefined);

          // Ledger Transaction
          const txn = new Transaction({
            transactionId: txnId,
            customerId: account.customerId,
            loanId: loan._id,
            date: new Date(paymentDate),
            type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
            principalDebitPaise: 0,
            principalCreditPaise: principalAllocationPaise,
            interestDebitPaise: 0,
            interestCreditPaise: interestAllocationPaise,
            penaltyDebitPaise: 0,
            penaltyCreditPaise: penaltyAllocationPaise,
            balancePrincipalPaise: loan.outstandingPrincipalPaise,
            balanceInterestPaise: loan.outstandingInterestPaise,
            balancePenaltyPaise: loan.penaltyOutstandingPaise || 0,
            balanceTotalPaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + (loan.penaltyOutstandingPaise || 0),
            remarks: isPenaltyDay
              ? `Daily Collection Day ${dayNumber} (PENALTY): ${paymentMethod} received for ${account.accountId}`
              : `Daily Collection Day ${dayNumber} (${scheduleItem.category}): ${paymentMethod} received for ${account.accountId}`,
            referenceId: payment.paymentId,
          });
          await txn.save(session ? { session } : undefined);
        }

        const customer = await Customer.findById(account.customerId);
        if (customer) {
          customer.totalRepaidPaise += amountPaise;
          customer.outstandingPrincipalPaise = Math.max(0, customer.outstandingPrincipalPaise - principalAllocationPaise);
          if (account.totalOutstandingPaise === 0) {
            customer.activeLoansCount = Math.max(0, customer.activeLoansCount - 1);
            customer.settledLoansCount += 1;
          }
          await customer.save(session ? { session } : undefined);
        }
      }

      return { payment, account };
    });

    // Audit log
    await logAuditEvent({
      action: 'DAILY_COLLECTION_PAYMENT_RECORD',
      entityType: 'DAILY_COLLECTION_PAYMENT',
      entityId: result.payment.paymentId,
      performedBy: req.user ? req.user.username : 'cpnraja',
      ipAddress: req.ip,
      newState: {
        paymentId: result.payment.paymentId,
        accountId: account.accountId,
        dayNumber,
        amountPaise,
        status,
      },
      details: `Recorded Day ${dayNumber} collection of ₹${toRupees(amountPaise)} for ${account.accountId}`,
    });

    res.status(201).json({
      success: true,
      message: `Day ${dayNumber} recorded successfully.`,
      payment: result.payment,
      account: result.account,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reverse Daily Payment
 */
const reverseDailyCollectionPayment = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const { reason = 'Correction / Reversal' } = req.body;

    const account = await DailyCollectionAccount.findById(id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Daily Collection account not found.' });
    }

    const payment = await DailyCollectionPayment.findOne({
      collectionAccountId: account._id,
      paymentId,
      status: 'CONFIRMED',
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Confirmed payment record not found.' });
    }

    const txnId = await generateTransactionId();

    const result = await runInTransaction(async (session) => {
      // 1. Mark payment REVERSED
      payment.status = 'REVERSED';
      payment.reversedAt = new Date();
      payment.reversalReason = reason;
      await payment.save(session ? { session } : undefined);

      // 2. Revert schedule item
      const scheduleItem = account.schedule.find((s) => s.dayNumber === payment.dayNumber);
      if (scheduleItem) {
        scheduleItem.status = 'UPCOMING';
        scheduleItem.collectedPaise = 0;
        scheduleItem.paymentDate = undefined;
        scheduleItem.paymentId = undefined;
        scheduleItem.remarks = `Payment ${payment.paymentId} reversed: ${reason}`;
      }

      // 3. Recalculate account totals
      let totalCollected = 0;
      let principalCollected = 0;
      let interestCollected = 0;
      let completedCount = 0;
      let missedCount = 0;

      for (const item of account.schedule) {
        totalCollected += item.collectedPaise || 0;
        if (item.category === 'PRINCIPAL') {
          principalCollected += item.collectedPaise || 0;
        } else {
          interestCollected += item.collectedPaise || 0;
        }

        if (item.status === 'PAID') {
          completedCount += 1;
        } else if (item.status === 'MISSED') {
          missedCount += 1;
        }
      }

      account.totalCollectedPaise = totalCollected;
      account.principalCollectedPaise = principalCollected;
      account.interestCollectedPaise = interestCollected;
      account.outstandingPrincipalPaise = Math.max(0, account.grossPrincipalPaise - principalCollected);

      const totalAdditionalInterest = account.scheme === 'EXTENDED_DAYS' ? (account.additionalInterestDays * account.dailyInstalmentPaise) : 0;
      account.outstandingInterestPaise = Math.max(0, totalAdditionalInterest - interestCollected);
      account.totalOutstandingPaise = account.outstandingPrincipalPaise + account.outstandingInterestPaise;

      if (payment.penaltyAllocationPaise > 0) {
        account.penaltyPaidPaise = Math.max(0, (account.penaltyPaidPaise || 0) - payment.penaltyAllocationPaise);
      }

      account.daysCompleted = completedCount;
      account.daysMissed = missedCount;
      account.daysRemaining = Math.max(0, account.totalDurationDays - completedCount);
      account.status = (missedCount > 0 || (payment.dayNumber > account.totalDurationDays)) ? 'OVERDUE' : 'ACTIVE';
      account.actualCompletionDate = undefined;

      await account.save(session ? { session } : undefined);

      // 4. Update linked Loan & Customer
      if (payment.amountPaise > 0 && account.loanId) {
        const loan = await Loan.findById(account.loanId);
        if (loan) {
          loan.outstandingPrincipalPaise = account.outstandingPrincipalPaise;
          loan.outstandingInterestPaise = account.outstandingInterestPaise;
          loan.totalPrincipalPaidPaise = Math.max(0, loan.totalPrincipalPaidPaise - payment.principalAllocationPaise);
          loan.totalInterestPaidPaise = Math.max(0, loan.totalInterestPaidPaise - payment.interestAllocationPaise);
          if (payment.penaltyAllocationPaise > 0) {
            loan.penaltyPaidPaise = Math.max(0, (loan.penaltyPaidPaise || 0) - payment.penaltyAllocationPaise);
            loan.penaltyOutstandingPaise = (loan.penaltyOutstandingPaise || 0) + payment.penaltyAllocationPaise;
          }
          loan.status = CONSTANTS.LOAN_STATUS.ACTIVE;
          loan.settledDate = undefined;
          await loan.save(session ? { session } : undefined);

          // Reversal transaction
          const txn = new Transaction({
            transactionId: txnId,
            customerId: account.customerId,
            loanId: loan._id,
            date: new Date(),
            type: CONSTANTS.TRANSACTION_TYPES.REVERSAL,
            principalDebitPaise: payment.principalAllocationPaise,
            principalCreditPaise: 0,
            interestDebitPaise: payment.interestAllocationPaise,
            interestCreditPaise: 0,
            penaltyDebitPaise: payment.penaltyAllocationPaise || 0,
            penaltyCreditPaise: 0,
            balancePrincipalPaise: loan.outstandingPrincipalPaise,
            balanceInterestPaise: loan.outstandingInterestPaise,
            balancePenaltyPaise: loan.penaltyOutstandingPaise || 0,
            balanceTotalPaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise + (loan.penaltyOutstandingPaise || 0),
            remarks: `Reversal of Day ${payment.dayNumber} collection ${payment.paymentId}: ${reason}`,
            referenceId: payment.paymentId,
          });
          await txn.save(session ? { session } : undefined);
        }

        const customer = await Customer.findById(account.customerId);
        if (customer) {
          customer.totalRepaidPaise = Math.max(0, customer.totalRepaidPaise - payment.amountPaise);
          customer.outstandingPrincipalPaise += payment.principalAllocationPaise;
          await customer.save(session ? { session } : undefined);
        }
      }

      return { payment, account };
    });

    // Audit log
    await logAuditEvent({
      action: 'DAILY_COLLECTION_PAYMENT_REVERSE',
      entityType: 'DAILY_COLLECTION_PAYMENT',
      entityId: payment.paymentId,
      performedBy: req.user ? req.user.username : 'cpnraja',
      ipAddress: req.ip,
      newState: {
        status: 'REVERSED',
        reason,
      },
      details: `Reversed payment ${payment.paymentId} for Day ${payment.dayNumber} on ${account.accountId}`,
    });

    res.json({
      success: true,
      message: `Payment ${payment.paymentId} successfully reversed.`,
      payment: result.payment,
      account: result.account,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 11 KPI Summary Cards + Today's Collections Dashboard
 */
const getDailyCollectionDashboardSummary = async (req, res, next) => {
  try {
    const todayKolkata = DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
    const todayStart = todayKolkata.toJSDate();
    const todayEnd = todayKolkata.endOf('day').toJSDate();

    const [
      activeCount,
      completedCount,
      overdueCount,
      allAccounts,
      todayPayments,
    ] = await Promise.all([
      DailyCollectionAccount.countDocuments({ status: 'ACTIVE' }),
      DailyCollectionAccount.countDocuments({ status: 'COMPLETED' }),
      DailyCollectionAccount.countDocuments({ status: 'OVERDUE' }),
      DailyCollectionAccount.find({}, {
        grossPrincipalPaise: 1,
        netDisbursementPaise: 1,
        upfrontInterestPaise: 1,
        additionalInterestDays: 1,
        dailyInstalmentPaise: 1,
        totalCollectedPaise: 1,
        totalOutstandingPaise: 1,
        scheme: 1,
        status: 1,
        daysMissed: 1,
        schedule: { $elemMatch: { scheduledDate: { $gte: todayStart, $lte: todayEnd } } },
      }).lean(),
      DailyCollectionPayment.find({
        paymentDate: { $gte: todayStart, $lte: todayEnd },
        status: 'CONFIRMED',
      }).lean(),
    ]);

    let grossPrincipalDisbursedPaise = 0;
    let netDisbursedPaise = 0;
    let upfrontInterestDeductedPaise = 0;
    let extendedDayInterestExpectedPaise = 0;
    let totalCollectionsReceivedPaise = 0;
    let totalOutstandingBalancePaise = 0;
    let totalMissedDays = 0;
    let todayExpectedPaise = 0;

    for (const acc of allAccounts) {
      grossPrincipalDisbursedPaise += acc.grossPrincipalPaise || 0;
      netDisbursedPaise += acc.netDisbursementPaise || 0;
      upfrontInterestDeductedPaise += acc.upfrontInterestPaise || 0;
      if (acc.scheme === 'EXTENDED_DAYS') {
        extendedDayInterestExpectedPaise += (acc.additionalInterestDays || 0) * (acc.dailyInstalmentPaise || 0);
      }
      totalCollectionsReceivedPaise += acc.totalCollectedPaise || 0;
      totalOutstandingBalancePaise += acc.totalOutstandingPaise || 0;
      totalMissedDays += acc.daysMissed || 0;

      // Check if today is in schedule
      if (acc.status !== 'COMPLETED' && acc.schedule && acc.schedule.length > 0) {
        todayExpectedPaise += acc.schedule[0].expectedPaise || 0;
      }
    }

    let todayActualPaise = 0;
    for (const p of todayPayments) {
      todayActualPaise += p.amountPaise || 0;
    }

    res.json({
      success: true,
      summary: {
        // 11 KPIs requested in spec
        totalActiveAccounts: activeCount + overdueCount,
        grossPrincipalDisbursedRupees: toRupees(grossPrincipalDisbursedPaise),
        grossPrincipalDisbursedPaise,
        netDisbursedRupees: toRupees(netDisbursedPaise),
        netDisbursedPaise,
        upfrontInterestDeductedRupees: toRupees(upfrontInterestDeductedPaise),
        upfrontInterestDeductedPaise,
        extendedDayInterestExpectedRupees: toRupees(extendedDayInterestExpectedPaise),
        extendedDayInterestExpectedPaise,
        totalCollectionsReceivedRupees: toRupees(totalCollectionsReceivedPaise),
        totalCollectionsReceivedPaise,
        totalOutstandingBalanceRupees: toRupees(totalOutstandingBalancePaise),
        totalOutstandingBalancePaise,
        todayExpectedRupees: toRupees(todayExpectedPaise),
        todayExpectedPaise,
        todayActualRupees: toRupees(todayActualPaise),
        todayActualPaise,
        missedCollectionsCount: totalMissedDays,
        completedAccountsCount: completedCount,
        overdueAccountsCount: overdueCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10 Daily Collection Reports
 */
const getDailyCollectionReports = async (req, res, next) => {
  try {
    const { reportType, startDate, endDate, scheme, status, date } = req.query;

    switch (reportType) {
      case 'daily-summary': {
        // Date-wise expected vs collected
        const start = startDate ? new Date(startDate) : DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).minus({ days: 30 }).toJSDate();
        const end = endDate ? new Date(endDate) : new Date();

        const payments = await DailyCollectionPayment.aggregate([
          {
            $match: {
              paymentDate: { $gte: start, $lte: end },
              status: 'CONFIRMED',
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate', timezone: CONSTANTS.DEFAULT_TIMEZONE } },
              totalCollectedPaise: { $sum: '$amountPaise' },
              principalCollectedPaise: { $sum: '$principalAllocationPaise' },
              interestCollectedPaise: { $sum: '$interestAllocationPaise' },
              collectionsCount: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
        ]);

        return res.json({
          success: true,
          reportType,
          data: payments.map((p) => ({
            date: p._id,
            totalCollectedRupees: toRupees(p.totalCollectedPaise),
            principalCollectedRupees: toRupees(p.principalCollectedPaise),
            interestCollectedRupees: toRupees(p.interestCollectedPaise),
            collectionsCount: p.collectionsCount,
          })),
        });
      }

      case 'account-status': {
        const query = {};
        if (scheme) query.scheme = scheme;
        if (status) query.status = status;

        const accounts = await DailyCollectionAccount.find(query)
          .select('-schedule')
          .sort({ accountId: -1 })
          .lean();

        return res.json({
          success: true,
          reportType,
          totalAccounts: accounts.length,
          data: accounts.map((a) => ({
            accountId: a.accountId,
            customerName: a.customerName,
            customerMobile: a.customerMobile,
            scheme: a.scheme,
            status: a.status,
            grossPrincipalRupees: toRupees(a.grossPrincipalPaise),
            dailyInstalmentRupees: toRupees(a.dailyInstalmentPaise),
            totalCollectedRupees: toRupees(a.totalCollectedPaise),
            totalOutstandingRupees: toRupees(a.totalOutstandingPaise),
            daysCompleted: a.daysCompleted,
            daysRemaining: a.daysRemaining,
            daysMissed: a.daysMissed,
            startDate: a.startDate,
            expectedCompletionDate: a.expectedCompletionDate,
          })),
        });
      }

      case 'scheme-comparison': {
        const stats = await DailyCollectionAccount.aggregate([
          {
            $group: {
              _id: '$scheme',
              accountCount: { $sum: 1 },
              totalGrossPaise: { $sum: '$grossPrincipalPaise' },
              totalNetDisbursedPaise: { $sum: '$netDisbursementPaise' },
              totalUpfrontInterestPaise: { $sum: '$upfrontInterestPaise' },
              totalCollectedPaise: { $sum: '$totalCollectedPaise' },
              totalOutstandingPaise: { $sum: '$totalOutstandingPaise' },
            },
          },
        ]);

        return res.json({
          success: true,
          reportType,
          data: stats.map((s) => ({
            scheme: s._id,
            schemeLabel: s._id === 'UPFRONT_DEDUCTION' ? 'Scheme A: Upfront Deduction' : 'Scheme B: Extended Days',
            accountCount: s.accountCount,
            totalGrossRupees: toRupees(s.totalGrossPaise),
            totalNetDisbursedRupees: toRupees(s.totalNetDisbursedPaise),
            totalUpfrontInterestRupees: toRupees(s.totalUpfrontInterestPaise),
            totalCollectedRupees: toRupees(s.totalCollectedPaise),
            totalOutstandingRupees: toRupees(s.totalOutstandingPaise),
          })),
        });
      }

      case 'collection-sheet': {
        // Daily collection sheet for field collectors for a specific date
        const targetDate = date ? DateTime.fromISO(date, { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day') : DateTime.now().setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
        const dayStart = targetDate.toJSDate();
        const dayEnd = targetDate.endOf('day').toJSDate();

        const activeAccounts = await DailyCollectionAccount.find({
          status: { $in: ['ACTIVE', 'OVERDUE'] },
          'schedule.scheduledDate': { $gte: dayStart, $lte: dayEnd },
        }).lean();

        const sheet = [];
        for (const acc of activeAccounts) {
          const item = acc.schedule.find((s) => {
            const sDate = DateTime.fromJSDate(s.scheduledDate).setZone(CONSTANTS.DEFAULT_TIMEZONE).startOf('day');
            return sDate.hasSame(targetDate, 'day');
          });

          if (item) {
            sheet.push({
              accountId: acc.accountId,
              customerName: acc.customerName,
              customerMobile: acc.customerMobile,
              scheme: acc.scheme,
              dayNumber: item.dayNumber,
              category: item.category,
              expectedRupees: toRupees(item.expectedPaise),
              status: item.status,
              collectedRupees: toRupees(item.collectedPaise),
            });
          }
        }

        return res.json({
          success: true,
          reportType,
          date: targetDate.toISODate(),
          totalExpectedRupees: sheet.reduce((sum, r) => sum + r.expectedRupees, 0),
          totalCollectedRupees: sheet.reduce((sum, r) => sum + r.collectedRupees, 0),
          data: sheet,
        });
      }

      case 'defaulters': {
        const defaulters = await DailyCollectionAccount.find({
          $or: [{ status: 'OVERDUE' }, { daysMissed: { $gt: 0 } }],
        })
          .select('-schedule')
          .sort({ daysMissed: -1 })
          .lean();

        return res.json({
          success: true,
          reportType,
          count: defaulters.length,
          data: defaulters.map((d) => ({
            accountId: d.accountId,
            customerName: d.customerName,
            customerMobile: d.customerMobile,
            scheme: d.scheme,
            daysMissed: d.daysMissed,
            daysCompleted: d.daysCompleted,
            dailyInstalmentRupees: toRupees(d.dailyInstalmentPaise),
            totalOutstandingRupees: toRupees(d.totalOutstandingPaise),
            status: d.status,
            expectedCompletionDate: d.expectedCompletionDate,
          })),
        });
      }

      case 'partial-payments': {
        const accountsWithPartials = await DailyCollectionAccount.find({
          'schedule.status': 'PARTIAL',
        }).lean();

        const partialList = [];
        for (const acc of accountsWithPartials) {
          const partials = acc.schedule.filter((s) => s.status === 'PARTIAL');
          for (const p of partials) {
            partialList.push({
              accountId: acc.accountId,
              customerName: acc.customerName,
              customerMobile: acc.customerMobile,
              dayNumber: p.dayNumber,
              scheduledDate: p.scheduledDate,
              expectedRupees: toRupees(p.expectedPaise),
              collectedRupees: toRupees(p.collectedPaise),
              shortageRupees: toRupees(p.expectedPaise - p.collectedPaise),
            });
          }
        }

        return res.json({
          success: true,
          reportType,
          count: partialList.length,
          data: partialList,
        });
      }

      case 'maturity-forecast': {
        // Accounts due to complete in upcoming months
        const accounts = await DailyCollectionAccount.find({
          status: { $in: ['ACTIVE', 'OVERDUE'] },
        })
          .select('-schedule')
          .sort({ expectedCompletionDate: 1 })
          .lean();

        return res.json({
          success: true,
          reportType,
          count: accounts.length,
          data: accounts.map((a) => ({
            accountId: a.accountId,
            customerName: a.customerName,
            customerMobile: a.customerMobile,
            scheme: a.scheme,
            expectedCompletionDate: a.expectedCompletionDate,
            daysRemaining: a.daysRemaining,
            totalOutstandingRupees: toRupees(a.totalOutstandingPaise),
            dailyInstalmentRupees: toRupees(a.dailyInstalmentPaise),
          })),
        });
      }

      case 'realization': {
        // Principal vs Interest realization
        const summary = await DailyCollectionAccount.aggregate([
          {
            $group: {
              _id: null,
              totalGrossPaise: { $sum: '$grossPrincipalPaise' },
              totalPrincipalCollectedPaise: { $sum: '$principalCollectedPaise' },
              totalUpfrontInterestPaise: { $sum: '$upfrontInterestPaise' },
              totalExtendedInterestCollectedPaise: { $sum: '$interestCollectedPaise' },
              totalOutstandingPaise: { $sum: '$totalOutstandingPaise' },
            },
          },
        ]);

        const s = summary[0] || {};
        return res.json({
          success: true,
          reportType,
          data: {
            totalGrossPrincipalRupees: toRupees(s.totalGrossPaise || 0),
            totalPrincipalRecoveredRupees: toRupees(s.totalPrincipalCollectedPaise || 0),
            principalRecoveryRatePercent: s.totalGrossPaise > 0
              ? Number(((s.totalPrincipalCollectedPaise / s.totalGrossPaise) * 100).toFixed(2))
              : 0,
            upfrontInterestEarnedRupees: toRupees(s.totalUpfrontInterestPaise || 0),
            extendedInterestEarnedRupees: toRupees(s.totalExtendedInterestCollectedPaise || 0),
            totalInterestRealizedRupees: toRupees((s.totalUpfrontInterestPaise || 0) + (s.totalExtendedInterestCollectedPaise || 0)),
            totalOutstandingBalanceRupees: toRupees(s.totalOutstandingPaise || 0),
          },
        });
      }

      case 'consolidated': {
        const [accSummary, paymentSummary] = await Promise.all([
          DailyCollectionAccount.aggregate([
            {
              $group: {
                _id: null,
                totalAccounts: { $sum: 1 },
                activeAccounts: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
                completedAccounts: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
                overdueAccounts: { $sum: { $cond: [{ $eq: ['$status', 'OVERDUE'] }, 1, 0] } },
                grossPaise: { $sum: '$grossPrincipalPaise' },
                netDisbursedPaise: { $sum: '$netDisbursementPaise' },
                upfrontInterestPaise: { $sum: '$upfrontInterestPaise' },
                collectedPaise: { $sum: '$totalCollectedPaise' },
                outstandingPaise: { $sum: '$totalOutstandingPaise' },
              },
            },
          ]),
          DailyCollectionPayment.aggregate([
            {
              $match: { status: 'CONFIRMED' },
            },
            {
              $group: {
                _id: '$paymentMethod',
                totalPaise: { $sum: '$amountPaise' },
                count: { $sum: 1 },
              },
            },
          ]),
        ]);

        const a = accSummary[0] || {};
        return res.json({
          success: true,
          reportType,
          data: {
            totalAccounts: a.totalAccounts || 0,
            activeAccounts: a.activeAccounts || 0,
            completedAccounts: a.completedAccounts || 0,
            overdueAccounts: a.overdueAccounts || 0,
            grossPrincipalRupees: toRupees(a.grossPaise || 0),
            netDisbursedRupees: toRupees(a.netDisbursedPaise || 0),
            upfrontInterestRupees: toRupees(a.upfrontInterestPaise || 0),
            totalCollectedRupees: toRupees(a.collectedPaise || 0),
            totalOutstandingRupees: toRupees(a.outstandingPaise || 0),
            paymentMethodBreakdown: paymentSummary.map((m) => ({
              method: m._id,
              amountRupees: toRupees(m.totalPaise),
              count: m.count,
            })),
          },
        });
      }

      default:
        return res.status(400).json({ success: false, message: `Unsupported report type: ${reportType}` });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  previewDailyCollection,
  createDailyCollectionAccount,
  getDailyCollectionAccounts,
  getDailyCollectionAccountById,
  recordDailyCollectionPayment,
  reverseDailyCollectionPayment,
  getDailyCollectionDashboardSummary,
  getDailyCollectionReports,
};
