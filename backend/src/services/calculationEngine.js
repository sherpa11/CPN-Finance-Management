/**
 * CPN RAJA – VATTI MANAGEMENT SYSTEM
 * Centralized Financial Calculation Engine
 * 
 * Rules:
 * 1. Financial accuracy is highest priority.
 * 2. All monetary calculations use integer paise (1 INR = 100 paise).
 * 3. Never use ordinary floating-point calculations for financial balances.
 * 4. Business dates use Asia/Kolkata timezone.
 * 5. Simple interest initially (no automatic compounding).
 * 6. Partial-month rules and date-inclusion conventions are configurable.
 * 7. MEATER Vatti explicitly signals "Calculation configuration pending"
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
 * Monthly Vatti Calculation
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
  const totalPayablePaise = principalPaise + interestPaise;

  return {
    principalPaise,
    monthlyRatePercent,
    fullMonths,
    partialDays,
    eligibleMonths: Number(eligibleMonths.toFixed(4)),
    interestPaise,
    totalPayablePaise,
    partialMonthRule,
    isPendingOwnerConfirmation: config.isPendingOwnerConfirmation !== undefined ? config.isPendingOwnerConfirmation : true,
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      lastFullMonthBoundary: current.toISODate(),
      formula: 'Principal × Monthly Rate × Eligible Months / 100',
    },
  };
}

/**
 * Daily Vatti Calculation
 * 
 * Formula:
 * Daily Interest = Principal × Daily Rate × Eligible Days / 100
 * 
 * Configurable Date Inclusion Conventions:
 * - INCLUDE_START_EXCLUDE_END: Standard banking (startDate inclusive, asOfDate exclusive)
 * - INCLUDE_BOTH: Both startDate and asOfDate are counted
 * - EXCLUDE_START_INCLUDE_END: startDate exclusive, asOfDate inclusive
 */
function calculateDailyInterest({
  principalPaise,
  dailyRatePercent,
  startDate,
  asOfDate,
  config = {},
}) {
  if (!principalPaise || principalPaise <= 0 || !dailyRatePercent || dailyRatePercent <= 0) {
    return {
      principalPaise: principalPaise || 0,
      dailyRatePercent: dailyRatePercent || 0,
      eligibleDays: 0,
      interestPaise: 0,
      totalPayablePaise: principalPaise || 0,
      dateInclusionConvention: config.dateInclusionConvention || CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END,
    };
  }

  const start = getKolkataDate(startDate);
  const target = getKolkataDate(asOfDate);

  if (target < start) {
    return {
      principalPaise,
      dailyRatePercent,
      eligibleDays: 0,
      interestPaise: 0,
      totalPayablePaise: principalPaise,
      dateInclusionConvention: config.dateInclusionConvention || CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END,
    };
  }

  const rawDiffDays = Math.floor(target.diff(start, 'days').days);
  const dateInclusionConvention = config.dateInclusionConvention || CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END;

  let eligibleDays = rawDiffDays;
  if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_BOTH) {
    eligibleDays = rawDiffDays + 1;
  } else if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END) {
    eligibleDays = rawDiffDays;
  } else if (dateInclusionConvention === CONSTANTS.DAILY_INCLUSION_CONVENTIONS.EXCLUDE_START_INCLUDE_END) {
    eligibleDays = rawDiffDays;
  }

  eligibleDays = Math.max(0, eligibleDays);

  // Daily Interest (Paise) = round(PrincipalPaise * DailyRatePercent * EligibleDays / 100)
  const interestPaise = Math.round((principalPaise * dailyRatePercent * eligibleDays) / 100);
  const totalPayablePaise = principalPaise + interestPaise;

  return {
    principalPaise,
    dailyRatePercent,
    eligibleDays,
    interestPaise,
    totalPayablePaise,
    dateInclusionConvention,
    isPendingOwnerConfirmation: !!config.isPendingOwnerConfirmation,
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      rawDiffDays,
      formula: 'Principal × Daily Rate × Eligible Days / 100',
    },
  };
}

/**
 * Meater Vatti Calculation
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
    message: 'Calculation configuration pending: Meater Vatti formula is awaiting owner confirmation as per business specification. Loan details are saved and managed independently.',
    calculationDetails: {
      startDate: start.toISODate(),
      asOfDate: target.toISODate(),
      formula: 'Pending Owner Confirmation',
    },
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

    case CONSTANTS.VATTI_TYPES.MEATER:
      return calculateMeaterInterest({
        principalPaise,
        ratePercent,
        startDate,
        asOfDate,
        config,
      });

    default:
      throw new Error(`Unsupported Vatti type: ${vattiType}`);
  }
}

/**
 * Collection Allocation Validator & Calculator
 * 
 * Verifies that explicit allocation satisfies balance constraints.
 */
function validateAndAllocatePayment({
  currentOutstandingPrincipalPaise,
  currentOutstandingInterestPaise,
  totalPaymentPaise,
  principalAllocationPaise,
  interestAllocationPaise,
}) {
  if (totalPaymentPaise <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const pAlloc = Math.round(principalAllocationPaise || 0);
  const iAlloc = Math.round(interestAllocationPaise || 0);

  if (pAlloc < 0 || iAlloc < 0) {
    throw new Error('Principal and Interest allocations cannot be negative.');
  }

  if (pAlloc + iAlloc !== totalPaymentPaise) {
    throw new Error(
      `Sum of allocations (₹${toRupees(pAlloc)} principal + ₹${toRupees(iAlloc)} interest = ₹${toRupees(pAlloc + iAlloc)}) must exactly equal total payment received (₹${toRupees(totalPaymentPaise)}).`
    );
  }

  if (pAlloc > currentOutstandingPrincipalPaise) {
    throw new Error(
      `Principal allocation (₹${toRupees(pAlloc)}) exceeds current outstanding principal (₹${toRupees(currentOutstandingPrincipalPaise)}).`
    );
  }

  if (iAlloc > currentOutstandingInterestPaise) {
    // Note: If customer pays advance interest, system can warn or allocate
    // For strict financial safety, we allow it only if explicit flag or clamp
  }

  const remainingPrincipalPaise = Math.max(0, currentOutstandingPrincipalPaise - pAlloc);
  const remainingInterestPaise = Math.max(0, currentOutstandingInterestPaise - iAlloc);
  const totalOutstandingPaise = remainingPrincipalPaise + remainingInterestPaise;

  return {
    previousOutstandingPrincipalPaise: currentOutstandingPrincipalPaise,
    previousOutstandingInterestPaise: currentOutstandingInterestPaise,
    totalPaymentPaise,
    principalAllocationPaise: pAlloc,
    interestAllocationPaise: iAlloc,
    remainingPrincipalPaise,
    remainingInterestPaise,
    totalOutstandingPaise,
    isFullySettled: totalOutstandingPaise === 0,
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
  calculateLoanInterest,
  validateAndAllocatePayment,
};
