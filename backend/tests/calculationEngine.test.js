const {
  toPaise,
  toRupees,
  formatINR,
  calculateMonthlyInterest,
  calculateDailyInterest,
  calculateMeaterInterest,
  validateAndAllocatePayment,
  getKolkataDate,
} = require('../src/services/calculationEngine');
const CONSTANTS = require('../src/config/constants');

describe('CPN RAJA – Centralized Financial Calculation Engine', () => {
  describe('Integer Paise Conversion & Accuracy', () => {
    test('converts rupees to paise accurately without floating-point anomalies', () => {
      expect(toPaise(100)).toBe(10000);
      expect(toPaise(19.99)).toBe(1999);
      expect(toPaise('50000.50')).toBe(5000050);
      expect(toPaise(0)).toBe(0);
      expect(toPaise(null)).toBe(0);
    });

    test('converts paise to rupees accurately', () => {
      expect(toRupees(10000)).toBe(100);
      expect(toRupees(1999)).toBe(19.99);
      expect(toRupees(5000050)).toBe(50000.50);
      expect(toRupees(0)).toBe(0);
    });

    test('formats INR correctly in Indian number format', () => {
      const formatted = formatINR(10000000); // 1 Lakh = 1,00,000 INR
      expect(formatted).toContain('1,00,000');
    });
  });

  describe('Monthly Vatti Financial Calculations', () => {
    test('calculates exact 1-month simple interest at 2% on ₹50,000', () => {
      const principalPaise = toPaise(50000); // ₹50,000 = 5,000,000 paise
      const res = calculateMonthlyInterest({
        principalPaise,
        monthlyRatePercent: 2.0,
        startDate: '2026-01-01',
        asOfDate: '2026-02-01',
      });

      expect(res.fullMonths).toBe(1);
      expect(res.partialDays).toBe(0);
      expect(res.eligibleMonths).toBe(1);
      // 50,000 * 2% * 1 = 1,000 INR = 100,000 paise
      expect(res.interestPaise).toBe(100000);
      expect(res.totalPayablePaise).toBe(5100000);
    });

    test('calculates multiple months with individual customer rates (e.g. 3% on ₹1,00,000 for 3 months)', () => {
      const principalPaise = toPaise(100000);
      const res = calculateMonthlyInterest({
        principalPaise,
        monthlyRatePercent: 3.0,
        startDate: '2026-01-15',
        asOfDate: '2026-04-15',
      });

      expect(res.fullMonths).toBe(3);
      expect(res.partialDays).toBe(0);
      // 100,000 * 3% * 3 = 9,000 INR = 900,000 paise
      expect(res.interestPaise).toBe(900000);
      expect(toRupees(res.interestPaise)).toBe(9000);
    });

    test('handles month-end leap year dates (Feb 29 on leap year vs Feb 28 on regular year)', () => {
      // 2028 is a leap year (Feb has 29 days)
      const resLeap = calculateMonthlyInterest({
        principalPaise: toPaise(10000),
        monthlyRatePercent: 2.0,
        startDate: '2028-01-31',
        asOfDate: '2028-02-29',
      });
      expect(resLeap.fullMonths).toBe(1);
      expect(toRupees(resLeap.interestPaise)).toBe(200);

      // 2026 is non-leap (Feb has 28 days)
      const resNonLeap = calculateMonthlyInterest({
        principalPaise: toPaise(10000),
        monthlyRatePercent: 2.0,
        startDate: '2026-01-31',
        asOfDate: '2026-02-28',
      });
      expect(resNonLeap.fullMonths).toBe(1);
      expect(toRupees(resNonLeap.interestPaise)).toBe(200);
    });

    test('supports configurable partial month rules (pro-rata vs 30-day base)', () => {
      const principalPaise = toPaise(30000); // ₹30,000

      // 1 month + 15 days in a 31-day month (March has 31 days)
      const resProRata = calculateMonthlyInterest({
        principalPaise,
        monthlyRatePercent: 2.0,
        startDate: '2026-02-01',
        asOfDate: '2026-03-16', // 1 full month (Feb 1-Mar 1) + 15 days in March
        config: { partialMonthRule: CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY },
      });

      expect(resProRata.fullMonths).toBe(1);
      expect(resProRata.partialDays).toBe(15);
      expect(resProRata.isPendingOwnerConfirmation).toBe(true);
      expect(resProRata.interestPaise).toBeGreaterThan(60000); // 1 month is 600 INR

      // 30-day base rule
      const res30Day = calculateMonthlyInterest({
        principalPaise,
        monthlyRatePercent: 2.0,
        startDate: '2026-02-01',
        asOfDate: '2026-03-16',
        config: { partialMonthRule: CONSTANTS.MONTHLY_PARTIAL_RULES.THIRTY_DAY_BASE },
      });
      expect(res30Day.eligibleMonths).toBe(1.5); // 1 + 15/30 = 1.5
      expect(toRupees(res30Day.interestPaise)).toBe(900); // 30,000 * 2% * 1.5 = 900
    });
  });

  describe('Daily Vatti Financial Calculations', () => {
    test('calculates daily interest accurately using Asia/Kolkata timezone', () => {
      const principalPaise = toPaise(20000); // ₹20,000
      const dailyRate = 0.1; // 0.1% per day = ₹20/day

      const res = calculateDailyInterest({
        principalPaise,
        dailyRatePercent: dailyRate,
        startDate: '2026-05-01',
        asOfDate: '2026-05-11', // 10 days
        config: { dateInclusionConvention: CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END },
      });

      expect(res.eligibleDays).toBe(10);
      // 20,000 * 0.1% * 10 = ₹200 = 20,000 paise
      expect(res.interestPaise).toBe(20000);
      expect(toRupees(res.interestPaise)).toBe(200);
      expect(toRupees(res.totalPayablePaise)).toBe(20200);
    });

    test('supports configurable date inclusion conventions', () => {
      const principalPaise = toPaise(10000);

      // INCLUDE_BOTH counts start date and end date
      const resBoth = calculateDailyInterest({
        principalPaise,
        dailyRatePercent: 0.1,
        startDate: '2026-05-01',
        asOfDate: '2026-05-05',
        config: { dateInclusionConvention: CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_BOTH },
      });
      expect(resBoth.eligibleDays).toBe(5); // 1st, 2nd, 3rd, 4th, 5th
    });
  });

  describe('Meater Vatti Explicit Pending State', () => {
    test('does NOT invent formula and returns explicit pending status', () => {
      const res = calculateMeaterInterest({
        principalPaise: toPaise(30000),
        ratePercent: 1.5,
        startDate: '2026-06-01',
        asOfDate: '2026-06-30',
      });

      expect(res.status).toBe('PENDING_CONFIRMATION');
      expect(res.isPendingOwnerConfirmation).toBe(true);
      expect(res.interestPaise).toBe(0);
      expect(res.message).toContain('Calculation configuration pending');
    });
  });

  describe('Collection Allocation & Balance Safety', () => {
    test('validates explicit allocation: interest only payment', () => {
      const breakdown = validateAndAllocatePayment({
        currentOutstandingPrincipalPaise: toPaise(50000),
        currentOutstandingInterestPaise: toPaise(1000),
        totalPaymentPaise: toPaise(1000),
        principalAllocationPaise: 0,
        interestAllocationPaise: toPaise(1000),
      });

      expect(toRupees(breakdown.remainingPrincipalPaise)).toBe(50000);
      expect(toRupees(breakdown.remainingInterestPaise)).toBe(0);
      expect(toRupees(breakdown.totalOutstandingPaise)).toBe(50000);
      expect(breakdown.isFullySettled).toBe(false);
    });

    test('validates explicit allocation: partial principal reduction', () => {
      const breakdown = validateAndAllocatePayment({
        currentOutstandingPrincipalPaise: toPaise(50000),
        currentOutstandingInterestPaise: toPaise(1000),
        totalPaymentPaise: toPaise(11000),
        principalAllocationPaise: toPaise(10000),
        interestAllocationPaise: toPaise(1000),
      });

      expect(toRupees(breakdown.remainingPrincipalPaise)).toBe(40000);
      expect(toRupees(breakdown.remainingInterestPaise)).toBe(0);
      expect(toRupees(breakdown.totalOutstandingPaise)).toBe(40000);
      expect(breakdown.isFullySettled).toBe(false);
    });

    test('validates explicit allocation: full settlement of principal and interest', () => {
      const breakdown = validateAndAllocatePayment({
        currentOutstandingPrincipalPaise: toPaise(50000),
        currentOutstandingInterestPaise: toPaise(1000),
        totalPaymentPaise: toPaise(51000),
        principalAllocationPaise: toPaise(50000),
        interestAllocationPaise: toPaise(1000),
      });

      expect(breakdown.remainingPrincipalPaise).toBe(0);
      expect(breakdown.remainingInterestPaise).toBe(0);
      expect(breakdown.totalOutstandingPaise).toBe(0);
      expect(breakdown.isFullySettled).toBe(true);
    });

    test('rejects allocations that do not equal total payment received', () => {
      expect(() => {
        validateAndAllocatePayment({
          currentOutstandingPrincipalPaise: toPaise(50000),
          currentOutstandingInterestPaise: toPaise(1000),
          totalPaymentPaise: toPaise(5000),
          principalAllocationPaise: toPaise(3000),
          interestAllocationPaise: toPaise(1000), // sum is 4000, mismatch!
        });
      }).toThrow('Sum of allocations');
    });

    test('rejects principal allocation that exceeds outstanding principal', () => {
      expect(() => {
        validateAndAllocatePayment({
          currentOutstandingPrincipalPaise: toPaise(10000),
          currentOutstandingInterestPaise: toPaise(500),
          totalPaymentPaise: toPaise(15000),
          principalAllocationPaise: toPaise(15000),
          interestAllocationPaise: 0,
        });
      }).toThrow('exceeds current outstanding principal');
    });
  });
});
