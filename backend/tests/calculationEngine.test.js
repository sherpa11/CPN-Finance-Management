const {
  toPaise,
  toRupees,
  formatINR,
  calculateMonthlyInterest,
  calculateDailyInterest,
  calculateMeaterInterest,
  validateAndAllocatePayment,
  getKolkataDate,
  calculateDailyCollectionSchemeA,
  calculateDailyCollectionSchemeB,
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

  describe('Monthly Finance Financial Calculations', () => {
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
      // 50,000 * 2% * 1 = 1,000 INR = 100,000 paise (Upfront deduction)
      expect(res.interestPaise).toBe(100000);
      expect(res.netAmountGivenPaise).toBe(4900000);
      // Customer repays the full original principal: ₹50,000 = 5,000,000 paise
      expect(res.totalPayablePaise).toBe(5000000);
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

  describe('Daily Finance Financial Calculations (Upfront Interest Deduction)', () => {
    test('calculates upfront interest deduction accurately (e.g. ₹1,00,000 at 2% for 10 days)', () => {
      const principalPaise = toPaise(100000); // ₹1,00,000
      const rate = 2.0; // 2% upfront

      const res = calculateDailyInterest({
        principalPaise,
        dailyRatePercent: rate,
        startDate: '2026-05-01',
        asOfDate: '2026-05-11', // 10 days
        config: { dateInclusionConvention: CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END },
      });

      expect(res.eligibleDays).toBe(10);
      // Upfront interest: 100,000 * 2% = ₹2,000 = 200,000 paise
      expect(res.upfrontInterestPaise).toBe(200000);
      expect(toRupees(res.upfrontInterestPaise)).toBe(2000);
      // Net cash given: 100,000 - 2,000 = ₹98,000 = 9,800,000 paise
      expect(res.netDisbursementPaise).toBe(9800000);
      expect(toRupees(res.netDisbursementPaise)).toBe(98000);
      // Total daily repayment: Full principal ₹1,00,000 = 10,000,000 paise
      expect(res.totalPayablePaise).toBe(10000000);
      expect(toRupees(res.totalPayablePaise)).toBe(100000);
      // Daily instalment: 100,000 / 10 = ₹10,000/day = 1,000,000 paise
      expect(res.dailyInstalmentPaise).toBe(1000000);
      expect(toRupees(res.dailyInstalmentPaise)).toBe(10000);
      expect(res.isUpfrontDeduction).toBe(true);
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

  describe('Meater Finance Explicit Pending State', () => {
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

  describe('Daily Collection – Two Repayment Schemes & Exact Math', () => {
    test('Scheme A: Upfront interest deduction on ₹1,00,000 @ 10% (₹10,000 upfront, ₹90,000 net, 100 days)', () => {
      const grossPaise = toPaise(100000);
      const res = calculateDailyCollectionSchemeA({
        grossLoanAmountPaise: grossPaise,
        upfrontInterestPercent: 10,
        startDate: '2026-11-20',
      });

      expect(res.scheme).toBe('UPFRONT_DEDUCTION');
      expect(res.grossLoanAmountPaise).toBe(10000000);
      expect(res.upfrontInterestPaise).toBe(1000000); // ₹10,000
      expect(res.netDisbursementPaise).toBe(9000000); // ₹90,000
      expect(res.dailyInstalmentPaise).toBe(100000); // ₹1,000
      expect(res.totalDurationDays).toBe(100);
      expect(res.totalRepaymentPaise).toBe(10000000); // ₹1,00,000
      expect(res.schedule.length).toBe(100);

      // Verify all 100 days sum exactly to gross principal
      const sumExpected = res.schedule.reduce((acc, s) => acc + s.expectedPaise, 0);
      expect(sumExpected).toBe(10000000);

      // Expected completion date = 2026-11-20 + 99 days = 2027-02-27
      expect(res.expectedCompletionDate).toBe('2027-02-27');
    });

    test('Scheme B: Extended Days on ₹1,00,000 with 10 extra days (110 days, ₹1,10,000 total)', () => {
      const grossPaise = toPaise(100000);
      const res = calculateDailyCollectionSchemeB({
        grossPrincipalPaise: grossPaise,
        additionalInterestDays: 10,
        startDate: '2026-11-20',
      });

      expect(res.scheme).toBe('EXTENDED_DAYS');
      expect(res.grossPrincipalPaise).toBe(10000000);
      expect(res.netDisbursementPaise).toBe(10000000); // Full ₹1,00,000 given
      expect(res.dailyInstalmentPaise).toBe(100000); // ₹1,000
      expect(res.principalRepaymentDays).toBe(100);
      expect(res.additionalInterestDays).toBe(10);
      expect(res.additionalInterestPaise).toBe(1000000); // ₹10,000
      expect(res.totalDurationDays).toBe(110);
      expect(res.totalRepaymentPaise).toBe(11000000); // ₹1,10,000
      expect(res.schedule.length).toBe(110);

      // Days 1-100 must be PRINCIPAL
      for (let i = 0; i < 100; i++) {
        expect(res.schedule[i].category).toBe('PRINCIPAL');
      }
      // Days 101-110 must be INTEREST
      for (let i = 100; i < 110; i++) {
        expect(res.schedule[i].category).toBe('INTEREST');
      }

      const sumExpected = res.schedule.reduce((acc, s) => acc + s.expectedPaise, 0);
      expect(sumExpected).toBe(11000000);
    });

    test('Scheme B supports maximum 20 additional days (120 days total)', () => {
      const grossPaise = toPaise(50000);
      const res = calculateDailyCollectionSchemeB({
        grossPrincipalPaise: grossPaise,
        additionalInterestDays: 20,
        startDate: '2026-11-01',
      });

      expect(res.totalDurationDays).toBe(120);
      expect(res.schedule.length).toBe(120);
      expect(res.additionalInterestPaise).toBe(toPaise(10000)); // 500 * 20 = 10,000
      expect(res.totalRepaymentPaise).toBe(toPaise(60000));
    });

    test('Scheme A (70 Days): Upfront interest deduction on ₹70,000 @ 10% (₹7,000 upfront, ₹63,000 net, 70 days)', () => {
      const grossPaise = toPaise(70000);
      const res = calculateDailyCollectionSchemeA({
        grossLoanAmountPaise: grossPaise,
        upfrontInterestPercent: 10,
        startDate: '2026-11-20',
        totalDurationDays: 70,
      });

      expect(res.scheme).toBe('UPFRONT_DEDUCTION');
      expect(res.grossLoanAmountPaise).toBe(7000000);
      expect(res.upfrontInterestPaise).toBe(700000); // ₹7,000
      expect(res.netDisbursementPaise).toBe(6300000); // ₹63,000
      expect(res.dailyInstalmentPaise).toBe(100000); // ₹1,000 / day
      expect(res.totalDurationDays).toBe(70);
      expect(res.totalRepaymentPaise).toBe(7000000); // ₹70,000
      expect(res.schedule.length).toBe(70);

      // Verify all 70 days sum exactly to gross principal
      const sumExpected = res.schedule.reduce((acc, s) => acc + s.expectedPaise, 0);
      expect(sumExpected).toBe(7000000);

      // Expected completion date = 2026-11-20 + 69 days = 2027-01-28
      expect(res.expectedCompletionDate).toBe('2027-01-28');
    });

    test('Odd paise division is absorbed on Day 70 with zero floating-point leakage', () => {
      const oddPaise = 70005; // ₹700.05
      const res = calculateDailyCollectionSchemeA({
        grossLoanAmountPaise: oddPaise,
        upfrontInterestPaise: 0,
        startDate: '2026-11-20',
        totalDurationDays: 70,
      });

      expect(res.dailyInstalmentPaise).toBe(1000); // Math.floor(70005 / 70) = 1000
      expect(res.schedule[0].expectedPaise).toBe(1000);
      expect(res.schedule[68].expectedPaise).toBe(1000);
      // Day 70 absorbs the 105 paise
      expect(res.schedule[69].expectedPaise).toBe(1005);

      const sumExpected = res.schedule.reduce((acc, s) => acc + s.expectedPaise, 0);
      expect(sumExpected).toBe(oddPaise);
    });

    test('Odd paise division is absorbed on Day 100 with zero floating-point leakage', () => {
      const oddPaise = 100005; // ₹1,000.05
      const res = calculateDailyCollectionSchemeA({
        grossLoanAmountPaise: oddPaise,
        upfrontInterestPaise: 0,
        startDate: '2026-11-20',
      });

      expect(res.dailyInstalmentPaise).toBe(1000); // Math.floor(100005 / 100) = 1000
      expect(res.schedule[0].expectedPaise).toBe(1000);
      expect(res.schedule[98].expectedPaise).toBe(1000);
      // Day 100 absorbs the 105 paise
      expect(res.schedule[99].expectedPaise).toBe(1005);

      const sumExpected = res.schedule.reduce((acc, s) => acc + s.expectedPaise, 0);
      expect(sumExpected).toBe(oddPaise);
    });
  });
});
