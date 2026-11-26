/**
 * CPN RAJA – FINANCE MANAGEMENT SYSTEM
 * Centralized Financial Calculation Engine
 * 
 * Rules:
 * 1. Financial accuracy is highest priority.
 * 2. All monetary calculations use integer paise (1 INR = 100 paise).
 * 3. Never use ordinary floating-point calculations for financial balances.
 * 4. Business dates use Asia/Kolkata timezone.
 * 5. Simple interest initially (no automatic compounding).
 * 6. Partial-month rules and date-inclusion conventions are configurable.
 * 7. MEATER Finance explicitly signals "Calculation configuration pending"
 *    and produces no automatic calculations until owner confirms.
 */

const { DateTime } = require('luxon');
const CONSTANTS = require('../config/constants');

const TIMEZONE = CONSTANTS.DEFAULT_TIMEZONE;

/**
 * Currency Conversion Utilities
 */
function toPaise(amountInRupees) {
  if (amountInRupees === null || amountInRupees === undefined || isNaN(amountInRupees)) {
    return 0;
  }
  // Use string conversion to avoid IEEE 754 float multiplication quirks (e.g. 19.99 * 100)
  const str = Number(amountInRupees).toFixed(2);
  const [whole, decimal = '00'] = str.split('.');
  const paddedDecimal = (decimal + '00').slice(0, 2);
  return parseInt(whole, 10) * 100 + parseInt(paddedDecimal, 10);
}

function toRupees(amountInPaise) {
  if (!amountInPaise || isNaN(amountInPaise)) return 0;
  return Number((Math.round(amountInPaise) / 100).toFixed(2));
}

