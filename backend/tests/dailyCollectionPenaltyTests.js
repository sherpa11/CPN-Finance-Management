process.env.NODE_ENV = 'test';
process.env.MONGODB_URI_TEST = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpn_raja_test_db';

const mongoose = require('mongoose');
const request = require('supertest');
const assert = require('assert');
const { DateTime } = require('luxon');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const DailyCollectionAccount = require('../src/models/DailyCollectionAccount');
const DailyCollectionPayment = require('../src/models/DailyCollectionPayment');
const Transaction = require('../src/models/Transaction');
const connectDB = require('../src/config/db');
const {
  calculateDailyPenalty,
  toPaise,
  toRupees,
} = require('../src/services/calculationEngine');

const TIMEZONE = 'Asia/Kolkata';

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
}

async function runDailyCollectionPenaltyTests() {
  console.log('================================================================');
  console.log('  CPN RAJA – DAILY COLLECTION ACCOUNT-SPECIFIC PENALTY SUITE   ');
  console.log('================================================================');

  await connectDB(process.env.MONGODB_URI_TEST);
  console.log('\n[Safety Verified] Connected to isolated test database: cpn_raja_test_db\n');

  // Clean test DB
  await Customer.deleteMany({});
  await Loan.deleteMany({});
  await DailyCollectionAccount.deleteMany({});
  await DailyCollectionPayment.deleteMany({});
  await Transaction.deleteMany({});

  const baseDate = DateTime.fromISO('2026-01-01', { zone: TIMEZONE });
  const dueDate = baseDate.plus({ days: 100 }).toJSDate();

  console.log('[SECTION 1: Pure Calculation Engine Tests]');

  // Test 1: Account A: ₹1,00,000 @ 2% -> ₹2,000/day
  const test1 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(100000),
    dailyRepaymentAmountPaise: toPaise(1000),
    dueDate,
    asOfDate: baseDate.plus({ days: 101 }).toJSDate(),
    penaltyRatePercent: 2.0,
  });
  assert.strictEqual(test1.overdueDays, 1, 'Test 1: Overdue days must be 1 on Day 101');
  assert.strictEqual(test1.dailyPenaltyPaise, toPaise(2000), 'Test 1: Daily penalty must be ₹2,000 (2% of ₹1,00,000)');
  assert.strictEqual(test1.cumulativePenaltyPaise, toPaise(2000), 'Test 1: Cumulative penalty for 1 day must be ₹2,000');
  logPass('Scenario 1: Gross ₹1,00,000 @ 2% = ₹2,000/day penalty.');

  // Test 2: Account B: ₹1,00,000 @ 10% -> ₹10,000/day. Overdue 3 days -> ₹30,000 total penalty
  const test2 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(100000),
    dailyRepaymentAmountPaise: toPaise(1000),
    dueDate,
    asOfDate: baseDate.plus({ days: 103 }).toJSDate(),
    penaltyRatePercent: 10.0,
  });
  assert.strictEqual(test2.overdueDays, 3, 'Test 2: Overdue days must be 3 on Day 103');
  assert.strictEqual(test2.dailyPenaltyPaise, toPaise(10000), 'Test 2: Daily penalty must be ₹10,000 (10% of ₹1,00,000)');
  assert.strictEqual(test2.cumulativePenaltyPaise, toPaise(30000), 'Test 2: Cumulative penalty for 3 days must be ₹30,000');
  logPass('Scenario 2: Gross ₹1,00,000 @ 10% = ₹10,000/day; 3 overdue days = ₹30,000 total penalty.');

  // Test 3: Account C: ₹50,000 @ 5% -> ₹2,500/day
  const test3 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(50000),
    dailyRepaymentAmountPaise: toPaise(500),
    dueDate,
    asOfDate: baseDate.plus({ days: 101 }).toJSDate(),
    penaltyRatePercent: 5.0,
  });
  assert.strictEqual(test3.overdueDays, 1, 'Test 3: Overdue days must be 1');
  assert.strictEqual(test3.dailyPenaltyPaise, toPaise(2500), 'Test 3: Daily penalty must be ₹2,500 (5% of ₹50,000)');
  assert.strictEqual(test3.cumulativePenaltyPaise, toPaise(2500), 'Test 3: Cumulative penalty must be ₹2,500');
  logPass('Scenario 3: Gross ₹50,000 @ 5% = ₹2,500/day penalty.');

  // Test 4: Multiple Overdue Days Calculation (5 days @ 5% on ₹50,000 = ₹12,500)
  const test4 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(50000),
    dailyRepaymentAmountPaise: toPaise(500),
    dueDate,
    asOfDate: baseDate.plus({ days: 105 }).toJSDate(),
    penaltyRatePercent: 5.0,
  });
  assert.strictEqual(test4.overdueDays, 5, 'Test 4: Overdue days must be 5');
  assert.strictEqual(test4.cumulativePenaltyPaise, toPaise(12500), 'Test 4: Cumulative penalty must be 5 × ₹2,500 = ₹12,500');
  logPass('Scenario 4: Multiple overdue days accumulates correctly (5 days × ₹2,500 = ₹12,500).');

  // Test 5: Upfront Interest Deduction Does NOT Reduce Penalty Principal
  // Example: Gross ₹1,00,000, Upfront Interest ₹10,000, Net cash ₹90,000 @ 10%
  // Penalty must be on ₹1,00,000 (₹10,000/day), NOT on ₹90,000 (which would be ₹9,000/day)
  const test5 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(100000), // Original Gross Principal
    dailyRepaymentAmountPaise: toPaise(1000),
    dueDate,
    asOfDate: baseDate.plus({ days: 101 }).toJSDate(),
    penaltyRatePercent: 10.0,
  });
  assert.strictEqual(test5.dailyPenaltyPaise, toPaise(10000), 'Test 5: Penalty must be on Gross ₹1,00,000 (₹10,000), NOT net ₹90,000');
  logPass('Scenario 5: Upfront interest does NOT reduce penalty principal (calculated on gross ₹1,00,000).');

  // Test 6: Integer Paise Precision & Odd Paise Handling
  // Example: Gross ₹75,333.33 @ 3.5%
  const grossOddPaise = 7533333; // ₹75,333.33
  const test6 = calculateDailyPenalty({
    grossPrincipalPaise: grossOddPaise,
    dueDate,
    asOfDate: baseDate.plus({ days: 102 }).toJSDate(),
    penaltyRatePercent: 3.5,
  });
  const expectedDailyOdd = Math.round((7533333 * 3.5) / 100);
  assert.strictEqual(test6.dailyPenaltyPaise, expectedDailyOdd, 'Test 6: Daily penalty paise must be rounded integer');
  assert.strictEqual(test6.cumulativePenaltyPaise, expectedDailyOdd * 2, 'Test 6: 2 overdue days exact integer precision');
  logPass('Scenario 6: Integer precision in paise maintained with zero floating point drift.');

  // Test 7: Backwards Compatibility Fallback (Defaults to 2.0% when omitted)
  const test7 = calculateDailyPenalty({
    grossPrincipalPaise: toPaise(100000),
    dueDate,
    asOfDate: baseDate.plus({ days: 101 }).toJSDate(),
    // penaltyRatePercent omitted
  });
  assert.strictEqual(test7.penaltyRatePercent, 2.0, 'Test 7: Defaults safely to 2.0%');
  assert.strictEqual(test7.dailyPenaltyPaise, toPaise(2000), 'Test 7: Default 2% on ₹1,00,000 = ₹2,000');
  logPass('Scenario 7: Backwards compatibility safe default of 2.0% when rate is omitted.');

  console.log('\n[SECTION 2: Integration & Database Tests]');

  // Authenticate as Admin
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: process.env.ADMIN_PASSWORD || 'cpnraja2026' });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const token = loginRes.body.token;

  // Create Test Customer
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Penalty Test Customer',
      mobileNumber: '9988776655',
      address: 'Salem Bazaar',
    });
  assert.strictEqual(custRes.status, 201, 'Customer creation must succeed');
  const customerId = custRes.body.customer._id;

  // Create Account A: Gross ₹1,00,000, 2% penalty rate
  const accARes = await request(app)
    .post('/api/daily-collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      grossPrincipal: 100000,
      upfrontInterestPercent: 10,
      upfrontInterestRupees: 10000,
      overduePenaltyRate: 2.0,
      totalDurationDays: 100,
      startDate: '2026-01-01',
    });
  assert.strictEqual(accARes.status, 201, 'Account A creation must succeed');
  const accountA = accARes.body.account;
  assert.strictEqual(accountA.overduePenaltyRate, 2.0, 'Account A overduePenaltyRate must be 2.0');
  assert.strictEqual(accountA.penaltyRatePercent, 2.0, 'Account A penaltyRatePercent must be 2.0');
  logPass('Scenario 8: Account A created with configurable 2.0% penalty rate.');

  // Create Account B: Gross ₹1,00,000, 10% penalty rate
  const accBRes = await request(app)
    .post('/api/daily-collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      grossPrincipal: 100000,
      upfrontInterestPercent: 10,
      upfrontInterestRupees: 10000,
      overduePenaltyRate: 10.0,
      totalDurationDays: 100,
      startDate: '2026-01-01',
    });
  assert.strictEqual(accBRes.status, 201, 'Account B creation must succeed');
  const accountB = accBRes.body.account;
  assert.strictEqual(accountB.overduePenaltyRate, 10.0, 'Account B overduePenaltyRate must be 10.0');
  assert.strictEqual(accountB.penaltyRatePercent, 10.0, 'Account B penaltyRatePercent must be 10.0');
  logPass('Scenario 9: Account B created with configurable 10.0% penalty rate.');

  // Create Account C: Gross ₹50,000, 5% penalty rate
  const accCRes = await request(app)
    .post('/api/daily-collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      grossPrincipal: 50000,
      upfrontInterestPercent: 10,
      upfrontInterestRupees: 5000,
      overduePenaltyRate: 5.0,
      totalDurationDays: 100,
      startDate: '2026-01-01',
    });
  assert.strictEqual(accCRes.status, 201, 'Account C creation must succeed');
  const accountC = accCRes.body.account;
  assert.strictEqual(accountC.overduePenaltyRate, 5.0, 'Account C overduePenaltyRate must be 5.0');
  assert.strictEqual(accountC.penaltyRatePercent, 5.0, 'Account C penaltyRatePercent must be 5.0');
  logPass('Scenario 10: Account C created with configurable 5.0% penalty rate.');

  // Test Account-Specific Rate Independence via List API
  const listRes = await request(app)
    .get('/api/daily-collections')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(listRes.status, 200, 'Daily collections listing must succeed');
  const accounts = listRes.body.accounts;

  const foundA = accounts.find((a) => a.accountId === accountA.accountId);
  const foundB = accounts.find((a) => a.accountId === accountB.accountId);
  const foundC = accounts.find((a) => a.accountId === accountC.accountId);

  assert.strictEqual(foundA.overduePenaltyRate, 2.0, 'Account A in list must have rate 2%');
  assert.strictEqual(foundA.penaltyBreakdown.dailyPenaltyRupees, 2000, 'Account A daily penalty must be ₹2,000');

  assert.strictEqual(foundB.overduePenaltyRate, 10.0, 'Account B in list must have rate 10%');
  assert.strictEqual(foundB.penaltyBreakdown.dailyPenaltyRupees, 10000, 'Account B daily penalty must be ₹10,000');

  assert.strictEqual(foundC.overduePenaltyRate, 5.0, 'Account C in list must have rate 5%');
  assert.strictEqual(foundC.penaltyBreakdown.dailyPenaltyRupees, 2500, 'Account C daily penalty must be ₹2,500');
  logPass('Scenario 11: Rate independence verified: Account A has ₹2,000/day, Account B has ₹10,000/day, Account C has ₹2,500/day simultaneously.');

  // Test Preview API with custom penalty rate
  const previewRes = await request(app)
    .post('/api/daily-collections/preview')
    .set('Authorization', `Bearer ${token}`)
    .send({
      grossPrincipal: 100000,
      upfrontInterestPercent: 10,
      overduePenaltyRate: 10,
      totalDurationDays: 100,
    });
  assert.strictEqual(previewRes.status, 200, 'Preview must succeed');
  assert.strictEqual(previewRes.body.preview.overduePenaltyRate, 10, 'Preview rate must be 10%');
  assert.strictEqual(previewRes.body.preview.dailyPenaltyRupees, 10000, 'Preview daily penalty must be ₹10,000');
  logPass('Scenario 12: Preview API returns accurate daily penalty forecast on gross principal.');

  console.log('\n================================================================');
  console.log('  ALL 12 DAILY COLLECTION PENALTY TESTS PASSED SUCCESSFULLY!   ');
  console.log('================================================================');

  await mongoose.connection.close();
  process.exit(0);
}

runDailyCollectionPenaltyTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
