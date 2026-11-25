const { DateTime } = require('luxon');
const Collection = require('../models/Collection');
const DailyCollectionPayment = require('../models/DailyCollectionPayment');
const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const Loan = require('../models/Loan');
const IrupuInvestment = require('../models/IrupuInvestment');
const IrupuOutflow = require('../models/IrupuOutflow');
const IrupuOpeningBalance = require('../models/IrupuOpeningBalance');
const AuditLog = require('../models/AuditLog');
const { toPaise, toRupees, getKolkataDate, formatINR } = require('./calculationEngine');
const {
  generateCollectionId,
  generateReceiptNumber,
} = require('../controllers/collectionController');
const CONSTANTS = require('../config/constants');
const { syncHistoricalUpfrontCollections } = require('./reconciliationService');

const TIMEZONE = 'Asia/Kolkata';

// Generate sequential IDs
async function generateInvestmentId() {
  const year = DateTime.now().setZone(TIMEZONE).year;
  const last = await IrupuInvestment.findOne({ investmentId: new RegExp(`^IRP-INV-${year}-`) })
    .sort({ investmentId: -1 })
    .lean();

  if (!last || !last.investmentId) {
    return `IRP-INV-${year}-0001`;
  }
  const match = last.investmentId.match(new RegExp(`^IRP-INV-${year}-(\\d+)`));
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `IRP-INV-${year}-${String(nextSeq).padStart(4, '0')}`;
  }
  return `IRP-INV-${year}-${Date.now().toString().slice(-4)}`;
}

async function generateOutflowId() {
  const year = DateTime.now().setZone(TIMEZONE).year;
  const last = await IrupuOutflow.findOne({ outflowId: new RegExp(`^IRP-OUT-${year}-`) })
    .sort({ outflowId: -1 })
    .lean();

  if (!last || !last.outflowId) {
    return `IRP-OUT-${year}-0001`;
  }
  const match = last.outflowId.match(new RegExp(`^IRP-OUT-${year}-(\\d+)`));
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `IRP-OUT-${year}-${String(nextSeq).padStart(4, '0')}`;
  }
  return `IRP-OUT-${year}-${Date.now().toString().slice(-4)}`;
}