function formatINR(amountInPaise) {
  const rupees = toRupees(amountInPaise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Get date boundary in Asia/Kolkata
 */
function getKolkataDate(dateInput) {
  if (!dateInput) return DateTime.now().setZone(TIMEZONE).startOf('day');
  if (dateInput instanceof Date) {
    return DateTime.fromJSDate(dateInput, { zone: TIMEZONE }).startOf('day');
  }
  if (typeof dateInput === 'string') {
    // If date string e.g. YYYY-MM-DD
    const iso = DateTime.fromISO(dateInput, { zone: TIMEZONE }).startOf('day');
    if (iso.isValid) return iso;
  }
  return DateTime.fromJSDate(new Date(dateInput), { zone: TIMEZONE }).startOf('day');
}

/**
 * Monthly Finance Calculation
 * 
 * Formula:
 * Monthly Interest = Principal × Monthly Rate × Number of Eligible Months / 100
 * 
 * Configurable Partial Month Rules:
 * - PRO_RATA_DAILY: Daily fraction based on actual days in the partial month
 * - THIRTY_DAY_BASE: Daily fraction based on 30-day base
 * - FULL_MONTH_IF_STARTED: If partial month started, count as full month
 * - NO_INTEREST_IF_PARTIAL: Only count fully completed calendar months
 */
function calculateMonthlyInterest({
  principalPaise,
  monthlyRatePercent,
  startDate,
  asOfDate,
  config = {},
}) {
  if (!principalPaise || principalPaise <= 0 || !monthlyRatePercent || monthlyRatePercent <= 0) {
    return {
      principalPaise: principalPaise || 0,
      monthlyRatePercent: monthlyRatePercent || 0,
      eligibleMonths: 0,
      fullMonths: 0,
      partialDays: 0,
      interestPaise: 0,
      totalPayablePaise: principalPaise || 0,
      partialMonthRule: config.partialMonthRule || CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY,
      isPendingOwnerConfirmation: !!config.isPendingOwnerConfirmation,
    };
  }

  const start = getKolkataDate(startDate);
  const target = getKolkataDate(asOfDate);

  if (target <= start) {
    return {
      principalPaise,
      monthlyRatePercent,
      eligibleMonths: 0,
      fullMonths: 0,
      partialDays: 0,
      interestPaise: 0,
      totalPayablePaise: principalPaise,
      partialMonthRule: config.partialMonthRule || CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY,
      isPendingOwnerConfirmation: !!config.isPendingOwnerConfirmation,
    };
  }

  // Count full completed months and partial days
  let current = start;
  let fullMonths = 0;

  // Advance month by month respecting calendar month-ends (e.g. Jan 31 -> Feb 28 -> Mar 31)
  while (true) {
    const nextMonth = current.plus({ months: 1 });
    if (nextMonth <= target) {
      fullMonths += 1;
      current = nextMonth;
    } else {
      break;
    }
  }

  const partialDays = Math.max(0, Math.floor(target.diff(current, 'days').days));
  const partialMonthRule = config.partialMonthRule || CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY;

  let partialMonthFraction = 0;
  if (partialDays > 0) {
    if (partialMonthRule === CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY) {
      // Days in the current incomplete month
      const daysInCurrentMonth = current.daysInMonth || 30;
      partialMonthFraction = partialDays / daysInCurrentMonth;
    } else if (partialMonthRule === CONSTANTS.MONTHLY_PARTIAL_RULES.THIRTY_DAY_BASE) {
      partialMonthFraction = partialDays / 30;
    } else if (partialMonthRule === CONSTANTS.MONTHLY_PARTIAL_RULES.FULL_MONTH_IF_STARTED) {
      partialMonthFraction = 1;
    } else if (partialMonthRule === CONSTANTS.MONTHLY_PARTIAL_RULES.NO_INTEREST_IF_PARTIAL) {
      partialMonthFraction = 0;
    }
  }

  const eligibleMonths = fullMonths + partialMonthFraction;

  // Interest (Paise) = round(PrincipalPaise * RatePercent * EligibleMonths / 100)
  // Use integer arithmetic: (principalPaise * (RatePercent * 10000) * (eligibleMonths * 10000)) / (100 * 10000 * 10000)
  const interestPaise = Math.round((principalPaise * monthlyRatePercent * eligibleMonths) / 100);
  // Owner Business Rule: Interest is deducted upfront from principal amount.
  // Customer receives net cash (Net Cash Given = P - Interest).
  // Customer repays the full original principal (Total Repayable Cash = Full Principal P, e.g. 5L).
  const netAmountGivenPaise = Math.max(0, principalPaise - interestPaise);
  const totalPayablePaise = principalPaise;

  return {
    principalPaise,
    grossPrincipalPaise: principalPaise,
    monthlyRatePercent,
    fullMonths,
    partialDays,
    eligibleMonths: Number(eligibleMonths.toFixed(4)),
    interestPaise,
    upfrontInterestPaise: interestPaise,
    netAmountGivenPaise,
    totalPayablePaise,
    partialMonthRule,
    isUpfrontDeduction: true,
    isPendingOwnerConfirmation: config.isPendingOwnerConfirmation !== undefined ? !!config.isPendingOwnerConfirmation : (partialDays > 0),
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      lastFullMonthBoundary: current.toISODate(),
      formula: 'Interest = P × Monthly Rate × Eligible Months / 100; Net Amount Given = P - Interest; Total Repayable Cash = Principal (P)',
    },
  };
}

/**
 * Daily Finance Calculation
 * 
 * Business Rule: Upfront Interest Deduction
 * - Upfront Interest = Principal × Rate% / 100
 * - Net Cash Disbursed = Principal - Upfront Interest
 * - Total Daily Repayment = Full Original Principal
 * - Customer repays the full original principal through daily instalments.
 * - Daily Instalment = Principal / Eligible Days
 * - Total Interest Collected = Upfront Interest (collected upfront upon disbursement, never charged again)
 * - Total Cash Received from Customer = Full Original Principal
 * - Total Business Receipt = Full Principal + Upfront Interest
 * - Total Profit = Upfront Interest
 */
function calculateDailyInterest({
  principalPaise,
  dailyRatePercent,
  startDate,
  asOfDate,
  config = {},
}) {
  if (!principalPaise || principalPaise <= 0 || dailyRatePercent === undefined || dailyRatePercent === null) {
    return {
      principalPaise: principalPaise || 0,
      grossPrincipalPaise: principalPaise || 0,
      dailyRatePercent: dailyRatePercent || 0,
      eligibleDays: 0,
      interestPaise: 0,
      upfrontInterestPaise: 0,
      netDisbursementPaise: principalPaise || 0,
      netAmountGivenPaise: principalPaise || 0,
      totalPayablePaise: principalPaise || 0,
      dailyInstalmentPaise: 0,
      isUpfrontDeduction: true,
      dateInclusionConvention: config.dateInclusionConvention || CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END,
    };
  }

  const start = getKolkataDate(startDate);
  const target = getKolkataDate(asOfDate);

  const rawDiffDays = Math.max(1, Math.floor(target.diff(start, 'days').days));
  const dateInclusionConvention = config.dateInclusionConvention || CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END;

  let eligibleDays = rawDiffDays;
  if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_BOTH) {
    eligibleDays = rawDiffDays + 1;
  } else if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END) {
    eligibleDays = rawDiffDays;
  } else if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.EXCLUDE_START_INCLUDE_END) {
    eligibleDays = rawDiffDays;
  }

  eligibleDays = Math.max(1, eligibleDays);

  // Upfront Interest = Principal × Rate% / 100
  const upfrontInterestPaise = Math.round((principalPaise * dailyRatePercent) / 100);
  const netDisbursementPaise = Math.max(0, principalPaise - upfrontInterestPaise);

  // Customer repays the full original principal through daily instalments
  const totalPayablePaise = principalPaise;
  const dailyInstalmentPaise = Math.floor(principalPaise / eligibleDays);

  return {
    principalPaise,
    grossPrincipalPaise: principalPaise,
    dailyRatePercent,
    eligibleDays,
    durationDays: eligibleDays,
    interestPaise: upfrontInterestPaise,
    upfrontInterestPaise,
    netDisbursementPaise,
    netAmountGivenPaise: netDisbursementPaise,
    totalPayablePaise,
    dailyInstalmentPaise,
    isUpfrontDeduction: true,
    dateInclusionConvention,
    isPendingOwnerConfirmation: !!config.isPendingOwnerConfirmation,
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      eligibleDays,
      dailyInstalmentPaise,
      formula: 'Upfront Interest = Principal × Rate / 100; Net Disbursed = Principal - Upfront Interest; Total Repayment = Principal',
    },
  };
}

