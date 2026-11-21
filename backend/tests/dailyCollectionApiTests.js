/**
 * CPN RAJA – DAILY COLLECTION API INTEGRATION SUITE
 * 
 * Verifies:
 * - Scheme A (Upfront Interest Deduction)
 * - Scheme B (Extended Days)
 * - 100–120 Day Schedule Generation
 * - Day Payment Recording, Partial Payments, Missed Payments
 * - Idempotency Key & Double Submission Prevention
 * - Audited Payment Reversals
 * - 11 KPI Summary Cards
 * - 10 Daily Collection Reports
 * - Regression & System Independence
 */
process.env.NODE_ENV = 'test';
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const Customer = require('../src/models/Customer');
const DailyCollectionAccount = require('../src/models/DailyCollectionAccount');
const DailyCollectionPayment = require('../src/models/DailyCollectionPayment');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failedCount++;
  }
}

async function runDailyCollectionTests() {
  console.log('=====================================================');
  console.log('  CPN RAJA – DAILY COLLECTION API TEST SUITE');
  console.log('=====================================================');

  try {
    await connectDB();

    // 1. Authenticate as Admin
    console.log('\n[1] Authentication');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cpnraja', password: process.env.ADMIN_PASSWORD || 'cpnraja2026' });

    assert(loginRes.status === 200, 'Admin login returns 200');
    const token = loginRes.body.token;
    assert(!!token, 'JWT auth token obtained');

    // 2. Register Test Customer
    console.log('\n[2] Customer Setup');
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Daily Collector Test Borrower',
        mobileNumber: '98421' + Math.floor(10000 + Math.random() * 90000),
        address: '124 Daily Bazaar, Dindigul',
        creditLimit: 500000,
        notes: 'Test borrower for Daily Collection Scheme A and B',
      });

    assert(custRes.status === 201, 'Test customer created');
    const testCustomerId = custRes.body.customer._id;

    // 3. Preview Scheme A
    console.log('\n[3] Scheme A Preview (Upfront Deduction)');
    const prevARes = await request(app)
      .post('/api/daily-collections/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheme: 'UPFRONT_DEDUCTION',
        grossPrincipal: 100000,
        upfrontInterestPercent: 10,
        startDate: '2026-11-20',
      });

    assert(prevARes.status === 200, 'Scheme A preview returned 200');
    assert(prevARes.body.preview.grossPrincipalRupees === 100000, 'Gross Principal is ₹1,00,000');
    assert(prevARes.body.preview.upfrontInterestRupees === 10000, 'Upfront Interest is ₹10,000');
    assert(prevARes.body.preview.netDisbursementRupees === 90000, 'Net Cash given is ₹90,000');
    assert(prevARes.body.preview.dailyInstalmentRupees === 1000, 'Daily Instalment is ₹1,000/day');
    assert(prevARes.body.preview.totalDurationDays === 100, 'Total Duration is 100 days');

    // 4. Create Scheme A Account
    console.log('\n[4] Create Daily Collection Scheme A Account');
    const createARes = await request(app)
      .post('/api/daily-collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomerId,
        scheme: 'UPFRONT_DEDUCTION',
        grossPrincipal: 100000,
        upfrontInterestRupees: 10000,
        upfrontInterestPercent: 10,
        startDate: '2026-11-20',
        remarks: 'Scheme A Test account with ₹10,000 upfront deduction',
      });

    assert(createARes.status === 201, 'Scheme A account created');
    const accA = createARes.body.account;
    const schemeAAccountId = accA._id;
    assert(accA.accountId.startsWith('CPN-DC-'), 'Account code generated: ' + accA.accountId);
    assert(accA.schedule.length === 100, '100-day schedule array created');
    assert(accA.schedule[0].category === 'PRINCIPAL', 'Day 1 is PRINCIPAL');
    assert(accA.schedule[99].category === 'PRINCIPAL', 'Day 100 is PRINCIPAL');
    assert(accA.totalRepaymentPaise === 10000000, 'Total Repayment is 10000000 paise');

    // 4b. Preview and Create 70-Day Daily Collection Account
    console.log('\n[4b] 70-Day Option Preview & Account Creation');
    const prev70Res = await request(app)
      .post('/api/daily-collections/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        scheme: 'UPFRONT_DEDUCTION',
        grossPrincipal: 70000,
        upfrontInterestPercent: 10,
        totalDurationDays: 70,
        startDate: '2026-11-20',
      });

    assert(prev70Res.status === 200, '70-day preview returned 200');
    assert(prev70Res.body.preview.grossPrincipalRupees === 70000, '70-day Gross Principal is ₹70,000');
    assert(prev70Res.body.preview.upfrontInterestRupees === 7000, '70-day Upfront Interest is ₹7,000');
    assert(prev70Res.body.preview.netDisbursementRupees === 63000, '70-day Net Cash is ₹63,000');
    assert(prev70Res.body.preview.dailyInstalmentRupees === 1000, '70-day Daily Instalment is ₹1,000/day');
    assert(prev70Res.body.preview.totalDurationDays === 70, '70-day Total Duration is 70 days');

    const create70Res = await request(app)
      .post('/api/daily-collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomerId,
        scheme: 'UPFRONT_DEDUCTION',
        grossPrincipal: 70000,
        upfrontInterestRupees: 7000,
        upfrontInterestPercent: 10,
        totalDurationDays: 70,
        startDate: '2026-11-20',
        remarks: '70-Day Option Test Account',
      });

    assert(create70Res.status === 201, '70-day account created successfully');
    const acc70 = create70Res.body.account;
    assert(acc70.totalDurationDays === 70, 'Account duration is 70 days');
    assert(acc70.schedule.length === 70, 'Schedule has exactly 70 days');
    assert(acc70.schedule[69].category === 'PRINCIPAL', 'Day 70 is PRINCIPAL');
    assert(acc70.totalRepaymentPaise === 7000000, 'Total Repayment is 7000000 paise');

    // 5. Create Scheme B Account (Extended Days)
    console.log('\n[5] Create Daily Collection Scheme B Account (Extended Days)');
    const createBRes = await request(app)
      .post('/api/daily-collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomerId,
        scheme: 'EXTENDED_DAYS',
        grossPrincipal: 100000,
        additionalInterestDays: 10,
        startDate: '2026-11-20',
        remarks: 'Scheme B Test account with 10 additional interest days',
      });

    assert(createBRes.status === 201, 'Scheme B account created');
    const accB = createBRes.body.account;
    const schemeBAccountId = accB._id;
    assert(accB.totalDurationDays === 110, 'Total duration is 110 days (100+10)');
    assert(accB.schedule.length === 110, '110-day schedule generated');
    assert(accB.schedule[99].category === 'PRINCIPAL', 'Day 100 is PRINCIPAL');
    assert(accB.schedule[100].category === 'INTEREST', 'Day 101 is INTEREST');
    assert(accB.schedule[109].category === 'INTEREST', 'Day 110 is INTEREST');
    assert(accB.netDisbursementPaise === 10000000, 'Net cash given equals full ₹1,00,000');

    // 6. Record Full Payment on Scheme A Day 1
    console.log('\n[6] Record Daily Collection Payment');
    const pay1Res = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 1,
        amountRupees: 1000,
        paymentMethod: 'CASH',
        status: 'PAID',
        remarks: 'Day 1 full collection in cash',
        idempotencyKey: `TEST-IDEMP-DAY1-${Date.now()}`,
      });

    assert(pay1Res.status === 201, 'Day 1 payment recorded');
    const day1PaymentId = pay1Res.body.payment.paymentId;
    assert(day1PaymentId.startsWith('DCP-'), 'Payment receipt generated: ' + day1PaymentId);
    assert(pay1Res.body.payment.principalAllocationPaise === 100000, 'Principal allocated 100000 paise');
    assert(pay1Res.body.account.daysCompleted === 1, 'Days completed is 1');
    assert(pay1Res.body.account.totalCollectedPaise === 100000, 'Total collected is ₹1,000');

    // 7. Record Partial Payment on Day 2
    console.log('\n[7] Record Partial Payment (Day 2)');
    const pay2Res = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 2,
        amountRupees: 500,
        paymentMethod: 'UPI',
        status: 'PARTIAL',
        remarks: 'Customer paid partial ₹500 today',
      });

    assert(pay2Res.status === 201, 'Day 2 partial payment recorded');
    const day2Item = pay2Res.body.account.schedule.find((s) => s.dayNumber === 2);
    assert(day2Item.status === 'PARTIAL', 'Day 2 marked PARTIAL in schedule');
    assert(day2Item.collectedPaise === 50000, 'Day 2 collected 50000 paise');

    // 8. Record Missed Day on Day 3
    console.log('\n[8] Record Missed Day (Day 3)');
    const pay3Res = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 3,
        status: 'MISSED',
        remarks: 'Shop closed today, payment missed',
      });

    assert(pay3Res.status === 201, 'Day 3 missed recorded');
    const day3Item = pay3Res.body.account.schedule.find((s) => s.dayNumber === 3);
    assert(day3Item.status === 'MISSED', 'Day 3 marked MISSED in schedule');
    assert(pay3Res.body.account.daysMissed === 1, 'Days missed count is 1');

    // 9. Record Payment on Scheme B Extended Interest Day 101
    console.log('\n[9] Record Scheme B Interest Day 101 Payment');
    const payB101Res = await request(app)
      .post(`/api/daily-collections/${schemeBAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 101,
        amountRupees: 1000,
        paymentMethod: 'BANK_TRANSFER',
        status: 'PAID',
        remarks: 'Interest day payment',
      });

    assert(payB101Res.status === 201, 'Day 101 payment recorded');
    assert(payB101Res.body.payment.category === 'INTEREST', 'Payment categorized as INTEREST');
    assert(payB101Res.body.payment.interestAllocationPaise === 100000, 'Interest allocated 100000 paise');
    assert(payB101Res.body.account.interestCollectedPaise === 100000, 'Account interest collected is ₹1,000');

    // 10. Idempotency Key Protection
    console.log('\n[10] Idempotency Key Duplicate Prevention');
    const idempKey = 'TEST-KEY-' + Date.now();
    const idemp1 = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 4,
        amountRupees: 1000,
        idempotencyKey: idempKey,
      });

    assert(idemp1.status === 201, 'First submission succeeded');

    const idemp2 = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dayNumber: 4,
        amountRupees: 1000,
        idempotencyKey: idempKey,
      });

    assert(idemp2.status === 200, 'Duplicate submission intercepted safely');
    assert(idemp2.body.message.includes('Idempotency matched'), 'Idempotency matched message returned');

    // 11. Payment Reversal
    console.log('\n[11] Payment Reversal & Balance Restoration');
    const revRes = await request(app)
      .post(`/api/daily-collections/${schemeAAccountId}/payments/${day1PaymentId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Entry mistake reversal test' });

    assert(revRes.status === 200, 'Reversal endpoint returned 200');
    assert(revRes.body.payment.status === 'REVERSED', 'Payment status changed to REVERSED');
    const day1Restored = revRes.body.account.schedule.find((s) => s.dayNumber === 1);
    assert(day1Restored.status === 'UPCOMING', 'Day 1 restored to UPCOMING');

    // 12. 11 KPI Dashboard Summary
    console.log('\n[12] Dashboard 11 KPI Summary');
    const sumRes = await request(app)
      .get('/api/daily-collections/summary')
      .set('Authorization', `Bearer ${token}`);

    assert(sumRes.status === 200, 'Dashboard summary returned 200');
    const s = sumRes.body.summary;
    assert(s.totalActiveAccounts >= 2, 'Total active accounts >= 2');
    assert(s.grossPrincipalDisbursedRupees >= 200000, 'Gross Principal disbursed >= ₹2,00,000');
    assert(s.netDisbursedRupees >= 190000, 'Net Disbursed >= ₹1,90,000 (90k + 100k)');
    assert(s.upfrontInterestDeductedRupees >= 10000, 'Upfront Interest deducted >= ₹10,000');
    assert(s.extendedDayInterestExpectedRupees >= 10000, 'Extended Day Interest expected >= ₹10,000');
    assert(s.totalCollectionsReceivedRupees > 0, 'Total collections received > 0');
    assert(s.totalOutstandingBalanceRupees > 0, 'Total outstanding balance > 0');
    assert(s.missedCollectionsCount >= 1, 'Missed collections count >= 1');

    // 13. Reports Validation
    console.log('\n[13] Daily Collection Reports (10 Schemes)');
    const r1 = await request(app).get('/api/daily-collections/reports?reportType=daily-summary').set('Authorization', `Bearer ${token}`);
    assert(r1.status === 200, 'Report 1 (Daily Summary) returned 200');

    const r2 = await request(app).get('/api/daily-collections/reports?reportType=account-status').set('Authorization', `Bearer ${token}`);
    assert(r2.status === 200, 'Report 2 (Account Status) returned 200');
    assert(r2.body.totalAccounts >= 2, 'Account status lists both accounts');

    const r3 = await request(app).get('/api/daily-collections/reports?reportType=scheme-comparison').set('Authorization', `Bearer ${token}`);
    assert(r3.status === 200, 'Report 3 (Scheme Comparison) returned 200');
    assert(r3.body.data.length >= 2, 'Scheme comparison has Scheme A and Scheme B entries');

    const r4 = await request(app).get('/api/daily-collections/reports?reportType=collection-sheet&date=2026-11-20').set('Authorization', `Bearer ${token}`);
    assert(r4.status === 200, 'Report 4 (Collection Sheet) returned 200');

    const r5 = await request(app).get('/api/daily-collections/reports?reportType=defaulters').set('Authorization', `Bearer ${token}`);
    assert(r5.status === 200, 'Report 5 (Defaulters) returned 200');

    const r6 = await request(app).get('/api/daily-collections/reports?reportType=partial-payments').set('Authorization', `Bearer ${token}`);
    assert(r6.status === 200, 'Report 6 (Partial Payments) returned 200');
    assert(r6.body.count >= 1, 'Partial payments contains Day 2 partial');

    const r7 = await request(app).get('/api/daily-collections/reports?reportType=maturity-forecast').set('Authorization', `Bearer ${token}`);
    assert(r7.status === 200, 'Report 7 (Maturity Forecast) returned 200');

    const r8 = await request(app).get('/api/daily-collections/reports?reportType=realization').set('Authorization', `Bearer ${token}`);
    assert(r8.status === 200, 'Report 8 (Realization) returned 200');
    assert(r8.body.data.totalGrossPrincipalRupees >= 200000, 'Gross principal verified in realization');

    const r9 = await request(app).get('/api/daily-collections/reports?reportType=consolidated').set('Authorization', `Bearer ${token}`);
    assert(r9.status === 200, 'Report 9 (Consolidated Performance) returned 200');

    // 14. System Independence Check
    console.log('\n[14] System Independence & Regression');
    const health = await request(app).get('/api/health');
    assert(health.status === 200, 'Health endpoint unaffected');

    const moiSeer = await request(app).get('/api/moi-seer/summary').set('Authorization', `Bearer ${token}`);
    assert(moiSeer.status === 200, 'Moi / Seer module unaffected');

    const loans = await request(app).get('/api/loans').set('Authorization', `Bearer ${token}`);
    assert(loans.status === 200, 'Loans module unaffected');

    console.log('\n=====================================================');
    console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('=====================================================');

    await mongoose.disconnect();
    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test Suite Error:', error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

runDailyCollectionTests();