async function generateOpeningBalanceId() {
  const last = await IrupuOpeningBalance.findOne().sort({ openingBalanceId: -1 }).lean();
  if (!last || !last.openingBalanceId) {
    return 'IRP-OPB-0001';
  }
  const match = last.openingBalanceId.match(/^IRP-OPB-(\\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `IRP-OPB-${String(nextSeq).padStart(4, '0')}`;
  }
  return `IRP-OPB-${Date.now().toString().slice(-4)}`;
}

/**
 * Get current configured opening balance
 */
async function getCurrentOpeningBalance() {
  const opb = await IrupuOpeningBalance.findOne({ isCurrent: true }).sort({ createdAt: -1 }).lean();
  if (opb) {
    return {
      amountPaise: opb.amountPaise || 0,
      effectiveDate: opb.effectiveDate ? new Date(opb.effectiveDate) : new Date(0),
      remarks: opb.remarks || '',
      setBy: opb.setBy || 'admin',
      updatedAt: opb.updatedAt,
    };
  }
  return {
    amountPaise: 0,
    effectiveDate: new Date(0),
    remarks: 'Default Zero Opening Balance',
    setBy: 'system',
  };
}

/**
 * Helper to compute physical cash disbursement outflow for a loan
 * Consistent Accounting Model:
 * For cash disbursements, gross principal is recorded as the cash disbursement outflow,
 * while the retained upfront interest is counted as a confirmed collection inflow.
 * Net physical cash reduction: -Gross Principal + Upfront Interest = -Net Cash Given.
 * For non-cash disbursements (UPI, Bank Transfer), 0 physical cash left the box.
 */
function getLoanCashDisbursedPaise(loan) {
  // If payment method was non-cash, zero physical cash left the box
  if (loan.disbursementPaymentMethod && loan.disbursementPaymentMethod !== 'CASH') {
    return 0;
  }
  return loan.grossPrincipalPaise || loan.principalPaise || 0;
}

/**
 * Helper to compute physical cash upfront interest retained for a loan
 * Consistent Accounting Model:
 * Retained upfront interest at disbursement is the single authoritative cash event.
 * It is added to the finance cash inflow category (Mon, D.I, D.C) at disbursement.
 * Linked collection receipt records in Collection model serve for receipt printing and ledger,
 * with zero additional cash impact in Irupu.
 */
function getLoanCashUpfrontInterestPaise(loan) {
  if (loan.disbursementPaymentMethod && loan.disbursementPaymentMethod !== 'CASH') {
    return 0;
  }
  return (
    loan.upfrontInterestPaise ||
    loan.calculationConfigSnapshot?.upfrontInterestPaise ||
    loan.monthlyFinanceDetails?.upfrontInterestPaise ||
    loan.dailyFinanceDetails?.upfrontInterestPaise ||
    0
  );
}

/**
 * Helper to accurately resolve collection vattiType across models and legacy codes
 */
function resolveVattiType(col, loanTypeMap, dcAccountSet) {
  // 1. Explicit vattiType on Collection
  if (col.vattiType) {
    const vt = String(col.vattiType).toUpperCase();
    if (vt === 'DAILY' || vt === 'DAILY_FINANCE') return 'DAILY';
    if (vt === 'DAILY_COLLECTION' || vt === 'DC') return 'DAILY_COLLECTION';
    if (vt === 'MONTHLY') return 'MONTHLY';
  }

  // 2. Populated loanId object with vattiType
  if (col.loanId && typeof col.loanId === 'object' && col.loanId.vattiType) {
    const vt = String(col.loanId.vattiType).toUpperCase();
    if (vt === 'DAILY' || vt === 'DAILY_FINANCE') return 'DAILY';
    if (vt === 'DAILY_COLLECTION' || vt === 'DC') return 'DAILY_COLLECTION';
    return 'MONTHLY';
  }

  // 3. loanCode / account code patterns
  const code = (col.loanCode || '').toUpperCase();
  if (code.includes('DC') || code.startsWith('CPN-DC') || code.startsWith('CPR-DC')) {
    return 'DAILY_COLLECTION';
  }

  // 4. Look up loanTypeMap by loanId ObjectId or loanCode
  const loanIdStr = col.loanId ? (col.loanId._id || col.loanId).toString() : null;
  if (loanIdStr && loanTypeMap.has(loanIdStr)) {
    const vt = String(loanTypeMap.get(loanIdStr)).toUpperCase();
    if (vt === 'DAILY' || vt === 'DAILY_FINANCE') return 'DAILY';
    if (vt === 'DAILY_COLLECTION' || vt === 'DC') return 'DAILY_COLLECTION';
    return 'MONTHLY';
  }
  if (code && loanTypeMap.has(code)) {
    const vt = String(loanTypeMap.get(code)).toUpperCase();
    if (vt === 'DAILY' || vt === 'DAILY_FINANCE') return 'DAILY';
    if (vt === 'DAILY_COLLECTION' || vt === 'DC') return 'DAILY_COLLECTION';
    return 'MONTHLY';
  }

  // 5. Check if code or loanId is a known Daily Collection Account
  if (code && dcAccountSet.has(code)) {
    return 'DAILY_COLLECTION';
  }
  if (loanIdStr && dcAccountSet.has(loanIdStr)) {
    return 'DAILY_COLLECTION';
  }

  // Default to MONTHLY
  return 'MONTHLY';
}

/**
 * Main Irupu Cash In Hand Financial Calculation & Reconciliation Engine
 */
async function getIrupuSummary({ startDate, endDate, period = 'all' } = {}) {
  await syncHistoricalUpfrontCollections();
  const currentOpb = await getCurrentOpeningBalance();

  // Determine date bounds in Asia/Kolkata timezone
  let startBound = null;
  let endBound = null;

  const now = DateTime.now().setZone(TIMEZONE);

  if (period === 'today') {
    startBound = now.startOf('day').toJSDate();
    endBound = now.endOf('day').toJSDate();
  } else if (period === 'this_month') {
    startBound = now.startOf('month').toJSDate();
    endBound = now.endOf('month').toJSDate();
  } else if (period === 'this_year') {
    startBound = now.startOf('year').toJSDate();
    endBound = now.endOf('year').toJSDate();
  } else if (startDate || endDate) {
    if (startDate) {
      startBound = getKolkataDate(startDate).startOf('day').toJSDate();
    }
    if (endDate) {
      endBound = getKolkataDate(endDate).endOf('day').toJSDate();
    }
  }

  // Build resilient queries:
  // Exclude reversed and cancelled transactions.
  // Match CASH payment method (case-insensitive, or missing/default cash).
  const cashMethodCondition = {
    $or: [
      { paymentMethod: 'CASH' },
      { paymentMethod: /^cash$/i },
      { paymentMethod: { $exists: false } },
      { paymentMethod: null },
      { paymentMethod: '' },
    ],
  };

  const confirmedStatusCondition = {
    status: { $nin: ['REVERSED', 'reversed', 'CANCELLED', 'cancelled'] },
    $or: [
      { status: 'CONFIRMED' },
      { status: /^confirmed$/i },
      { status: { $exists: false } },
      { status: null },
    ],
  };

  const collectionCashFilter = {
    $and: [confirmedStatusCondition, cashMethodCondition],
  };

  const dcPaymentCashFilter = {
    $and: [confirmedStatusCondition, cashMethodCondition],
  };

  const loanDisbursementFilter = {
    status: { $nin: ['CANCELLED', 'cancelled', 'REVERSED', 'reversed'] },
    $or: [
      { disbursementPaymentMethod: 'CASH' },
      { disbursementPaymentMethod: /^cash$/i },
      { disbursementPaymentMethod: { $exists: false } },
      { disbursementPaymentMethod: null },
      { disbursementPaymentMethod: '' },
    ],
  };

  // Pre-load reference maps for 100% accurate vattiType mapping and upfront interest tracking
  const [allLoansLookup, allDcAccountsLookup] = await Promise.all([
    Loan.find({}, '_id loanId vattiType upfrontReceiptNumber upfrontCollectionId upfrontInterestPaise').lean(),
    DailyCollectionAccount.find({}, '_id accountId upfrontReceiptNumber upfrontInterestPaise').lean(),
  ]);

  const loanTypeMap = new Map();
  const upfrontReceiptSet = new Set();
  const upfrontColIdSet = new Set();
  const loanUpfrontMap = new Map();

  allLoansLookup.forEach((l) => {
    if (l._id) loanTypeMap.set(l._id.toString(), l.vattiType);
    if (l.loanId) loanTypeMap.set(l.loanId.toUpperCase(), l.vattiType);
    if (l.upfrontReceiptNumber) upfrontReceiptSet.add(l.upfrontReceiptNumber);
    if (l.upfrontCollectionId) upfrontColIdSet.add(l.upfrontCollectionId.toString());
    const upf = l.upfrontInterestPaise || 0;
    if (upf > 0) {
      if (l._id) loanUpfrontMap.set(l._id.toString(), upf);
      if (l.loanId) loanUpfrontMap.set(l.loanId.toUpperCase(), upf);
    }
  });

  const dcAccountSet = new Set();
  allDcAccountsLookup.forEach((dc) => {
    if (dc._id) dcAccountSet.add(dc._id.toString());
    if (dc.accountId) dcAccountSet.add(dc.accountId.toUpperCase());
    if (dc.upfrontReceiptNumber) upfrontReceiptSet.add(dc.upfrontReceiptNumber);
    const upf = dc.upfrontInterestPaise || 0;
    if (upf > 0) {
      if (dc._id) loanUpfrontMap.set(dc._id.toString(), upf);
      if (dc.accountId) loanUpfrontMap.set(dc.accountId.toUpperCase(), upf);
    }
  });

  // Multi-layered upfront interest detection helper
  const checkIsUpfront = (col) => {
    // Renewal interest is fresh physical cash inflow and must never be treated as upfront interest
    if (col.isRenewalInterest === true || col.collectionType === 'RENEWAL_INTEREST') return false;
    if (col.isUpfrontInterest === true) return true;
    if (col.collectionType === 'UPFRONT_INTEREST') return true;
    if (col.accountedInDisbursement === true) return true;
    if (col.idempotencyKey && String(col.idempotencyKey).startsWith('UPFRONT-')) return true;
    if (col.receiptNumber && upfrontReceiptSet.has(col.receiptNumber)) return true;
    const colIdStr = col._id ? col._id.toString() : '';
    if (colIdStr && upfrontColIdSet.has(colIdStr)) return true;
    const lid = col.loanId ? (col.loanId._id || col.loanId).toString() : null;
    const lcode = (col.loanCode || '').toUpperCase();
    const upf = (lid && loanUpfrontMap.get(lid)) || (lcode && loanUpfrontMap.get(lcode)) || 0;
    if (upf > 0 && col.interestAllocationPaise === upf && (col.principalAllocationPaise === 0 || !col.principalAllocationPaise)) {
      return true;
    }
    return false;
  };

  // 1. Fetch all confirmed collections (CASH only)
  const collectionsPromise = Collection.find(collectionCashFilter)
    .populate('loanId', 'vattiType loanId customerName')
    .lean();

  // 2. Fetch all daily collection payments (CASH only)
  const dcPaymentsPromise = DailyCollectionPayment.find(dcPaymentCashFilter).lean();

  // 3. Fetch all active investments
  const investmentsPromise = IrupuInvestment.find({
    status: 'ACTIVE',
  }).lean();

  // 4. Fetch all cash loan disbursements
  const loansPromise = Loan.find(loanDisbursementFilter).lean();

  // 5. Fetch all active cash outflows
  const outflowsPromise = IrupuOutflow.find({
    status: 'ACTIVE',
  }).lean();

  const [collections, dcPayments, investments, loans, outflows] = await Promise.all([
    collectionsPromise,
    dcPaymentsPromise,
    investmentsPromise,
    loansPromise,
    outflowsPromise,
  ]);

  // A. All-Time Lifetime Aggregation
  let allTimeMonthlyCashPaise = 0;
  let allTimeDailyFinanceCashPaise = 0;
  let allTimeDailyCollectionCashPaise = 0;
  let allTimeOtherLoanCashPaise = 0;

  // 1. Authoritative accounting for retained upfront interest from cash loan disbursements
  // This is the single cash event for upfront interest (retained in the business cash box).
  loans.forEach((loan) => {
    const upfront = getLoanCashUpfrontInterestPaise(loan);
    if (upfront > 0) {
      const vType = resolveVattiType(loan, loanTypeMap, dcAccountSet);
      if (vType === 'MONTHLY') {
        allTimeMonthlyCashPaise += upfront;
      } else if (vType === 'DAILY') {
        allTimeDailyFinanceCashPaise += upfront;
      } else if (vType === 'DAILY_COLLECTION') {
        allTimeDailyCollectionCashPaise += upfront;
      } else {
        allTimeOtherLoanCashPaise += upfront;
      }
    }
  });

  // 2. Genuine customer collections (Exclude upfront interest collections to avoid duplicate cash inflow)
  collections.forEach((col) => {
    const isUpfront = checkIsUpfront(col);
    if (!isUpfront) {
      const vType = resolveVattiType(col, loanTypeMap, dcAccountSet);
      if (vType === 'MONTHLY') {
        allTimeMonthlyCashPaise += col.totalAmountPaise || 0;
      } else if (vType === 'DAILY') {
        allTimeDailyFinanceCashPaise += col.totalAmountPaise || 0;
      } else if (vType === 'DAILY_COLLECTION') {
        allTimeDailyCollectionCashPaise += col.totalAmountPaise || 0;
      } else {
        allTimeOtherLoanCashPaise += col.totalAmountPaise || 0;
      }
    }
  });

  allTimeDailyCollectionCashPaise += dcPayments.reduce((acc, p) => acc + (p.amountPaise || 0), 0);
  const allTimeInvestmentPaise = investments.reduce((acc, i) => acc + (i.amountPaise || 0), 0);
  const allTimeLoanDisbursementCashPaise = loans.reduce((acc, l) => acc + getLoanCashDisbursedPaise(l), 0);
  const allTimeExpensePaise = outflows
    .filter((o) => o.category === 'EXPENSE')
    .reduce((acc, o) => acc + (o.amountPaise || 0), 0);
  const allTimeWithdrawalPaise = outflows
    .filter((o) => o.category === 'WITHDRAWAL')
    .reduce((acc, o) => acc + (o.amountPaise || 0), 0);
  const allTimeOtherOutflowPaise = outflows
    .filter((o) => o.category === 'OTHER')
    .reduce((acc, o) => acc + (o.amountPaise || 0), 0);

  const allTimeTotalInflowsPaise =
    allTimeMonthlyCashPaise +
    allTimeDailyFinanceCashPaise +
    allTimeOtherLoanCashPaise +
    allTimeDailyCollectionCashPaise +
    allTimeInvestmentPaise;

  const allTimeTotalOutflowsPaise =
    allTimeLoanDisbursementCashPaise +
    allTimeExpensePaise +
    allTimeWithdrawalPaise +
    allTimeOtherOutflowPaise;

  const currentCashInHandPaise =
    currentOpb.amountPaise + allTimeTotalInflowsPaise - allTimeTotalOutflowsPaise;

  // B. Period-Specific Calculations
  let periodOpeningBalancePaise = currentOpb.amountPaise;

  if (startBound) {
    // If startBound is defined, calculate opening balance strictly prior to startBound
    let priorInflowsPaise = 0;
    let priorOutflowsPaise = 0;

    collections.forEach((col) => {
      const isUpfront = checkIsUpfront(col);
      if (!isUpfront && new Date(col.paymentDate) < startBound) {
        priorInflowsPaise += col.totalAmountPaise || 0;
      }
    });

    dcPayments.forEach((p) => {
      if (new Date(p.paymentDate) < startBound) {
        priorInflowsPaise += p.amountPaise || 0;
      }
    });

    investments.forEach((inv) => {
      if (new Date(inv.date) < startBound) {
        priorInflowsPaise += inv.amountPaise || 0;
      }
    });

    loans.forEach((loan) => {
      const dDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
      if (dDate < startBound) {
        priorOutflowsPaise += getLoanCashDisbursedPaise(loan);
        priorInflowsPaise += getLoanCashUpfrontInterestPaise(loan);
      }
    });

    outflows.forEach((out) => {
      if (new Date(out.date) < startBound) {
        priorOutflowsPaise += out.amountPaise || 0;
      }
    });

    periodOpeningBalancePaise = currentOpb.amountPaise + priorInflowsPaise - priorOutflowsPaise;
  }

  // Filter items in period
  const inPeriod = (dateObj) => {
    if (!dateObj) return false;
    const d = new Date(dateObj);
    if (startBound && d < startBound) return false;
    if (endBound && d > endBound) return false;
    return true;
  };

  let periodMonthlyCashPaise = 0;
  let periodDailyFinanceCashPaise = 0;
  let periodDailyCollectionCashPaise = 0;
  let periodInvestmentPaise = 0;
  let periodLoanDisbursementCashPaise = 0;
  let periodExpensePaise = 0;
  let periodWithdrawalPaise = 0;
  let periodOtherOutflowPaise = 0;

  // Track raw chronological entries for the digital cash register
  const registerEntries = [];

  collections.forEach((col) => {
    const isUpfront = checkIsUpfront(col);
    if (!isUpfront && inPeriod(col.paymentDate)) {
      const vType = resolveVattiType(col, loanTypeMap, dcAccountSet);
      const amt = col.totalAmountPaise || 0;
      if (vType === 'MONTHLY') {
        periodMonthlyCashPaise += amt;
      } else if (vType === 'DAILY') {
        periodDailyFinanceCashPaise += amt;
      } else if (vType === 'DAILY_COLLECTION') {
        periodDailyCollectionCashPaise += amt;
      }

      const isRenewal = col.collectionType === 'RENEWAL_INTEREST' || col.isRenewalInterest === true;
      const typeLabel = vType === 'DAILY' ? 'Daily Finance (D.I)' : vType === 'DAILY_COLLECTION' ? 'Daily Collection (D.C)' : 'Monthly Finance (Mon)';
      const particulars = isRenewal
        ? `${vType === 'DAILY' ? 'Daily Finance' : 'Monthly Finance'} Renewal Interest #${col.renewalNumber || 1} – ${col.customerName} (${col.loanCode})`
        : `${vType === 'DAILY' ? 'Daily Finance' : vType === 'DAILY_COLLECTION' ? 'Daily Collection' : 'Monthly Finance'} Cash Collection – ${col.customerName} (${col.loanCode})`;

      registerEntries.push({
        id: col.receiptNumber || col.collectionId,
        date: new Date(col.paymentDate),
        source: vType === 'DAILY' ? 'DAILY_FINANCE' : vType === 'DAILY_COLLECTION' ? 'DAILY_COLLECTION' : 'MONTHLY',
        sourceLabel: typeLabel,
        particulars,
        cashInflowPaise: amt,
        investmentPaise: 0,
        cashOutflowPaise: 0,
        referenceNumber: col.receiptNumber || '',
        performedBy: col.collectedBy || 'admin',
      });
    }
  });

  dcPayments.forEach((p) => {
    if (inPeriod(p.paymentDate)) {
      const amt = p.amountPaise || 0;
      periodDailyCollectionCashPaise += amt;

      registerEntries.push({
        id: p.paymentId,
        date: new Date(p.paymentDate),
        source: 'DAILY_COLLECTION',
        sourceLabel: 'Daily Collection (D.C)',
        particulars: `Daily Collection Cash – ${p.customerName} (${p.accountCode}) Day ${p.dayNumber}`,
        cashInflowPaise: amt,
        investmentPaise: 0,
        cashOutflowPaise: 0,
        referenceNumber: p.paymentId || '',
        performedBy: p.recordedBy || 'admin',
      });
    }
  });

  investments.forEach((inv) => {
    if (inPeriod(inv.date)) {
      const amt = inv.amountPaise || 0;
      periodInvestmentPaise += amt;

      registerEntries.push({
        id: inv.investmentId,
        date: new Date(inv.date),
        source: 'INVESTMENT',
        sourceLabel: 'Investment Added',
        particulars: `Owner Investment – ${inv.description}`,
        cashInflowPaise: amt,
        investmentPaise: amt,
        cashOutflowPaise: 0,
        referenceNumber: inv.referenceNumber || inv.investmentId,
        performedBy: inv.createdBy || 'admin',
      });
    }
  });

  loans.forEach((loan) => {
    const dDate = loan.startDate ? new Date(loan.startDate) : new Date(loan.createdAt);
    if (inPeriod(dDate)) {
      const cashDisbursed = getLoanCashDisbursedPaise(loan);
      const cashUpfront = getLoanCashUpfrontInterestPaise(loan);

      if (cashDisbursed > 0) {
        periodLoanDisbursementCashPaise += cashDisbursed;

        registerEntries.push({
          id: loan.loanId,
          date: dDate,
          source: 'DISBURSEMENT',
          sourceLabel: 'Cash Loan Disbursement',
          particulars: `Disbursed ${loan.vattiType === 'DAILY_COLLECTION' ? 'Daily Collection' : loan.vattiType === 'DAILY' ? 'Daily Finance' : 'Monthly Finance'} Loan in Cash – ${loan.customerName} (${loan.loanId})`,
          cashInflowPaise: 0,
          investmentPaise: 0,
          cashOutflowPaise: cashDisbursed,
          referenceNumber: loan.loanId,
          performedBy: 'admin',
        });
      }

      if (cashUpfront > 0) {
        const vType = resolveVattiType(loan, loanTypeMap, dcAccountSet);
        if (vType === 'MONTHLY') {
          periodMonthlyCashPaise += cashUpfront;
        } else if (vType === 'DAILY') {
          periodDailyFinanceCashPaise += cashUpfront;
        } else if (vType === 'DAILY_COLLECTION') {
          periodDailyCollectionCashPaise += cashUpfront;
        }

        const typeLabel = vType === 'DAILY' ? 'Daily Finance (D.I)' : vType === 'DAILY_COLLECTION' ? 'Daily Collection (D.C)' : 'Monthly Finance (Mon)';

        registerEntries.push({
          id: loan.upfrontReceiptNumber || `UPF-${loan.loanId}`,
          date: dDate,
          source: vType === 'DAILY' ? 'DAILY_FINANCE' : vType === 'DAILY_COLLECTION' ? 'DAILY_COLLECTION' : 'MONTHLY',
          sourceLabel: typeLabel,
          particulars: `Upfront Interest Retained (${typeLabel}) – ${loan.customerName} (${loan.loanId})`,
          cashInflowPaise: cashUpfront,
          investmentPaise: 0,
          cashOutflowPaise: 0,
          referenceNumber: loan.upfrontReceiptNumber || loan.loanId,
          performedBy: 'admin',
        });
      }
    }
  });

  outflows.forEach((out) => {
    if (inPeriod(out.date)) {
      const amt = out.amountPaise || 0;
      if (out.category === 'EXPENSE') {
        periodExpensePaise += amt;
      } else if (out.category === 'WITHDRAWAL') {
        periodWithdrawalPaise += amt;
      } else {
        periodOtherOutflowPaise += amt;
      }

      registerEntries.push({
        id: out.outflowId,
        date: new Date(out.date),
        source: out.category,
        sourceLabel: out.category === 'EXPENSE' ? 'Cash Expense' : out.category === 'WITHDRAWAL' ? 'Cash Withdrawal' : 'Cash Outflow',
        particulars: `Cash Outflow [${out.category}] – ${out.description}`,
        cashInflowPaise: 0,
        investmentPaise: 0,
        cashOutflowPaise: amt,
        referenceNumber: out.referenceNumber || out.outflowId,
        performedBy: out.createdBy || 'admin',
      });
    }
  });

  // Sort register entries chronologically. For same date, order DISBURSEMENT first, then upfront interest / collections
  registerEntries.sort((a, b) => {
    const diff = a.date - b.date;
    if (diff !== 0) return diff;
    if (a.source === 'DISBURSEMENT') return -1;
    if (b.source === 'DISBURSEMENT') return 1;
    return 0;
  });

  // Compute running balance starting from periodOpeningBalancePaise
  let running = periodOpeningBalancePaise;
  const computedRegister = registerEntries.map((item) => {
    running = running + item.cashInflowPaise - item.cashOutflowPaise;
    return {
      ...item,
      runningBalancePaise: running,
      cashInflowRupees: toRupees(item.cashInflowPaise),
      investmentRupees: toRupees(item.investmentPaise),
      cashOutflowRupees: toRupees(item.cashOutflowPaise),
      runningBalanceRupees: toRupees(running),
    };
  });

  const periodTotalInflowsPaise =
    periodMonthlyCashPaise +
    periodDailyFinanceCashPaise +
    periodDailyCollectionCashPaise +
    periodInvestmentPaise;

  const periodTotalOutflowsPaise =
    periodLoanDisbursementCashPaise +
    periodExpensePaise +
    periodWithdrawalPaise +
    periodOtherOutflowPaise;

  const periodClosingBalancePaise =
    periodOpeningBalancePaise + periodTotalInflowsPaise - periodTotalOutflowsPaise;

  // C. Daily Reconciliation Grouping (Matches the Handwritten Cash Diary)
  const dailyGroups = {};
  computedRegister.forEach((entry) => {
    const dayKey = DateTime.fromJSDate(entry.date).setZone(TIMEZONE).toISODate();
    if (!dailyGroups[dayKey]) {
      dailyGroups[dayKey] = {
        date: dayKey,
        monthlyCashPaise: 0,
        dailyFinanceCashPaise: 0,
        dailyCollectionCashPaise: 0,
        investmentPaise: 0,
        disbursementPaise: 0,
        outflowPaise: 0,
        totalDayInflowPaise: 0,
        totalDayOutflowPaise: 0,
        transactionsCount: 0,
        entries: [],
      };
    }
    const g = dailyGroups[dayKey];
    g.transactionsCount += 1;
    g.entries.push(entry);

    if (entry.source === 'MONTHLY') g.monthlyCashPaise += entry.cashInflowPaise;
    else if (entry.source === 'DAILY_FINANCE') g.dailyFinanceCashPaise += entry.cashInflowPaise;
    else if (entry.source === 'DAILY_COLLECTION') g.dailyCollectionCashPaise += entry.cashInflowPaise;
    else if (entry.source === 'INVESTMENT') g.investmentPaise += entry.cashInflowPaise;

    if (entry.source === 'DISBURSEMENT') g.disbursementPaise += entry.cashOutflowPaise;
    else if (['EXPENSE', 'WITHDRAWAL', 'OTHER'].includes(entry.source)) g.outflowPaise += entry.cashOutflowPaise;

    g.totalDayInflowPaise += entry.cashInflowPaise;
    g.totalDayOutflowPaise += entry.cashOutflowPaise;
  });

  // Calculate day-by-day opening and closing balances
  const sortedDayKeys = Object.keys(dailyGroups).sort();
  let dayRunningOpening = periodOpeningBalancePaise;
  const dailyBreakdown = sortedDayKeys.map((dayKey) => {
    const g = dailyGroups[dayKey];
    const opBal = dayRunningOpening;
    const clBal = opBal + g.totalDayInflowPaise - g.totalDayOutflowPaise;
    dayRunningOpening = clBal;

    return {
      date: dayKey,
      displayDate: DateTime.fromISO(dayKey).toFormat('dd LLL yyyy'),
      openingBalanceRupees: toRupees(opBal),
      openingBalancePaise: opBal,
      monthlyCashRupees: toRupees(g.monthlyCashPaise),
      dailyFinanceCashRupees: toRupees(g.dailyFinanceCashPaise),
      dailyCollectionCashRupees: toRupees(g.dailyCollectionCashPaise),
      investmentRupees: toRupees(g.investmentPaise),
      disbursementRupees: toRupees(g.disbursementPaise),
      outflowRupees: toRupees(g.outflowPaise),
      totalDayInflowRupees: toRupees(g.totalDayInflowPaise),
      totalDayOutflowRupees: toRupees(g.totalDayOutflowPaise),
      closingBalanceRupees: toRupees(clBal),
      closingBalancePaise: clBal,
      transactionsCount: g.transactionsCount,
    };
  });

  return {
    success: true,
    period: {
      key: period,
      startDate: startBound ? DateTime.fromJSDate(startBound).setZone(TIMEZONE).toISODate() : null,
      endDate: endBound ? DateTime.fromJSDate(endBound).setZone(TIMEZONE).toISODate() : null,
    },
    // Top KPIs
    currentCashInHandRupees: toRupees(currentCashInHandPaise),
    currentCashInHandPaise,
    allTimeTotalCollectedRupees: toRupees(allTimeMonthlyCashPaise + allTimeDailyFinanceCashPaise + allTimeDailyCollectionCashPaise),
    allTimeTotalInvestmentRupees: toRupees(allTimeInvestmentPaise),
    allTimeTotalOutflowRupees: toRupees(allTimeTotalOutflowsPaise),

    // Lifetime Source-Wise Cash Collections Breakdown
    allTimeSummary: {
      monthlyFinanceCashRupees: toRupees(allTimeMonthlyCashPaise),
      monthlyFinanceCashPaise: allTimeMonthlyCashPaise,
      dailyFinanceCashRupees: toRupees(allTimeDailyFinanceCashPaise),
      dailyFinanceCashPaise: allTimeDailyFinanceCashPaise,
      dailyCollectionCashRupees: toRupees(allTimeDailyCollectionCashPaise),
      dailyCollectionCashPaise: allTimeDailyCollectionCashPaise,
      investmentRupees: toRupees(allTimeInvestmentPaise),
      investmentPaise: allTimeInvestmentPaise,
      totalFinanceCollectionsRupees: toRupees(allTimeMonthlyCashPaise + allTimeDailyFinanceCashPaise + allTimeDailyCollectionCashPaise),
      totalFinanceCollectionsPaise: allTimeMonthlyCashPaise + allTimeDailyFinanceCashPaise + allTimeDailyCollectionCashPaise,
      totalInflowsRupees: toRupees(allTimeTotalInflowsPaise),
      totalInflowsPaise: allTimeTotalInflowsPaise,
      disbursementRupees: toRupees(allTimeLoanDisbursementCashPaise),
      disbursementPaise: allTimeLoanDisbursementCashPaise,
      totalOutflowsRupees: toRupees(allTimeTotalOutflowsPaise),
      totalOutflowsPaise: allTimeTotalOutflowsPaise,
      currentCashInHandRupees: toRupees(currentCashInHandPaise),
      currentCashInHandPaise,
    },

    // Period Summary
    periodSummary: {
      openingBalanceRupees: toRupees(periodOpeningBalancePaise),
      openingBalancePaise: periodOpeningBalancePaise,

      // Source-wise collections (Matching Handwritten Diary: Mon, D.C, D.I)
      monthlyFinanceCashRupees: toRupees(periodMonthlyCashPaise),
      monthlyFinanceCashPaise: periodMonthlyCashPaise,
      monthlyCashRupees: toRupees(periodMonthlyCashPaise),
      monthlyCashPaise: periodMonthlyCashPaise,
      dailyFinanceCashRupees: toRupees(periodDailyFinanceCashPaise),
      dailyFinanceCashPaise: periodDailyFinanceCashPaise,
      dailyCollectionCashRupees: toRupees(periodDailyCollectionCashPaise),
      dailyCollectionCashPaise: periodDailyCollectionCashPaise,
      totalFinanceCollectionsRupees: toRupees(periodMonthlyCashPaise + periodDailyFinanceCashPaise + periodDailyCollectionCashPaise),
      totalFinanceCollectionsPaise: periodMonthlyCashPaise + periodDailyFinanceCashPaise + periodDailyCollectionCashPaise,

      investmentRupees: toRupees(periodInvestmentPaise),
      investmentPaise: periodInvestmentPaise,

      totalInflowsRupees: toRupees(periodTotalInflowsPaise),
      totalInflowsPaise: periodTotalInflowsPaise,

      // Outflows breakdown
      disbursementRupees: toRupees(periodLoanDisbursementCashPaise),
      disbursementPaise: periodLoanDisbursementCashPaise,
      expenseRupees: toRupees(periodExpensePaise),
      expensePaise: periodExpensePaise,
      withdrawalRupees: toRupees(periodWithdrawalPaise),
      withdrawalPaise: periodWithdrawalPaise,
      otherOutflowRupees: toRupees(periodOtherOutflowPaise),
      otherOutflowPaise: periodOtherOutflowPaise,

      totalOutflowsRupees: toRupees(periodTotalOutflowsPaise),
      totalOutflowsPaise: periodTotalOutflowsPaise,

      closingBalanceRupees: toRupees(periodClosingBalancePaise),
      closingBalancePaise: periodClosingBalancePaise,
    },

    // Daily diary breakdown & chronological register
    dailyBreakdown,
    cashRegister: computedRegister.reverse(), // most recent first for table view
    configuredOpeningBalance: {
      amountRupees: toRupees(currentOpb.amountPaise),
      amountPaise: currentOpb.amountPaise,
      effectiveDate: currentOpb.effectiveDate,
      remarks: currentOpb.remarks,
      setBy: currentOpb.setBy,
    },
  };
}

module.exports = {
  generateInvestmentId,
  generateOutflowId,
  generateOpeningBalanceId,
  getCurrentOpeningBalance,
  getIrupuSummary,
  getLoanCashDisbursedPaise,
};