/**
 * Meater Finance Calculation
 * 
 * IMPORTANT: The owner has NOT yet confirmed the exact calculation formula.
 * Must show explicit "Calculation configuration pending" status.
 * Do not invent an unconfirmed formula.
 */
function calculateMeaterInterest({
  principalPaise,
  ratePercent,
  startDate,
  asOfDate,
  config = {},
}) {
  const start = getKolkataDate(startDate);
  const target = getKolkataDate(asOfDate);

  // Check if owner has confirmed a custom formula in config
  if (config.isFormulaConfirmed && typeof config.customFormulaEvaluator === 'function') {
    return config.customFormulaEvaluator({
      principalPaise,
      ratePercent,
      startDate: start,
      asOfDate: target,
      config,
    });
  }

  return {
    principalPaise: principalPaise || 0,
    ratePercent: ratePercent || 0,
    eligibleUnits: 0,
    interestPaise: 0,
    totalPayablePaise: principalPaise || 0,
    status: 'PENDING_CONFIRMATION',
    isPendingOwnerConfirmation: true,
    message: 'Calculation configuration pending: Meater Finance formula is awaiting owner confirmation as per business specification. Loan details are saved and managed independently.',
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      formula: 'Pending Owner Confirmation',
    },
  };
}

/**
 * Daily Collection – Scheme A: Upfront Interest Deduction (முன் வட்டி)
 * 
 * Rules:
 * - Customer repays original gross loan amount through 70 or 100 equal daily instalments.
 * - Daily Instalment = Gross Loan Amount / totalDurationDays (70 or 100)
 * - Net Amount Given to Customer = Gross Loan Amount - Upfront Interest Deduction
 * - Upfront interest can be specified as fixed paise or percentage with two-way sync.
 * - Upfront interest is deducted at inception and NEVER collected again in daily instalments.
 * - Duration: Exactly 70 or 100 calendar days.
 * - Start Date is Day 1. Expected Completion Date = Start Date + (duration - 1) days.
 * - Final Day (Day 70 or Day 100) absorbs any integer division remainder (odd paise).
 */
