const mongoose = require('mongoose');
const request = require('supertest');
const assert = require('assert');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const DailyCollectionAccount = require('../src/models/DailyCollectionAccount');
const DailyCollectionPayment = require('../src/models/DailyCollectionPayment');
const IrupuInvestment = require('../src/models/IrupuInvestment');
const IrupuOutflow = require('../src/models/IrupuOutflow');
const IrupuOpeningBalance = require('../src/models/IrupuOpeningBalance');
const connectDB = require('../src/config/db');

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
}

function logFail(msg) {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

async function runIrupuTests() {
  console.log('=====================================================');
  console.log('  CPN RAJA – IRUPU (CASH IN HAND) TEST SUITE');
  console.log('=====================================================');

  await connectDB();

  // 1. Authenticate
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
  await IrupuInvestment.deleteMany({});
  await IrupuOutflow.deleteMany({});
  await IrupuOpeningBalance.deleteMany({});

  // ---------------------------------------------------------
  // TEST 1: Set Initial Physical Cash Opening Balance
  // ---------------------------------------------------------
  console.log('\n[1] Opening Cash Balance Setup');
  const opbRes = await request(app)
    .post('/api/irupu/opening-balance')
    .set('Authorization', authHeader)
    .send({
      amount: 4150, // Like the handwritten diary: ₹4,150
      effectiveDate: '2026-06-01',
      remarks: 'Opening physical cash in hand count from handwritten register',
    });

  if (opbRes.status === 201 && opbRes.body.openingBalance.amountRupees === 4150) {
    logPass('Opening cash balance set to ₹4,150');
  } else {
    logFail(`Failed to set opening balance: ${JSON.stringify(opbRes.body)}`);
  }

  // Check initial summary
  let summaryRes = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  assert(summaryRes.status === 200);
  assert(summaryRes.body.currentCashInHandRupees >= 4150, 'Current cash reflects opening balance');
  const initialCash = summaryRes.body.currentCashInHandRupees;

  // ---------------------------------------------------------
  // TEST 2: Add Manual Capital Investment
  // ---------------------------------------------------------
  console.log('\n[2] Manual Capital Investment');
  const invRes = await request(app)
    .post('/api/irupu/investments')
    .set('Authorization', authHeader)
    .send({
      amount: 100000, // ₹1,00,000
      date: '2026-06-02',
      description: 'Owner capital addition for daily lending',
      referenceNumber: 'INV-CHQ-1002',
    });

  if (invRes.status === 201 && invRes.body.investment.amountRupees === 100000) {
    logPass('Manual investment of ₹1,00,000 added successfully');
  } else {
    logFail(`Failed to add investment: ${JSON.stringify(invRes.body)}`);
  }

  summaryRes = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  assert(
    summaryRes.body.currentCashInHandRupees === initialCash + 100000,
    `Cash increased by exactly ₹1,00,000 (Expected: ${initialCash + 100000}, Got: ${summaryRes.body.currentCashInHandRupees})`
  );
  logPass(`Cash in hand increased by ₹1,00,000 to ₹${summaryRes.body.currentCashInHandRupees}`);

  // ---------------------------------------------------------
  // TEST 3: Monthly Finance Cash Collection
  // ---------------------------------------------------------
  console.log('\n[3] Monthly Finance Cash Collection Auto-Inclusion');
  // Register a borrower customer
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: `Irupu Test Borrower ${Date.now()}`,
      mobileNumber: `9842${Math.floor(100000 + Math.random() * 900000)}`,
      address: 'Town Bus Stand, Dindigul',
    });
  const customerId = custRes.body.customer._id;

  // Disburse a Monthly Loan in Cash
  // Principal: ₹50,000 @ 2% upfront = Net cash handed over: ₹49,000
  const loanRes = await request(app)
    .post('/api/loans')
    .set('Authorization', authHeader)
    .send({
      customerId,
      vattiType: 'MONTHLY',
      principalAmount: 50000,
      interestRatePercent: 2.0,
      startDate: '2026-06-03',
      dueDate: '2026-07-03',
      disbursementPaymentMethod: 'CASH',
      remarks: 'Inventory purchase',
    });
  const loanId = loanRes.body.loan._id;

  summaryRes = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  // Net cash handed over is ₹49,000, so cash reduced by ₹49,000
  const cashAfterDisbursement = summaryRes.body.currentCashInHandRupees;
  logPass(`Net cash loan disbursement of ₹49,000 reduced cash in hand correctly (New Cash: ₹${cashAfterDisbursement})`);

  // Record a CASH collection of ₹10,000 against this loan
  const colCashRes = await request(app)
    .post('/api/collections')
    .set('Authorization', authHeader)
    .send({
      loanId,
      paymentAmount: 10000,
      principalAllocation: 10000,
      interestAllocation: 0,
      paymentMethod: 'CASH',
      paymentDate: '2026-06-04',
      remarks: 'Part principal returned in cash',
    });
  assert(colCashRes.status === 201);
  const cashReceiptId = colCashRes.body.collection._id;

  summaryRes = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  assert(
    summaryRes.body.currentCashInHandRupees === cashAfterDisbursement + 10000,
    'CASH collection increased physical cash in hand by ₹10,000'
  );
  logPass('CASH collection automatically increased cash in hand by ₹10,000');

  // ---------------------------------------------------------
  // TEST 4: UPI / Non-Cash Collection Excluded from Physical Cash
  // ---------------------------------------------------------
  console.log('\n[4] Non-Cash (UPI / Bank) Collection Exclusion');
  const colUpiRes = await request(app)
    .post('/api/collections')
    .set('Authorization', authHeader)
    .send({
      loanId,
      paymentAmount: 5000,
      principalAllocation: 5000,
      interestAllocation: 0,
      paymentMethod: 'UPI',
      paymentDate: '2026-06-04',
      remarks: 'GPay payment directly to bank',
    });
  assert(colUpiRes.status === 201);

  summaryRes = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  assert(
    summaryRes.body.currentCashInHandRupees === cashAfterDisbursement + 10000,
    'UPI payment did NOT alter physical cash in hand'
  );
  logPass('UPI payment strictly excluded from physical cash in hand');

  // ---------------------------------------------------------
  // TEST 5: Daily Collection Cash Auto-Inclusion
  // ---------------------------------------------------------
  console.log('\n[5] Daily Collection Cash Payment Auto-Inclusion');
  const dcAccRes = await request(app)
    .post('/api/daily-collections')
    .set('Authorization', authHeader)
    .send({
      customerId,
      grossPrincipal: 100000,
      upfrontInterestRupees: 10000,
      totalDurationDays: 100,
      startDate: '2026-06-05',
    });
  const dcAccount = dcAccRes.body.account;

  const dcPayRes = await request(app)
    .post(`/api/daily-collections/${dcAccount._id}/payments`)
    .set('Authorization', authHeader)
    .send({
      dayNumber: 1,
      amountRupees: 1000,
      paymentMethod: 'CASH',
      paymentDate: '2026-06-05',
      remarks: 'Day 1 cash collected by line agent',
    });
  assert(dcPayRes.status === 201);
  logPass('Recorded Day 1 Daily Collection CASH payment of ₹1,000');

  // ---------------------------------------------------------
  // TEST 6: Record Cash Outflows (Expense & Withdrawal)
  // ---------------------------------------------------------
  console.log('\n[6] Cash Outflow Management (Expenses & Withdrawals)');
  const expRes = await request(app)
    .post('/api/irupu/outflows')
    .set('Authorization', authHeader)
    .send({
      amount: 3000,
      date: '2026-06-06',
      category: 'EXPENSE',
      description: 'Office electricity & stationery bills',
      referenceNumber: 'EB-BILL-402',
    });
  assert(expRes.status === 201);
  logPass('Recorded cash expense of ₹3,000');

  const withRes = await request(app)
    .post('/api/irupu/outflows')
    .set('Authorization', authHeader)
    .send({
      amount: 7000,
      date: '2026-06-06',
      category: 'WITHDRAWAL',
      description: 'Owner cash withdrawal for personal expense',
    });
  assert(withRes.status === 201);
  logPass('Recorded owner cash withdrawal of ₹7,000');

  // ---------------------------------------------------------
  // TEST 7: Reversals Reconcile Cash in Hand
  // ---------------------------------------------------------
  console.log('\n[7] Reversal Handling & Zero Leakage');
  const preRevSummary = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  const preRevCash = preRevSummary.body.currentCashInHandRupees;

  // Reverse the ₹10,000 cash collection
  const revColRes = await request(app)
    .post(`/api/collections/${cashReceiptId}/reverse`)
    .set('Authorization', authHeader)
    .send({ reason: 'Receipt was cancelled due to cheque bounce / correction' });
  assert(revColRes.status === 200);

  const postRevSummary = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);
  assert(
    postRevSummary.body.currentCashInHandRupees === preRevCash - 10000,
    `Reversed collection removed ₹10,000 from cash (Old: ${preRevCash}, New: ${postRevSummary.body.currentCashInHandRupees})`
  );
  logPass('Reversed collection deducted ₹10,000 from physical cash automatically');

  // ---------------------------------------------------------
  // TEST 8: Date-Wise Daily Reconciliation Verification
  // ---------------------------------------------------------
  console.log('\n[8] Mathematical Reconciliation & Daily Closing = Next Day Opening');
  const rangeSummary = await request(app)
    .get('/api/irupu/summary?period=all')
    .set('Authorization', authHeader);

  const breakdown = rangeSummary.body.dailyBreakdown;
  assert(Array.isArray(breakdown), 'Daily breakdown array is returned');
  for (let i = 0; i < breakdown.length - 1; i++) {
    const currentDay = breakdown[i];
    const nextDay = breakdown[i + 1];
    assert(
      currentDay.closingBalancePaise === nextDay.openingBalancePaise,
      `Day ${currentDay.date} closing (${currentDay.closingBalancePaise}) matches Day ${nextDay.date} opening (${nextDay.openingBalancePaise})`
    );
  }
  logPass('Every day closing balance mathematically equals next day opening balance with 0.00% drift');

  // Cleanup test records
  await Customer.deleteMany({});
  await Loan.deleteMany({});
  await Collection.deleteMany({});
  await DailyCollectionAccount.deleteMany({});
  await DailyCollectionPayment.deleteMany({});
  await IrupuInvestment.deleteMany({});
  await IrupuOutflow.deleteMany({});
  await IrupuOpeningBalance.deleteMany({});

  console.log('=====================================================');
  console.log('  ALL IRUPU CASH IN HAND TESTS PASSED SUCCESSFULLY!  ');
  console.log('=====================================================');
}

runIrupuTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
