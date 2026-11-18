/**
 * CPN RAJA – End-to-End Comprehensive API Integration Test Suite
 * Runs directly in Node runtime to ensure 100% accurate native socket performance
 */
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const CalculationConfiguration = require('../src/models/CalculationConfiguration');
const connectDB = require('../src/config/db');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function run() {
  console.log('=====================================================');
  console.log('  CPN RAJA – FINANCIAL API INTEGRATION SUITE');
  console.log('=====================================================');

  await connectDB();

  // 1. Admin Login & JWT
  console.log('\n[1] Authentication & JWT');
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: 'cpnraja2026' });

  assert(loginRes.status === 200, 'POST /api/auth/login returns status 200');
  assert(!!loginRes.body.token, 'JWT token successfully issued');
  assert(loginRes.body.user.username === 'cpnraja', 'Authenticated user is cpnraja');

  const token = loginRes.body.token;

  // 2. Customer Registration
  console.log('\n[2] Customer Module');
  const mobile = `984${Math.floor(1000000 + Math.random() * 9000000)}`;
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Balasubramaniam Chettiar',
      mobileNumber: mobile,
      address: 'No. 55, South Car Street, Salem',
      notes: 'Hardware wholesale trader',
    });

  assert(custRes.status === 201, 'POST /api/customers returns status 201');
  assert(custRes.body.customer.customerId.startsWith('CPN-CUST-'), 'Sequential Customer ID generated');
  const customerId = custRes.body.customer._id;

  // 3. Loan Preview
  console.log('\n[3] Financial Calculation & Loan Preview');
  const prevRes = await request(app)
    .post('/api/loans/preview')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vattiType: 'MONTHLY',
      principalAmount: 100000,
      interestRatePercent: 2.0,
      startDate: '2026-01-01',
      dueDate: '2026-03-01', // 2 months
    });

  assert(prevRes.status === 200, 'POST /api/loans/preview returns status 200');
  assert(prevRes.body.preview.expectedInterestRupees === 4000, 'Expected interest is exactly ₹4,000 for ₹1,00,000 @ 2% for 2 months');
  assert(prevRes.body.preview.expectedTotalPayableRupees === 104000, 'Total payable is ₹1,04,000');

  // 4. Create Loan
  console.log('\n[4] Loan Disbursement & Snapshot');
  const loanRes = await request(app)
    .post('/api/loans')
    .set('Authorization', `Bearer ${token}`)
    .send({
      customerId,
      vattiType: 'MONTHLY',
      principalAmount: 100000,
      interestRatePercent: 2.0,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      remarks: 'Wholesale inventory expansion',
    });

  assert(loanRes.status === 201, 'POST /api/loans returns status 201');
  assert(loanRes.body.loan.loanId.startsWith('CPN-LN-'), 'Unique sequential Loan ID generated');
  assert(loanRes.body.loan.interestRatePercent === 2.0, 'Individual interest rate preserved');
  const loanId = loanRes.body.loan._id;

  // 5. Collection Recording & Idempotency
  console.log('\n[5] Collection Management & Idempotency');
  const idempotencyKey = `PAY-${Date.now()}-${Math.random()}`;

  const colRes = await request(app)
    .post('/api/collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      loanId,
      paymentDate: new Date().toISOString(),
      paymentAmount: 12000,
      principalAllocation: 10000,
      interestAllocation: 2000,
      paymentMethod: 'UPI',
      remarks: 'Payment received via PhonePe',
      idempotencyKey,
    });

  assert(colRes.status === 201, 'POST /api/collections returns status 201');
  assert(colRes.body.collection.receiptNumber.startsWith('RCP-'), 'Unique printable receipt number generated');
  assert(colRes.body.remainingSummary.remainingPrincipalRupees === 90000, 'Principal reduced accurately from ₹1,00,000 to ₹90,000');
  const collectionId = colRes.body.collection._id;

  // Duplicate submission check
  const dupRes = await request(app)
    .post('/api/collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      loanId,
      paymentDate: new Date().toISOString(),
      paymentAmount: 12000,
      principalAllocation: 10000,
      interestAllocation: 2000,
      paymentMethod: 'UPI',
      remarks: 'Payment received via PhonePe',
      idempotencyKey,
    });

  assert(dupRes.body.isDuplicateSubmission === true, 'Duplicate payment prevented via Idempotency Key');

  // 6. Audited Collection Reversal
  console.log('\n[6] Audited Financial Reversal');
  const revRes = await request(app)
    .post(`/api/collections/${collectionId}/reverse`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      reason: 'Wrong bank transfer credited by customer',
    });

  assert(revRes.status === 200, 'POST /api/collections/:id/reverse returns status 200');
  assert(revRes.body.collection.status === 'REVERSED', 'Collection marked REVERSED without deletion');

  // 7. Customer & Loan Ledger
  console.log('\n[7] Financial Ledger');
  const ledRes = await request(app)
    .get(`/api/ledger/loan/${loanId}`)
    .set('Authorization', `Bearer ${token}`);

  assert(ledRes.status === 200, 'GET /api/ledger/loan/:id returns status 200');
  assert(Array.isArray(ledRes.body.ledger.transactions), 'Transactions array present');
  assert(ledRes.body.ledger.transactions.length >= 2, 'Disbursement and reversal entries preserved');

  // 8. Notifications Menu
  console.log('\n[8] Notifications Engine');
  const notifRes = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${token}`);

  assert(notifRes.status === 200, 'GET /api/notifications returns status 200');
  assert(Array.isArray(notifRes.body.notifications), 'Notifications array retrieved');

  // 9. Dashboard KPIs
  console.log('\n[9] Dashboard KPIs & Trends');
  const dashRes = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${token}`);

  assert(dashRes.status === 200, 'GET /api/dashboard returns status 200');
  assert(dashRes.body.data.summary.totalCustomers >= 1, 'Total customers metric present');
  assert(dashRes.body.data.monthlyTrends.length === 6, '6-Month trend dataset available');

  // 10. Reports
  console.log('\n[10] Reports Segregation');
  const repRes = await request(app)
    .get('/api/reports/daily')
    .set('Authorization', `Bearer ${token}`);

  assert(repRes.status === 200, 'GET /api/reports/daily returns status 200');
  assert(repRes.body.report.summary.principalLentRupees !== undefined, 'Principal lent segregated from collections');
  assert(repRes.body.report.summary.interestCollectedRupees !== undefined, 'Interest collected segregated');

  console.log('=====================================================');
  console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('=====================================================');

  await mongoose.disconnect();
  process.exit(failCount === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('[API Test Runner Error]', err);
  process.exit(1);
});