function calculateDailyCollectionSchemeA({
  grossLoanAmountPaise,
  upfrontInterestPaise,
  upfrontInterestPercent,
  startDate,
  totalDurationDays = 100,
}) {
  const gross = Math.round(grossLoanAmountPaise || 0);
  if (gross <= 0) {
    throw new Error('Gross loan amount must be greater than zero.');
  }

  let upfrontPaise = 0;
  let upfrontPercent = 0;

  if (upfrontInterestPaise !== undefined && upfrontInterestPaise !== null && upfrontInterestPaise !== '') {
    upfrontPaise = Math.round(Number(upfrontInterestPaise));
    upfrontPercent = Number(((upfrontPaise / gross) * 100).toFixed(2));
  } else if (upfrontInterestPercent !== undefined && upfrontInterestPercent !== null && upfrontInterestPercent !== '') {
    upfrontPercent = Number(upfrontInterestPercent);
    upfrontPaise = Math.round((gross * upfrontPercent) / 100);
  }

  if (upfrontPaise < 0 || upfrontPaise > gross) {
    throw new Error('Upfront interest deduction cannot be negative or exceed gross loan amount.');
  }

  const duration = Number(totalDurationDays) === 70 ? 70 : 100;
  const netDisbursementPaise = gross - upfrontPaise;
  const dailyInstalmentPaise = Math.floor(gross / duration);
  const totalRepaymentPaise = gross;

  const startKolkata = getKolkataDate(startDate);
  const expectedCompletionDate = startKolkata.plus({ days: duration - 1 });

  // Generate schedule for duration days (70 or 100)
  const schedule = [];
  let principalRunningSum = 0;
  for (let day = 1; day <= duration; day++) {
    const scheduledDate = startKolkata.plus({ days: day - 1 });
    let expectedPaise = dailyInstalmentPaise;
    if (day === duration) {
      expectedPaise = gross - principalRunningSum;
    } else {
      principalRunningSum += dailyInstalmentPaise;
    }

    schedule.push({
      dayNumber: day,
      scheduledDate: scheduledDate.toJSDate(),
      category: 'PRINCIPAL',
      expectedPaise,
      collectedPaise: 0,
      status: 'UPCOMING',
    });
  }

  return {
    scheme: 'UPFRONT_DEDUCTION',
    schemeLabel: `Daily Collection: Upfront Interest Deduction (${duration} Days / முன் வட்டி)`,
    grossLoanAmountPaise: gross,
    grossPrincipalPaise: gross,
    upfrontInterestPaise: upfrontPaise,
    upfrontInterestPercent: upfrontPercent,
    netDisbursementPaise,
    dailyInstalmentPaise,
    principalRepaymentDays: duration,
    additionalInterestDays: 0,
    totalDurationDays: duration,
    totalRepaymentPaise,
    interestPaise: upfrontPaise,
    startDate: startKolkata.toISODate(),
    expectedCompletionDate: expectedCompletionDate.toISODate(),
    schedule,
  };
}

/**
 * Daily Collection – Scheme B: Extended Days (கூடுதல் நாட்கள்)
 * 
 * Rules:
 * - Customer receives full Gross Principal (Net Disbursement = Gross Principal).
 * - First 100 days: Principal repayment.
 * - Additional 10 to 20 days: Interest repayment.
 * - Daily Instalment = Gross Principal / 100 (remains identical for both principal and additional days).
 * - Additional Interest = Daily Instalment × Additional Days.
 * - Total Duration = 100 + Additional Days (110 to 120 days).
 * - Total Repayment = Daily Instalment × Total Duration = Principal + Additional Interest.
 * - Start Date is Day 1. Expected Completion Date = Start Date + (Total Duration - 1) days.
 * - Final Day 100 absorbs any odd paise on principal; Additional days each equal dailyInstalmentPaise.
 */
