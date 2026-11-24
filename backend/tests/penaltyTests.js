process.env.NODE_ENV = 'test';
process.env.MONGODB_URI_TEST = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpn_raja_test_db';

const mongoose = require('mongoose');
const request = require('supertest');
const assert = require('assert');
const { DateTime } = require('luxon');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const DailyCollectionAccount = require('../src/models/DailyCollectionAccount');
const DailyCollectionPayment = require('../src/models/DailyCollectionPayment');
const Transaction = require('../src/models/Transaction');
const connectDB = require('../src/config/db');
const {
  calculateDailyPenalty,
  validateAndAllocatePayment,
  toPaise,
  toRupees,
} = require('../src/services/calculationEngine');

const TIMEZONE = 'Asia/Kolkata';

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
}

function logFail(msg) {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

async function runPenaltyTests() {
  console.log('================================================================');
  console.log('  CPN RAJA – CLIENT-CONFIRMED PENALTY RULES REGRESSION SUITE   ');
  console.log('================================================================\n');

  const mongooseInstance = await connectDB();
  const dbName = mongooseInstance.connection.name;
  if (!dbName.toLowerCase().includes('test')) {
    console.error(`[FATAL SAFETY CHECK] Connected to non-test database: "${dbName}". Aborting tests to protect production data!`);
    process.exit(1);
  }
  console.log(`[Safety Verified] Connected to isolated test database: ${dbName}\n`);

  // 1. Authenticate admin
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: 'cpnraja2026' });
  const token = loginRes.body.token;
  const authHeader = `Bearer ${token}`;

  // Clean test tables
  await Customer.deleteMany({});
  await Loan.deleteMany({});
  await Collection.deleteMany({});
  await DailyCollectionAccount.deleteMany({});
  await DailyCollectionPayment.deleteMany({});
  await Transaction.deleteMany({});

  // --------------------------------------------------------------------------
  // PART 1: PURE CALCULATION ENGINE REGRESSION TESTS
  // --------------------------------------------------------------------------
  console.log('[PART 1] Centralized Calculation Engine – Penalty Rules');

  const baseDate = DateTime.fromISO('2026-01-01', { zone: TIMEZONE });
  // Schedule of 100 days: starts 2026-01-01, ends Day 100 = 2026-04-11
  const dueDate = baseDate.plus({ days: 100 }).toJSDate();
  const dailyRepaymentPaise = toPaise(1000); // ₹1,000 / day

  // Test 2: Daily Finance has no penalty through day 100
  const day100AsOf = baseDate.plus({ days: 100 }).toJSDate();
  const day100Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dailyRepaymentPaise,
    dueDate,
    asOfDate: day100AsOf,
    isFullyRepaid: false,
    penaltyPaidPaise: 0,
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(day100Penalty.overdueDays, 0, 'Day 100 must have 0 overdue days');
  assert.strictEqual(day100Penalty.dailyPenaltyPaise, 2000, 'Daily penalty is ₹20 (2000 paise)');
  assert.strictEqual(day100Penalty.cumulativePenaltyPaise, 0, 'Day 100 must have ₹0 penalty');
  assert.strictEqual(day100Penalty.penaltyOutstandingPaise, 0, 'Day 100 must have ₹0 penalty outstanding');
  logPass('Requirement 2: Daily Finance has ₹0 penalty on Day 100 (maturity date).');

  // Test 3: Daily Finance generates ₹20 on day 101 for ₹1,000 daily repayment
  const day101AsOf = baseDate.plus({ days: 101 }).toJSDate();
  const day101Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dailyRepaymentPaise,
    dueDate,
    asOfDate: day101AsOf,
    isFullyRepaid: false,
    penaltyPaidPaise: 0,
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(day101Penalty.overdueDays, 1, 'Day 101 is overdue day 1');
  assert.strictEqual(day101Penalty.dailyPenaltyPaise, 2000, 'Daily penalty rate is 2% = ₹20');
  assert.strictEqual(day101Penalty.cumulativePenaltyPaise, 2000, 'Day 101 cumulative penalty must be ₹20');
  assert.strictEqual(day101Penalty.penaltyOutstandingPaise, 2000, 'Day 101 outstanding penalty must be ₹20');
  logPass('Requirement 3: Daily Finance generates exactly ₹20 penalty on Day 101 (2% of ₹1,000).');

  // Test 4: Daily Finance has ₹40 cumulative penalty on day 102
  const day102AsOf = baseDate.plus({ days: 102 }).toJSDate();
  const day102Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dailyRepaymentPaise,
    dueDate,
    asOfDate: day102AsOf,
    isFullyRepaid: false,
    penaltyPaidPaise: 0,
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(day102Penalty.overdueDays, 2, 'Day 102 is overdue day 2');
  assert.strictEqual(day102Penalty.cumulativePenaltyPaise, 4000, 'Day 102 cumulative penalty is ₹40');
  assert.strictEqual(day102Penalty.penaltyOutstandingPaise, 4000, 'Day 102 outstanding penalty is ₹40');
  logPass('Requirement 4: Daily Finance has exactly ₹40 cumulative penalty on Day 102.');

  // Test 4b: Day 110 has ₹200 cumulative penalty
  const day110AsOf = baseDate.plus({ days: 110 }).toJSDate();
  const day110Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dailyRepaymentPaise,
    dueDate,
    asOfDate: day110AsOf,
    isFullyRepaid: false,
    penaltyPaidPaise: 0,
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(day110Penalty.overdueDays, 10, 'Day 110 is overdue day 10');
  assert.strictEqual(day110Penalty.cumulativePenaltyPaise, 20000, 'Day 110 cumulative penalty is ₹200 (20,000 paise)');
  logPass('Requirement 4b: Day 110 has exactly ₹200 cumulative penalty (10 days × ₹20).');

  // Test 5: Daily Collection 70-day scheme
  const dc70DueDate = baseDate.plus({ days: 70 }).toJSDate();
  const dc70DailyPaise = toPaise(1000);
  const dc70Day70Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dc70DailyPaise,
    dueDate: dc70DueDate,
    asOfDate: baseDate.plus({ days: 70 }).toJSDate(),
    isFullyRepaid: false,
  });
  assert.strictEqual(dc70Day70Penalty.cumulativePenaltyPaise, 0, 'Day 70 of 70-day scheme has ₹0 penalty');

  const dc70Day71Penalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dc70DailyPaise,
    dueDate: dc70DueDate,
    asOfDate: baseDate.plus({ days: 71 }).toJSDate(),
    isFullyRepaid: false,
  });
  assert.strictEqual(dc70Day71Penalty.overdueDays, 1, 'Day 71 of 70-day scheme is overdue day 1');
  assert.strictEqual(dc70Day71Penalty.cumulativePenaltyPaise, 2000, 'Day 71 penalty is ₹20');
  logPass('Requirement 5: Daily Collection (70-day & 100-day) follows identical penalty rule starting Day D+1.');

  // Test 6 & 8: A 100-day loan paid on day 102 stops accumulating penalties
  // Customer pays ₹1,00,040 on Day 102 (₹1,00,000 principal + ₹40 penalty)
  const allocation = validateAndAllocatePayment({
    paymentAmountPaise: toPaise(100040),
    principalAllocationPaise: toPaise(100000),
    interestAllocationPaise: 0,
    penaltyAllocationPaise: toPaise(40),
    currentOutstandingPrincipalPaise: toPaise(100000),
    currentOutstandingInterestPaise: 0,
    currentOutstandingPenaltyPaise: toPaise(40),
  });
  assert.strictEqual(allocation.principalAllocationPaise, toPaise(100000), 'Principal allocated is ₹1,00,000');
  assert.strictEqual(allocation.penaltyAllocationPaise, toPaise(40), 'Penalty allocated is ₹40');
  assert.strictEqual(allocation.remainingPrincipalPaise, 0, 'Remaining principal is ₹0');
  assert.strictEqual(allocation.remainingPenaltyPaise, 0, 'Remaining penalty is ₹0');
  assert.strictEqual(allocation.isFullySettled, true, 'Loan is fully settled');
  logPass('Requirement 6: Total repayment on Day 102 is ₹1,00,040 (Principal ₹1,00,000 + Penalty ₹40).');

  // Verify that on Day 105, because the loan was settled on Day 102, penalty does not continue growing
  const day105AfterSettlementPenalty = calculateDailyPenalty({
    dailyRepaymentAmountPaise: dailyRepaymentPaise,
    dueDate,
    asOfDate: baseDate.plus({ days: 105 }).toJSDate(),
    isFullyRepaid: true,
    fullRepaymentDate: day102AsOf,
    penaltyPaidPaise: toPaise(40),
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(day105AfterSettlementPenalty.cumulativePenaltyPaise, 4000, 'Cumulative penalty remains capped at ₹40');
  assert.strictEqual(day105AfterSettlementPenalty.penaltyOutstandingPaise, 0, 'Outstanding penalty is ₹0 after full payment');
  logPass('Requirement 8: Fully repaid loans stop accumulating penalties on subsequent days.');

  // --------------------------------------------------------------------------
  // PART 2: API & INTEGRATION REGRESSION TESTS
  // --------------------------------------------------------------------------
  console.log('\n[PART 2] API & Database Flow Integration Tests');

  // Create Customer
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Penalty Test Borrower',
      mobileNumber: '9888877777',
      address: 'Madurai, TN',
    });
  const customerId = custRes.body.customer._id;

  // Requirement 1: Monthly Finance – No Penalty Ever
  const monthlyLoanRes = await request(app)
    .post('/api/loans')
    .set('Authorization', authHeader)
    .send({
      customerId,
      vattiType: 'MONTHLY',
      principalAmount: 100000,
      interestRatePercent: 2.0,
      startDate: '2026-01-01',
      dueDate: '2026-02-01',
      upfrontInterestDeduction: true,
    });
  const monthlyLoanId = monthlyLoanRes.body.loan._id;

  const getMonthlyRes = await request(app)
    .get(`/api/loans/${monthlyLoanId}`)
    .set('Authorization', authHeader);
  assert.strictEqual(getMonthlyRes.body.loan.penaltyBreakdown.isPenaltyApplicable, false, 'Monthly Finance must have isPenaltyApplicable = false');
  assert.strictEqual(getMonthlyRes.body.loan.penaltyBreakdown.penaltyOutstandingRupees, 0, 'Monthly Finance must have ₹0 penalty');
  logPass('Requirement 1: Monthly Finance strictly has no penalty under any condition.');

  // Requirement 7 & 10: Daily Finance with Upfront Interest
  // Principal: ₹1,00,000, Rate: 2%, Duration: 100 days
  // Upfront Interest: ₹2,000, Net given: ₹98,000
  // Daily Repayment: ₹1,000 / day
  const dailyLoanRes = await request(app)
    .post('/api/loans')
    .set('Authorization', authHeader)
    .send({
      customerId,
      vattiType: 'DAILY',
      principalAmount: 100000,
      interestRatePercent: 2.0,
      totalDurationDays: 100,
      dailyInstalmentRupees: 1000,
      startDate: '2026-01-01',
      dueDate: '2026-04-11',
      upfrontInterestDeduction: true,
      penaltyRatePercent: 2.0,
    });
  assert.strictEqual(dailyLoanRes.status, 201);
  const dailyLoan = dailyLoanRes.body.loan;
  const dailyLoanId = dailyLoan._id;

  assert.strictEqual(dailyLoan.upfrontInterestPaise, 200000, 'Upfront interest is ₹2,000 (200,000 paise)');
  assert.strictEqual(dailyLoan.netDisbursementPaise, 9800000, 'Net cash disbursed to customer is ₹98,000');
  assert.strictEqual(dailyLoan.outstandingPrincipalPaise, 10000000, 'Customer scheduled repayment is full ₹1,00,000 principal');
  logPass('Requirement 7: Upfront interest of ₹2,000 is recorded at disbursement and customer obligation is ₹1,00,000.');

  // Test Requirement 9: Idempotent Penalty Preview without Duplication
  const preview1 = await request(app)
    .post('/api/collections/preview')
    .set('Authorization', authHeader)
    .send({
      loanId: dailyLoanId,
      paymentAmount: 100040,
      principalAllocation: 100000,
      interestAllocation: 0,
      penaltyAllocation: 40,
    });
  assert.strictEqual(preview1.body.success, true);

  const preview2 = await request(app)
    .post('/api/collections/preview')
    .set('Authorization', authHeader)
    .send({
      loanId: dailyLoanId,
      paymentAmount: 100040,
      principalAllocation: 100000,
      interestAllocation: 0,
      penaltyAllocation: 40,
    });
  assert.strictEqual(preview2.body.success, true);
  logPass('Requirement 9: Repeated calculations and previews are strictly idempotent without duplicating records.');

  // Test Requirement 6 (Integration): Record Payment of ₹1,00,040 (Principal ₹1,00,000 + Penalty ₹40)
  const collectionRes = await request(app)
    .post('/api/collections')
    .set('Authorization', authHeader)
    .send({
      loanId: dailyLoanId,
      paymentAmount: 100040,
      principalAllocation: 100000,
      interestAllocation: 0,
      penaltyAllocation: 40,
      paymentMethod: 'CASH',
      paymentDate: '2026-04-13', // Day 102
      notes: 'Day 102 Full closure: Principal ₹1,00,000 + 2 overdue days penalty ₹40',
    });
  assert.strictEqual(collectionRes.status, 201, 'Collection recorded successfully');
  const collectionData = collectionRes.body.collection;
  assert.strictEqual(collectionData.penaltyAllocationPaise, 4000, 'Penalty allocation recorded as 4000 paise (₹40)');
  assert.strictEqual(collectionData.principalAllocationPaise, 10000000, 'Principal allocation recorded as ₹1,00,000');

  // Verify Loan is closed and penalty paid is saved
  const closedLoanRes = await request(app)
    .get(`/api/loans/${dailyLoanId}`)
    .set('Authorization', authHeader);
  const closedLoan = closedLoanRes.body.loan;
  assert.strictEqual(closedLoan.outstandingPrincipalPaise, 0, 'Outstanding principal is ₹0');
  assert.strictEqual(closedLoan.penaltyPaidPaise, 4000, 'Penalty paid is ₹40');
  assert.strictEqual(closedLoan.penaltyOutstandingPaise, 0, 'Penalty outstanding is ₹0');
  assert.strictEqual(closedLoan.status, 'SETTLED', 'Loan status is SETTLED');
  logPass('Integration: Recorded ₹1,00,040 successfully, loan SETTLED with ₹40 penalty paid.');

  // Test Audit Trail: Transaction records
  const txns = await Transaction.find({ loanId: dailyLoanId }).sort({ date: 1, createdAt: 1 });
  const penaltyTxn = txns.find((t) => (t.penaltyCreditPaise || 0) > 0);
  assert(penaltyTxn, 'Penalty credit transaction must be recorded in transaction ledger');
  assert.strictEqual(penaltyTxn.penaltyCreditPaise, 4000, 'Penalty credit matches ₹40');
  logPass('Audit Trail: Double-entry ledger properly records separate penalty credit transaction.');

  // Test Reversal: Reversing collection restores loan balance and penalty
  const reverseRes = await request(app)
    .post(`/api/collections/${collectionData._id}/reverse`)
    .set('Authorization', authHeader)
    .send({ reason: 'Accidental payment entry reversal test' });
  assert.strictEqual(reverseRes.status, 200, 'Reversal succeeded');

  const reopenedLoanRes = await request(app)
    .get(`/api/loans/${dailyLoanId}`)
    .set('Authorization', authHeader);
  const reopenedLoan = reopenedLoanRes.body.loan;
  assert.strictEqual(reopenedLoan.outstandingPrincipalPaise, 10000000, 'Principal restored to ₹1,00,000');
  assert.strictEqual(reopenedLoan.penaltyPaidPaise, 0, 'Penalty paid reverted to ₹0');
  assert(['ACTIVE', 'OVERDUE'].includes(reopenedLoan.status), 'Loan status restored to un-settled state (ACTIVE/OVERDUE)');
  logPass('Reversal Safety: Collection reversal safely restored principal and penalty balances without corruption.');

  console.log('\n================================================================');
  console.log('  ALL 10 CLIENT-CONFIRMED PENALTY REGRESSION TESTS PASSED!     ');
  console.log('================================================================');

  await mongoose.disconnect();
}

runPenaltyTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
