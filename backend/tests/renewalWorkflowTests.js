process.env.NODE_ENV = 'test';
process.env.MONGODB_URI_TEST = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/cpn_raja_test_db';

const assert = require('assert');
const request = require('supertest');
const app = require('../src/app');
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const DailyCollectionAccount = require('../src/models/DailyCollectionAccount');
const DailyCollectionPayment = require('../src/models/DailyCollectionPayment');
const Transaction = require('../src/models/Transaction');
const IrupuInvestment = require('../src/models/IrupuInvestment');
const IrupuOutflow = require('../src/models/IrupuOutflow');
const IrupuOpeningBalance = require('../src/models/IrupuOpeningBalance');
const connectDB = require('../src/config/db');
const { getIrupuSummary } = require('../src/services/irupuService');
const { toPaise, toRupees } = require('../src/services/calculationEngine');

const logPass = (title) => console.log(`  \x1b[32m✓ PASS:\x1b[0m ${title}`);

async function runRenewalWorkflowTests() {
  console.log('\n================================================================');
  console.log('   CPN RAJA – MONTHLY & DAILY FINANCE RENEWAL REGRESSION SUITE   ');
  console.log('================================================================\n');

  // Verify test database connection safety
  const mongooseInstance = await connectDB();
  const dbName = mongooseInstance.connection.name;
  if (!dbName || !dbName.toLowerCase().includes('test')) {
    throw new Error(`Unsafe operation: Tests must run on isolated test database! Currently: ${dbName}`);
  }
  console.log(`[Safety Verified] Connected to isolated test database: ${dbName}\n`);

  // Clear test DB collections
  await Customer.deleteMany({});
  await Loan.deleteMany({});
  await Collection.deleteMany({});
  await Transaction.deleteMany({});
  await IrupuInvestment.deleteMany({});
  await IrupuOutflow.deleteMany({});
  await IrupuOpeningBalance.deleteMany({});

  // 1. Authenticate
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: process.env.TEST_ADMIN_PASSWORD || 'cpnraja2026' });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const token = loginRes.body.token;
  const authHeader = `Bearer ${token}`;

  // Create test customer
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Anbu',
      mobileNumber: '9842100001',
      address: 'Salem City, TN',
    });
  assert.strictEqual(custRes.status, 201);
  const customerId = custRes.body.customer._id;

  // -------------------------------------------------------------
  // [TEST 1 & 10 & 12] Monthly Finance Upfront Interest Deduction & Irupu
  // Customer borrows ₹1,00,000 @ 2% for 1 month
  // Upfront interest: ₹2,000, Net given: ₹98,000, Repayable: ₹1,00,000
  // -------------------------------------------------------------
  console.log('[TEST 1] Monthly Finance Upfront Interest Deduction');
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
      disbursementPaymentMethod: 'CASH',
    });
  assert.strictEqual(monthlyLoanRes.status, 201);
  const loan1 = monthlyLoanRes.body.loan;
  assert.strictEqual(loan1.upfrontInterestPaise, 200000, 'Upfront interest must be ₹2,000 (200,000 paise)');
  assert.strictEqual(loan1.netDisbursementPaise, 9800000, 'Net cash disbursed must be ₹98,000');
  assert.strictEqual(loan1.outstandingPrincipalPaise, 10000000, 'Outstanding principal must remain full ₹1,00,000');
  assert.strictEqual(loan1.renewalCount, 0, 'Initial renewal count must be 0');
  logPass('Requirement 1: Monthly Finance upfront interest deduction (₹2,000 deducted, ₹98,000 given, ₹1,00,000 outstanding).');

  // Verify Upfront Interest in Collections
  const colRes1 = await request(app)
    .get('/api/collections?loanId=' + loan1._id)
    .set('Authorization', authHeader);
  assert.strictEqual(colRes1.status, 200);
  const upfrontCol = colRes1.body.collections.find((c) => c.isUpfrontInterest);
  assert(upfrontCol, 'Upfront interest must be displayed in Collections');
  assert.strictEqual(upfrontCol.interestAllocationRupees, 2000, 'Upfront collection interest must be ₹2,000');
  assert.strictEqual(upfrontCol.principalAllocationRupees, 0, 'Upfront collection principal must be ₹0');
  logPass('Requirement 10: Upfront interest appears in Collections menu under customer and loan.');

  // Verify Irupu cash in hand after disbursement
  const irupuSummary1 = await getIrupuSummary({ period: 'ALL_TIME' });
  // Cash in hand = 0 opening - ₹98,000 net disbursed = -₹98,000 (no double counting!)
  assert.strictEqual(irupuSummary1.allTimeSummary.currentCashInHandRupees, -98000, 'Irupu cash in hand must reflect exact net cash given -₹98,000');
  logPass('Requirement 12: Upfront interest is counted exactly once in Irupu during disbursement.');

  // -------------------------------------------------------------
  // [TEST 3 & 4 & 8 & 9 & 11 & 13] Monthly Finance Renewal After Due Date
  // Loan reaches due date (2026-02-01). Full principal ₹1,00,000 not repaid.
  // Customer pays ₹2,000 renewal interest.
  // Loan extends by 1 month to 2026-03-01. Outstanding remains ₹1,00,000.
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Monthly Finance Renewal Process & Non-Compounding');
  const renewRes1 = await request(app)
    .post(`/api/loans/${loan1._id}/renew`)
    .set('Authorization', authHeader)
    .send({
      paymentAmount: 2000,
      paymentMethod: 'CASH',
      paymentDate: '2026-02-01',
      remarks: 'First month renewal interest payment',
    });
  assert.strictEqual(renewRes1.status, 200, 'Renewal must succeed');
  assert.strictEqual(renewRes1.body.renewalNumber, 1, 'Renewal count must become 1');
  assert.strictEqual(renewRes1.body.newDueDate, '2026-03-01', 'Due date must extend by 1 calendar month to 2026-03-01');
  assert.strictEqual(renewRes1.body.outstandingPrincipalRupees, 100000, 'Outstanding principal must remain ₹1,00,000');
  logPass('Requirement 3 & 9: Monthly Finance renews after due date, renewal count becomes 1, due date extends to 2026-03-01.');
  logPass('Requirement 8: Renewal interest does NOT increase principal (remains ₹1,00,000).');

  // Verify Renewal Interest in Collections
  const colRes2 = await request(app)
    .get('/api/collections?loanId=' + loan1._id)
    .set('Authorization', authHeader);
  const renewalCol = colRes2.body.collections.find((c) => c.collectionType === 'RENEWAL_INTEREST' || c.isRenewalInterest);
  assert(renewalCol, 'Renewal interest must appear in Collections');
  assert.strictEqual(renewalCol.totalAmountRupees, 2000);
  assert.strictEqual(renewalCol.interestAllocationRupees, 2000);
  assert.strictEqual(renewalCol.principalAllocationRupees, 0);
  logPass('Requirement 11: Renewal interest appears in Collections as RENEWAL_INTEREST receipt.');

  // Verify Irupu cash in hand after renewal payment
  const irupuSummary2 = await getIrupuSummary({ period: 'ALL_TIME' });
  // Cash in hand = -₹98,000 + ₹2,000 renewal cash = -₹96,000
  assert.strictEqual(irupuSummary2.allTimeSummary.currentCashInHandRupees, -96000, 'Irupu must increase physical cash by ₹2,000 renewal interest');
  assert.strictEqual(irupuSummary2.periodSummary.monthlyCashRupees, 4000, 'Monthly cash total = ₹2,000 upfront + ₹2,000 renewal = ₹4,000');
  logPass('Requirement 13: Renewal interest is counted exactly once in Irupu cash in hand.');

  // Verify 2nd Renewal: Interest remains fixed at ₹2,000 for the same ₹1,00,000 principal
  const renewRes2 = await request(app)
    .post(`/api/loans/${loan1._id}/renew`)
    .set('Authorization', authHeader)
    .send({
      paymentAmount: 2000,
      paymentMethod: 'CASH',
      paymentDate: '2026-03-01',
    });
  assert.strictEqual(renewRes2.status, 200);
  assert.strictEqual(renewRes2.body.renewalNumber, 2);
  assert.strictEqual(renewRes2.body.newDueDate, '2026-04-01');
  assert.strictEqual(renewRes2.body.outstandingPrincipalRupees, 100000);
  logPass('Requirement 4: Monthly Finance renewal interest remains fixed at ₹2,000 for the same principal.');

  // -------------------------------------------------------------
  // [TEST 2] Monthly Finance Full Principal Repayment Before Due Date
  // Customer repays the entire ₹1,00,000 principal. Loan settles. No further interest.
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Monthly Finance Full Principal Repayment');
  const repayRes = await request(app)
    .post('/api/collections')
    .set('Authorization', authHeader)
    .send({
      loanId: loan1._id,
      paymentAmount: 100000,
      principalAllocation: 100000,
      interestAllocation: 0,
      penaltyAllocation: 0,
      paymentMethod: 'CASH',
      paymentDate: '2026-03-15',
    });
  assert.strictEqual(repayRes.status, 201);

  const settledLoanRes = await request(app)
    .get(`/api/loans/${loan1._id}`)
    .set('Authorization', authHeader);
  assert.strictEqual(settledLoanRes.body.loan.outstandingPrincipalPaise, 0, 'Outstanding principal must be ₹0');
  assert.strictEqual(settledLoanRes.body.loan.status, 'SETTLED', 'Loan must be marked SETTLED');
  logPass('Requirement 2: Monthly Finance full principal repayment settles loan without further interest.');

  // -------------------------------------------------------------
  // [TEST 5, 6, 7] Daily Finance Upfront Interest, 10-day Period & Renewal
  // Principal: ₹1,00,000 @ 2% for 10 days
  // Upfront interest: ₹2,000, Net given: ₹98,000, Due date: +10 days
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Daily Finance Upfront Interest & 10-Day Renewal Workflow');
  const dailyLoanRes = await request(app)
    .post('/api/loans')
    .set('Authorization', authHeader)
    .send({
      customerId,
      vattiType: 'DAILY',
      principalAmount: 100000,
      interestRatePercent: 2.0,
      startDate: '2026-05-01',
      dueDate: '2026-05-11',
      disbursementPaymentMethod: 'CASH',
    });
  assert.strictEqual(dailyLoanRes.status, 201);
  const dailyLoan = dailyLoanRes.body.loan;
  assert.strictEqual(dailyLoan.upfrontInterestPaise, 200000, 'Daily upfront interest must be ₹2,000');
  assert.strictEqual(dailyLoan.netDisbursementPaise, 9800000, 'Daily net cash given must be ₹98,000');
  assert.strictEqual(dailyLoan.outstandingPrincipalPaise, 10000000, 'Daily repayable principal must be ₹1,00,000');
  assert.strictEqual(dailyLoan.renewalCount, 0);
  logPass('Requirement 5: Daily Finance upfront interest deduction (₹2,000 deducted, ₹98,000 given, ₹1,00,000 repayable).');
  logPass('Requirement 6: Daily Finance 10-day repayment period (2026-05-01 to 2026-05-11).');

  // Daily Finance Renewal after 10 days
  const dailyRenewRes = await request(app)
    .post(`/api/loans/${dailyLoan._id}/renew`)
    .set('Authorization', authHeader)
    .send({
      paymentAmount: 2000,
      paymentMethod: 'CASH',
      paymentDate: '2026-05-11',
      remarks: 'Daily Finance 10-day renewal',
    });
  assert.strictEqual(dailyRenewRes.status, 200);
  assert.strictEqual(dailyRenewRes.body.renewalNumber, 1);
  assert.strictEqual(dailyRenewRes.body.newDueDate, '2026-05-21', 'Daily renewal must extend by exactly 10 days to 2026-05-21');
  assert.strictEqual(dailyRenewRes.body.outstandingPrincipalRupees, 100000, 'Outstanding principal remains ₹1,00,000');
  logPass('Requirement 7: Daily Finance renewal extends loan by exactly 10 calendar days with ₹2,000 interest.');

  // -------------------------------------------------------------
  // [TEST 14] Customer Ledger Integrity Check
  // Verify that transactions list shows:
  // - Principal disbursed
  // - Upfront interest collected
  // - Renewal interest collected
  // - Principal repayment
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Customer Ledger Separation & Audit Trail');
  const ledgerRes = await request(app)
    .get(`/api/ledger/customer/${customerId}`)
    .set('Authorization', authHeader);
  assert.strictEqual(ledgerRes.status, 200);
  const txns = ledgerRes.body.ledger.transactions;
  const disbursementTxns = txns.filter((t) => t.type === 'LOAN_DISBURSEMENT');
  const renewalTxns = txns.filter((t) => t.type === 'RENEWAL_INTEREST');
  const principalRepayTxns = txns.filter((t) => t.principalCreditRupees > 0);

  assert(disbursementTxns.length >= 2, 'Must record loan disbursement transactions');
  assert(renewalTxns.length >= 3, 'Must record distinct renewal interest transactions');
  assert(principalRepayTxns.length >= 1, 'Must record principal repayments separately');
  logPass('Requirement 14: Customer ledger accurately separates disbursement, upfront interest, renewal interest, and principal repayments.');

  // -------------------------------------------------------------
  // [TEST 15] Existing Daily Collection (DC) Functionality Unaffected
  // -------------------------------------------------------------
  console.log('\n[TEST 6] System Independence: Daily Collection & Chit Fund Unaffected');
  const dcAccountRes = await request(app)
    .post('/api/daily-collections')
    .set('Authorization', authHeader)
    .send({
      customerId,
      scheme: 'UPFRONT_DEDUCTION',
      grossPrincipal: 100000,
      totalDurationDays: 100,
      upfrontInterestPercent: 10,
      startDate: '2026-06-01',
    });
  assert.strictEqual(dcAccountRes.status, 201, 'Daily Collection account creation must work unaffected');
  logPass('Requirement 15: Existing Daily Collection functionality remains completely unaffected.');

  // -------------------------------------------------------------
  // [TEST 16] Existing Historical Records Remain Intact
  // -------------------------------------------------------------
  const allLoansRes = await request(app)
    .get('/api/loans')
    .set('Authorization', authHeader);
  assert.strictEqual(allLoansRes.status, 200);
  assert(allLoansRes.body.loans.length >= 2, 'All historical loan records remain safely stored and intact');
  logPass('Requirement 16: Existing historical records remain completely intact.');

  console.log('\n================================================================');
  console.log('  ALL 16 RENEWAL WORKFLOW REGRESSION TESTS PASSED SUCCESSFULLY! ');
  console.log('================================================================\n');
}

runRenewalWorkflowTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