function calculateDailyCollectionSchemeB({
  grossPrincipalPaise,
  additionalInterestDays = 10,
  startDate,
}) {
  const gross = Math.round(grossPrincipalPaise || 0);
  if (gross <= 0) {
    throw new Error('Gross principal amount must be greater than zero.');
  }

  const addDays = Math.round(Number(additionalInterestDays || 10));
  if (addDays < 10 || addDays > 20) {
    throw new Error('Additional interest days must be between 10 and 20 days.');
  }

  const netDisbursementPaise = gross;
  const dailyInstalmentPaise = Math.floor(gross / 100);
  const principalRepaymentDays = 100;
  const additionalInterestPaise = dailyInstalmentPaise * addDays;
  const totalDurationDays = principalRepaymentDays + addDays;
  const totalRepaymentPaise = gross + additionalInterestPaise;

  const startKolkata = getKolkataDate(startDate);
  const expectedCompletionDate = startKolkata.plus({ days: totalDurationDays - 1 });

  // Generate 110-120 day schedule
  const schedule = [];
  let principalRunningSum = 0;

  // Days 1-100: Principal
  for (let day = 1; day <= 100; day++) {
    const scheduledDate = startKolkata.plus({ days: day - 1 });
    let expectedPaise = dailyInstalmentPaise;
    if (day === 100) {
      expectedPaise = gross - principalRunningSum;
    } else {
      principalRunningSum += dailyInstalmentPaise;
    }

    schedule.push({
      dayNumber: day,
      scheduledDate: scheduledDate.toJSDate(),
      category: 'PRINCIPAL',
      expectedPaise,
      collectedPaise: 0,
      status: 'UPCOMING',
    });
  }

  // Days 101 to TotalDuration: Additional Interest
  for (let day = 101; day <= totalDurationDays; day++) {
    const scheduledDate = startKolkata.plus({ days: day - 1 });
    schedule.push({
      dayNumber: day,
      scheduledDate: scheduledDate.toJSDate(),
      category: 'INTEREST',
      expectedPaise: dailyInstalmentPaise,
      collectedPaise: 0,
      status: 'UPCOMING',
    });
  }

  return {
    scheme: 'EXTENDED_DAYS',
    schemeLabel: 'Scheme B: Extended Days (கூடுதல் நாட்கள்)',
    grossPrincipalPaise: gross,
    grossLoanAmountPaise: gross,
    upfrontInterestPaise: 0,
    upfrontInterestPercent: 0,
    netDisbursementPaise,
    dailyInstalmentPaise,
    principalRepaymentDays: 100,
    additionalInterestDays: addDays,
    additionalInterestPaise,
    totalDurationDays,
    totalRepaymentPaise,
    interestPaise: additionalInterestPaise,
    startDate: startKolkata.toISODate(),
    expectedCompletionDate: expectedCompletionDate.toISODate(),
    schedule,
  };
}

/**
 * Client-Confirmed Penalty Calculation for Daily Collection
 * 
 * Business Rules:
 * 1. Monthly Finance: NO penalty under any circumstances (1-month renewal workflow).
 * 2. Daily Finance: NO penalty under any circumstances (10-day renewal workflow).
 * 3. Daily Collection (Scheme A & Scheme B):
 *    - Rate: Account-specific penalty rate (configurable per account, e.g. 2%, 5%, 10%).
 *    - Formula: Daily Penalty = Original Gross Principal × (Penalty Rate / 100)
 *    - Penalty Start Date: Day D+1 (e.g. Day 101 for 100-day collection, or Day 71 for 70-day collection).
 *    - Days 1 through D: No penalty. Never apply penalty on Day D.
 *    - Day D+1: 1 overdue day (1 × Daily Penalty).
 *    - Day D+2: 2 overdue days (2 × Daily Penalty), etc.
 *    - Cumulative Penalty = Overdue Days × Daily Penalty Amount.
 *    - Stop adding penalties once scheduled amount is fully repaid.
 *    - Penalty Outstanding = Cumulative Penalty - Penalty Paid.
 *    - Total Amount to Close = Outstanding Principal + Outstanding Interest + Penalty Outstanding.
 * 
 * Strict Separation:
 * - Upfront interest collected at disbursement is NOT penalized or deducted again.
 * - Renewal interest collected at loan renewal is NOT penalized and does NOT reduce principal.
 * - Penalty payments are NOT treated as principal repayment.
 * - Assessed penalty is NOT counted as collected cash until customer actually pays it.
 */
