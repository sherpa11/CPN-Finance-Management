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
 * Helper to compute net cash disbursed for a loan
 */
function getLoanCashDisbursedPaise(loan) {
  // If payment method was non-cash, zero physical cash left the box
  if (loan.disbursementPaymentMethod && loan.disbursementPaymentMethod !== 'CASH') {
    return 0;
  }
  if (loan.netDisbursementPaise !== undefined && loan.netDisbursementPaise !== null) {
    return loan.netDisbursementPaise;
  }
  // Upfront interest was retained in the cash box, so only principal - upfrontInterest left the cash box
  const upfront = loan.upfrontInterestPaise || 0;
  return Math.max(0, (loan.principalPaise || 0) - upfront);
}

/**
 * Safely and idempotently backfill upfront collections for existing loans with upfront interest
 */
async function syncHistoricalUpfrontCollections() {
  try {
    const loans = await Loan.find({
      upfrontInterestPaise: { $gt: 0 },
      status: { $nin: ['CANCELLED', 'REVERSED'] },
    }).lean();

    for (const loan of loans) {
      const existing = await Collection.findOne({
        $or: [
          { idempotencyKey: `UPFRONT-${loan.loanId}` },
          { loanId: loan._id, isUpfrontInterest: true },
        ],
      });

      if (!existing) {
        const upfrontColId = await generateCollectionId();
        const upfrontReceiptNum = await generateReceiptNumber();

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
          collectionType: 'UPFRONT_INTEREST',
          vattiType: loan.vattiType || 'MONTHLY',
          previousOutstandingPrincipalPaise: loan.grossPrincipalPaise || loan.principalPaise,
          previousOutstandingInterestPaise: loan.upfrontInterestPaise,
          remainingPrincipalPaise: loan.grossPrincipalPaise || loan.principalPaise,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: 'admin',
          remarks: 'Upfront interest deducted during disbursement',
          idempotencyKey: `UPFRONT-${loan.loanId}`,
        });

        await newCol.save();
        await Loan.findByIdAndUpdate(loan._id, {
          upfrontCollectionId: newCol._id,
          upfrontReceiptNumber: upfrontReceiptNum,
        });
      } else if (!loan.upfrontCollectionId || !loan.upfrontReceiptNumber) {
        await Loan.findByIdAndUpdate(loan._id, {
          upfrontCollectionId: existing._id,
          upfrontReceiptNumber: existing.receiptNumber,
        });
      }
    }

    const dcAccounts = await DailyCollectionAccount.find({
      scheme: 'UPFRONT_DEDUCTION',
      upfrontInterestPaise: { $gt: 0 },
      status: { $nin: ['CANCELLED', 'REVERSED'] },
    }).lean();

    for (const dc of dcAccounts) {
      const existing = await Collection.findOne({
        $or: [
          { idempotencyKey: `UPFRONT-${dc.accountId}` },
          { loanCode: dc.loanCode, isUpfrontInterest: true },
        ],
      });

      if (!existing) {
        const upfrontColId = await generateCollectionId();
        const upfrontReceiptNum = await generateReceiptNumber();

        const newCol = new Collection({
          collectionId: upfrontColId,
          receiptNumber: upfrontReceiptNum,
          loanId: dc.loanId,
          loanCode: dc.loanCode,
          customerId: dc.customerId,
          customerName: dc.customerName,
          paymentDate: dc.startDate || dc.createdAt || new Date(),
          paymentMethod: 'CASH',
          totalAmountPaise: dc.upfrontInterestPaise,
          principalAllocationPaise: 0,
          interestAllocationPaise: dc.upfrontInterestPaise,
          penaltyAllocationPaise: 0,
          isUpfrontInterest: true,
          collectionType: 'UPFRONT_INTEREST',
          vattiType: 'DAILY_COLLECTION',
          previousOutstandingPrincipalPaise: dc.grossPrincipalPaise,
          previousOutstandingInterestPaise: dc.upfrontInterestPaise,
          remainingPrincipalPaise: dc.grossPrincipalPaise,
          remainingInterestPaise: 0,
          status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
          collectedBy: 'admin',
          remarks: 'Upfront interest deducted during disbursement',
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
        }
      }
    }
  } catch (err) {
    console.error('[syncHistoricalUpfrontCollections Error]', err.message);
  }
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

  // 1. Fetch all confirmed collections (CASH only)
  const collectionsPromise = Collection.find({
    status: 'CONFIRMED',
    paymentMethod: 'CASH',
  })
    .populate('loanId', 'vattiType loanId customerName')
    .lean();

  // 2. Fetch all daily collection payments (CASH only)
  const dcPaymentsPromise = DailyCollectionPayment.find({
    status: 'CONFIRMED',
    paymentMethod: 'CASH',
  }).lean();

  // 3. Fetch all active investments
  const investmentsPromise = IrupuInvestment.find({
    status: 'ACTIVE',
  }).lean();

  // 4. Fetch all cash loan disbursements
  const loansPromise = Loan.find({
    $or: [
      { disbursementPaymentMethod: 'CASH' },
      { disbursementPaymentMethod: { $exists: false } },
    ],
  }).lean();

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

  collections.forEach((col) => {
    const vType = col.vattiType || col.loanId?.vattiType || (col.loanCode?.startsWith('CPR-DC') ? 'DAILY_COLLECTION' : 'MONTHLY');
    if (vType === 'MONTHLY') {
      allTimeMonthlyCashPaise += col.totalAmountPaise || 0;
    } else if (vType === 'DAILY') {
      allTimeDailyFinanceCashPaise += col.totalAmountPaise || 0;
    } else if (vType === 'DAILY_COLLECTION') {
      allTimeDailyCollectionCashPaise += col.totalAmountPaise || 0;
    } else {
      allTimeOtherLoanCashPaise += col.totalAmountPaise || 0;
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
      if (new Date(col.paymentDate) < startBound) {
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
    if (inPeriod(col.paymentDate)) {
      const vType = col.vattiType || col.loanId?.vattiType || (col.loanCode?.startsWith('CPR-DC') ? 'DAILY_COLLECTION' : 'MONTHLY');
      const amt = col.totalAmountPaise || 0;
      if (vType === 'MONTHLY') {
        periodMonthlyCashPaise += amt;
      } else if (vType === 'DAILY') {
        periodDailyFinanceCashPaise += amt;
      } else if (vType === 'DAILY_COLLECTION') {
        periodDailyCollectionCashPaise += amt;
      }

      const typeLabel = vType === 'DAILY' ? 'Daily Finance (D.I)' : vType === 'DAILY_COLLECTION' ? 'Daily Collection (D.C)' : 'Monthly Finance (Mon)';
      const particulars = col.isUpfrontInterest
        ? `Upfront Interest Retained (${typeLabel}) – ${col.customerName} (${col.loanCode})`
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

  // Sort register entries chronologically
  registerEntries.sort((a, b) => a.date - b.date);

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