function calculateDailyPenalty({
  grossPrincipalPaise,
  dailyRepaymentAmountPaise,
  totalDurationDays = 100,
  upfrontInterestPaise = null,
  dueDate,
  asOfDate,
  isFullyRepaid = false,
  fullRepaymentDate = null,
  penaltyPaidPaise = 0,
  penaltyRatePercent = 2.0,
}) {
  const rate = Number(penaltyRatePercent) >= 0 ? Number(penaltyRatePercent) : 2.0;
  const gross = grossPrincipalPaise !== undefined && grossPrincipalPaise !== null ? Math.round(grossPrincipalPaise) : 0;
  const dailyInstalment = Math.round(dailyRepaymentAmountPaise || 0);
  const basePaise = gross > 0 ? gross : (dailyInstalment > 0 ? dailyInstalment * (Number(totalDurationDays) > 0 ? Number(totalDurationDays) : 100) : 0);

  const days = Number(totalDurationDays) > 0
    ? Number(totalDurationDays)
    : (gross > 0 && dailyInstalment > 0 ? Math.round(gross / dailyInstalment) : 100);

  if (basePaise <= 0) {
    return {
      isPenaltyApplicable: false,
      penaltyRatePercent: rate,
      overduePenaltyRate: rate,
      grossPrincipalPaise: 0,
      dailyRepaymentAmountPaise: dailyInstalment,
      totalDurationDays: days,
      totalInterestPaise: 0,
      dailyPenaltyPaise: 0,
      overdueDays: 0,
      cumulativePenaltyPaise: 0,
      penaltyPaidPaise: 0,
      penaltyOutstandingPaise: 0,
    };
  }

  // Interest of total principal
  const totalInterestPaise = Math.round((basePaise * rate) / 100);

  // Due per day = interest of total principal / number of days
  const dailyPenaltyPaise = days > 0
    ? Math.round(totalInterestPaise / days)
    : totalInterestPaise;

  const due = getKolkataDate(dueDate);
  // If loan was fully repaid, penalties stop accruing on full repayment date
  const target = isFullyRepaid && fullRepaymentDate
    ? getKolkataDate(fullRepaymentDate)
    : getKolkataDate(asOfDate);

  // Overdue Days = Max(0, target - due)
  // Note: If target is due date (Day D), target.diff(due, 'days').days is 0 -> 0 overdue days!
  // If target is Day D+1, diff is 1 -> 1 overdue day -> 1 × dailyPenaltyPaise
  const diffDays = Math.floor(target.diff(due, 'days').days);
  const overdueDays = Math.max(0, diffDays);

  const cumulativePenaltyPaise = overdueDays * dailyPenaltyPaise;
  const paid = Math.max(0, Math.round(penaltyPaidPaise || 0));
  const penaltyOutstandingPaise = Math.max(0, cumulativePenaltyPaise - paid);

  return {
    isPenaltyApplicable: true,
    penaltyRatePercent: rate,
    overduePenaltyRate: rate,
    grossPrincipalPaise: basePaise,
    dailyRepaymentAmountPaise: dailyInstalment,
    totalDurationDays: days,
    totalInterestPaise,
    dailyPenaltyPaise,
    overdueDays,
    cumulativePenaltyPaise,
    penaltyPaidPaise: paid,
    penaltyOutstandingPaise,
  };
}

/**
 * Unified Loan Calculation Dispatcher
 */
function calculateLoanInterest({
  vattiType,
  principalPaise,
  ratePercent,
  startDate,
  asOfDate,
  config = {},
}) {
  switch (vattiType) {
    case CONSTANTS.VATTI_TYPES.MONTHLY:
      return calculateMonthlyInterest({
        principalPaise,
        monthlyRatePercent: ratePercent,
        startDate,
        asOfDate,
        config,
      });

    case CONSTANTS.VATTI_TYPES.DAILY:
      return calculateDailyInterest({
        principalPaise,
        dailyRatePercent: ratePercent,
        startDate,
        asOfDate,
        config,
      });

    case CONSTANTS.VATTI_TYPES.DAILY_COLLECTION: {
      const scheme = config.scheme || (config.additionalInterestDays ? 'EXTENDED_DAYS' : 'UPFRONT_DEDUCTION');
      if (scheme === 'EXTENDED_DAYS') {
        const res = calculateDailyCollectionSchemeB({
          grossPrincipalPaise: principalPaise,
          additionalInterestDays: config.additionalInterestDays || 10,
          startDate,
        });
        return {
          ...res,
          totalPayablePaise: res.totalRepaymentPaise,
          eligibleDays: res.totalDurationDays,
          status: 'ACTIVE',
          calculationDetails: {
            startDate: res.startDate,
            asOfDate: res.expectedCompletionDate,
            formula: 'Scheme B: 100 Principal Days + Additional Interest Days',
          },
        };
      } else {
        const duration = Number(config.totalDurationDays) === 70 ? 70 : 100;
        const res = calculateDailyCollectionSchemeA({
          grossLoanAmountPaise: principalPaise,
          upfrontInterestPaise: config.upfrontInterestPaise,
          upfrontInterestPercent: config.upfrontInterestPercent || ratePercent,
          startDate,
          totalDurationDays: duration,
        });
        return {
          ...res,
          totalPayablePaise: res.totalRepaymentPaise,
          eligibleDays: duration,
          status: 'ACTIVE',
          calculationDetails: {
            startDate: res.startDate,
            asOfDate: res.expectedCompletionDate,
            formula: `Upfront Interest Deduction (${duration} Daily Instalments)`,
          },
        };
      }
    }

    case CONSTANTS.VATTI_TYPES.MEATER:
      return calculateMeaterInterest({
        principalPaise,
        ratePercent,
        startDate,
        asOfDate,
        config,
      });

    default:
      throw new Error(`Unsupported Finance type: ${vattiType}`);
  }
}

/**
 * Collection Allocation Validator & Calculator
 * 
 * Verifies that explicit allocation satisfies balance constraints.
 * Strict separation: Principal, Scheduled Interest, and Assessed Penalty.
 */
function validateAndAllocatePayment({
  currentOutstandingPrincipalPaise = 0,
  currentOutstandingInterestPaise = 0,
  currentOutstandingPenaltyPaise = 0,
  totalPaymentPaise,
  paymentAmountPaise,
  principalAllocationPaise = 0,
  interestAllocationPaise = 0,
  penaltyAllocationPaise = 0,
}) {
  const effectiveTotalPaise = totalPaymentPaise !== undefined ? totalPaymentPaise : (paymentAmountPaise !== undefined ? paymentAmountPaise : 0);
  if (effectiveTotalPaise <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const pAlloc = Math.round(principalAllocationPaise || 0);
  const iAlloc = Math.round(interestAllocationPaise || 0);
  const penaltyAlloc = Math.round(penaltyAllocationPaise || 0);

  if (pAlloc < 0 || iAlloc < 0 || penaltyAlloc < 0) {
    throw new Error('Principal, Interest, and Penalty allocations cannot be negative.');
  }

  const sumAllocations = pAlloc + iAlloc + penaltyAlloc;
  if (sumAllocations !== effectiveTotalPaise) {
    throw new Error(
      `Sum of allocations (₹${toRupees(pAlloc)} principal + ₹${toRupees(iAlloc)} interest + ₹${toRupees(penaltyAlloc)} penalty = ₹${toRupees(sumAllocations)}) must exactly equal total payment received (₹${toRupees(effectiveTotalPaise)}).`
    );
  }

  if (pAlloc > currentOutstandingPrincipalPaise) {
    throw new Error(
      `Principal allocation (₹${toRupees(pAlloc)}) exceeds current outstanding principal (₹${toRupees(currentOutstandingPrincipalPaise)}).`
    );
  }

  if (penaltyAlloc > currentOutstandingPenaltyPaise && currentOutstandingPenaltyPaise > 0) {
    throw new Error(
      `Penalty allocation (₹${toRupees(penaltyAlloc)}) exceeds current outstanding penalty (₹${toRupees(currentOutstandingPenaltyPaise)}).`
    );
  }

  const remainingPrincipalPaise = Math.max(0, currentOutstandingPrincipalPaise - pAlloc);
  const remainingInterestPaise = Math.max(0, currentOutstandingInterestPaise - iAlloc);
  const remainingPenaltyPaise = Math.max(0, currentOutstandingPenaltyPaise - penaltyAlloc);
  const totalOutstandingPaise = remainingPrincipalPaise + remainingInterestPaise + remainingPenaltyPaise;

  return {
    previousOutstandingPrincipalPaise: currentOutstandingPrincipalPaise,
    previousOutstandingInterestPaise: currentOutstandingInterestPaise,
    previousOutstandingPenaltyPaise: currentOutstandingPenaltyPaise,
    totalPaymentPaise: effectiveTotalPaise,
    principalAllocationPaise: pAlloc,
    interestAllocationPaise: iAlloc,
    penaltyAllocationPaise: penaltyAlloc,
    remainingPrincipalPaise,
    remainingInterestPaise,
    remainingPenaltyPaise,
    totalOutstandingPaise,
    isFullySettled: totalOutstandingPaise === 0,
  };
}

/**
 * Calculate suggested dates & renewal count for Legacy Monthly Finance Loan
 */
function calculateLegacyMonthlyDates({ originalLoanDate, lastPaidThroughDate }) {
  const orig = DateTime.fromISO(new Date(originalLoanDate).toISOString().split('T')[0], { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');
  const lastPaid = DateTime.fromISO(new Date(lastPaidThroughDate).toISOString().split('T')[0], { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');

  if (lastPaid < orig) {
    throw new Error('Last interest-paid date cannot be earlier than original loan date.');
  }

  // Next renewal due date is 1 calendar month after last interest-paid date
  const suggestedNextDueDate = lastPaid.plus({ months: 1 }).toISODate();

  // Completed renewals: count of months from original loan date to last paid through date
  // e.g. 2024-01-25 to 2026-10-25 => 33 renewals
  let monthsDiff = (lastPaid.year - orig.year) * 12 + (lastPaid.month - orig.month);
  if (lastPaid.day < orig.day) {
    const origDaysInMonth = orig.daysInMonth;
    const lastPaidDaysInMonth = lastPaid.daysInMonth;
    if (!(orig.day === origDaysInMonth && lastPaid.day === lastPaidDaysInMonth)) {
      monthsDiff = Math.max(0, monthsDiff - 1);
    }
  }

  const suggestedRenewals = Math.max(0, monthsDiff);

  return {
    suggestedNextDueDate,
    suggestedRenewals,
    originalLoanDate: orig.toISODate(),
    lastPaidThroughDate: lastPaid.toISODate(),
  };
}

/**
 * Calculate suggested dates & renewal count for Legacy Daily Finance Loan (10-day periods)
 */
function calculateLegacyDailyDates({ originalLoanDate, lastPaidThroughDate }) {
  const orig = DateTime.fromISO(new Date(originalLoanDate).toISOString().split('T')[0], { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');
  const lastPaid = DateTime.fromISO(new Date(lastPaidThroughDate).toISOString().split('T')[0], { zone: CONSTANTS.DEFAULT_TIMEZONE }).startOf('day');

  if (lastPaid < orig) {
    throw new Error('Last interest-paid date cannot be earlier than original loan date.');
  }

  // Next renewal due date is exactly 10 calendar days after last interest-paid date
  const suggestedNextDueDate = lastPaid.plus({ days: 10 }).toISODate();

  // Completed renewals: total elapsed days divided by 10
  const daysDiff = Math.round(lastPaid.diff(orig, 'days').days);
  const suggestedRenewals = Math.max(0, Math.floor(daysDiff / 10));

  return {
    suggestedNextDueDate,
    suggestedRenewals,
    elapsedDays: daysDiff,
    originalLoanDate: orig.toISODate(),
    lastPaidThroughDate: lastPaid.toISODate(),
  };
}

module.exports = {
  toPaise,
  toRupees,
  formatINR,
  getKolkataDate,
  calculateMonthlyInterest,
  calculateDailyInterest,
  calculateMeaterInterest,
  calculateDailyCollectionSchemeA,
  calculateDailyCollectionSchemeB,
  calculateLoanInterest,
  calculateDailyPenalty,
  validateAndAllocatePayment,
  calculateLegacyMonthlyDates,
  calculateLegacyDailyDates,
};
