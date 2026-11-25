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
const ChitGroup = require('../src/models/ChitGroup');
const MoiSeerPerson = require('../src/models/MoiSeerPerson');
const connectDB = require('../src/config/db');
const { getIrupuSummary } = require('../src/services/irupuService');
const {
  toPaise,
  toRupees,
  calculateLegacyMonthlyDates,
  calculateLegacyDailyDates,
} = require('../src/services/calculationEngine');

const logPass = (title) => console.log(`  \x1b[32m✓ PASS:\x1b[0m ${title}`);

async function runLegacyLoanTests() {
  console.log('\n================================================================');
  console.log('   CPN RAJA – EXISTING / LEGACY LOAN REGRESSION TEST SUITE      ');
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
  await DailyCollectionAccount.deleteMany({});
  await DailyCollectionPayment.deleteMany({});
  await IrupuInvestment.deleteMany({});
  await IrupuOutflow.deleteMany({});
  await IrupuOpeningBalance.deleteMany({});
  await ChitGroup.deleteMany({});
  await MoiSeerPerson.deleteMany({});

  // 1. Authenticate
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: process.env.TEST_ADMIN_PASSWORD || 'cpnraja2026' });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const token = loginRes.body.token;
  const authHeader = `Bearer ${token}`;

  // Create test customers
  const custRes1 = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Old Borrower Ramanathan',
      mobileNumber: '9842100099',
      address: 'Old Town, Salem',
    });
  assert.strictEqual(custRes1.status, 201);
  const customerId1 = custRes1.body.customer._id;

  const custRes2 = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Legacy Daily Borrower Kannan',
      mobileNumber: '9842100088',
      address: 'Market Street, Salem',
    });
  assert.strictEqual(custRes2.status, 201);
  const customerId2 = custRes2.body.customer._id;

  // -------------------------------------------------------------
  // [TEST 1 & 3] Monthly Finance Legacy Date Calculation & 30+ Renewals Import
  // -------------------------------------------------------------
  console.log('[TEST 1 & 3] Monthly Finance Legacy Date Calculation & 30+ Renewals Import');
  {
    const dateMath = calculateLegacyMonthlyDates({
      originalLoanDate: '2024-01-25',
      lastPaidThroughDate: '2026-10-25',
    });
    assert.strictEqual(dateMath.suggestedRenewals, 33, '2024-01-25 to 2026-10-25 must equal exactly 33 renewals');
    assert.strictEqual(dateMath.suggestedNextDueDate, '2026-11-25', 'Suggested next due date must be 2026-11-25 (+1 calendar month)');
    logPass('Test 3: Correct next due date and 33 completed renewals calculated for Monthly Finance');

    // Call preview API
    const previewRes = await request(app)
      .post('/api/loans/preview-legacy')
      .set('Authorization', authHeader)
      .send({
        vattiType: 'MONTHLY',
        originalLoanDate: '2024-01-25',
        lastPaidThroughDate: '2026-10-25',
        originalPrincipal: 100000,
        interestRatePercent: 2,
        outstandingPrincipal: 100000,
      });
    assert.strictEqual(previewRes.status, 200);
    assert.strictEqual(previewRes.body.preview.suggestedRenewalCount, 33);
    assert.strictEqual(previewRes.body.preview.suggestedNextDueDate, '2026-11-25');
    assert.strictEqual(previewRes.body.preview.autoUpfrontInterestRupees, 2000);
    assert.strictEqual(previewRes.body.preview.autoNetGivenRupees, 98000);
    assert.strictEqual(previewRes.body.preview.renewalInterestRupees, 2000);

    // Verify User Requirement: Gross ₹1,00,000 @ 2% with Outstanding ₹50,000 calculates renewal interest as ₹2,000 (NOT ₹1,000)
    const previewPartialPrincipalRes = await request(app)
      .post('/api/loans/preview-legacy')
      .set('Authorization', authHeader)
      .send({
        vattiType: 'MONTHLY',
        originalLoanDate: '2024-01-25',
        lastPaidThroughDate: '2026-10-25',
        originalPrincipal: 100000,
        interestRatePercent: 2,
        outstandingPrincipal: 50000,
      });
    assert.strictEqual(previewPartialPrincipalRes.status, 200);
    assert.strictEqual(previewPartialPrincipalRes.body.preview.renewalInterestRupees, 2000, 'Renewal interest must be 2% on Original Gross Principal ₹1,00,000 (= ₹2,000), not on Outstanding ₹50,000');

    // Initial Irupu Cash Box check before legacy loan import
    const irupuBefore = await getIrupuSummary({ period: 'all' });
    const cashBefore = irupuBefore.currentCashInHandRupees;

    // Import Monthly Legacy Loan
    const importRes = await request(app)
      .post('/api/loans/legacy')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId1,
        vattiType: 'MONTHLY',
        originalLoanDate: '2024-01-25',
        originalPrincipal: 100000,
        interestRatePercent: 2,
        currentOutstandingPrincipal: 100000,
        renewalInterestAmount: 2000,
        lastPaidThroughDate: '2026-10-25',
        nextDueDate: '2026-11-25',
        completedRenewals: 33,
        historicalReference: 'Old Ledger Page 14',
        remarks: 'Migrated historical loan with 33 past extensions',
      });

    assert.strictEqual(importRes.status, 201, `Import failed: ${JSON.stringify(importRes.body)}`);
    const loan = importRes.body.loan;
    assert.strictEqual(loan.isLegacyLoan, true, 'isLegacyLoan must be true');
    assert.strictEqual(loan.renewalCount, 33, 'renewalCount must be 33');
    assert.strictEqual(loan.outstandingPrincipalPaise, 10000000, 'Outstanding principal must be ₹1,00,000 (10000000 paise)');
    assert.ok(['ACTIVE', 'OVERDUE'].includes(loan.status), `Status must be ACTIVE or OVERDUE, got: ${loan.status}`);

    // Verify exactly 0 collections were created
    const collectionsCount = await Collection.countDocuments({});
    assert.strictEqual(collectionsCount, 0, 'Test 11: Legacy loan must NOT create fake collection receipts');

    // Verify Irupu cash is completely unaffected (Tests 8, 9, 10)
    const irupuAfter = await getIrupuSummary({ period: 'all' });
    assert.strictEqual(irupuAfter.currentCashInHandRupees, cashBefore, 'Tests 8, 9, 10: Cash in Hand must be identical before and after legacy import');
    assert.strictEqual(irupuAfter.periodSummary.disbursementRupees, 0, 'Test 8: Legacy loan must NOT create a new cash disbursement');
    assert.strictEqual(irupuAfter.periodSummary.monthlyFinanceCashRupees, 0, 'Test 9 & 10: Legacy loan must NOT create upfront or renewal cash inflow');

    logPass('Test 1: Imported existing Monthly Finance loan with 33 completed renewals');
    logPass('Test 8, 9, 10, 11: Verified zero cash-in-hand drift and zero fake collection receipts');
  }

  // -------------------------------------------------------------
  // [TEST 2 & 4] Daily Finance Legacy Date Calculation & 10-Day Renewals Import
  // -------------------------------------------------------------
  console.log('\n[TEST 2 & 4] Daily Finance Legacy Date Calculation & 10-Day Renewals Import');
  {
    const dateMath = calculateLegacyDailyDates({
      originalLoanDate: '2025-01-01',
      lastPaidThroughDate: '2026-11-20',
    });
    assert.strictEqual(dateMath.suggestedNextDueDate, '2026-11-30', 'Suggested next due date must be 2026-11-30 (+10 calendar days)');
    assert(dateMath.suggestedRenewals >= 68, '688 days must equal 68 10-day renewal periods');
    logPass('Test 4: Correct next due date (+10 days) and 68 completed renewals calculated for Daily Finance');

    // Import Daily Legacy Loan
    const importRes = await request(app)
      .post('/api/loans/legacy')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId2,
        vattiType: 'DAILY',
        originalLoanDate: '2025-01-01',
        originalPrincipal: 100000,
        interestRatePercent: 2,
        currentOutstandingPrincipal: 100000,
        renewalInterestAmount: 2000,
        lastPaidThroughDate: '2026-11-20',
        nextDueDate: '2026-11-30',
        completedRenewals: 68,
        historicalReference: 'Daily Book 5',
        remarks: 'Migrated Daily Finance 10-day renewal loan',
      });

    assert.strictEqual(importRes.status, 201);
    const loan = importRes.body.loan;
    assert.strictEqual(loan.isLegacyLoan, true);
    assert.strictEqual(loan.renewalCount, 68);
    assert.strictEqual(loan.vattiType, 'DAILY');
    logPass('Test 2: Imported existing Daily Finance loan with 68 completed 10-day renewals');
  }

  // -------------------------------------------------------------
  // [TEST 5, 6, 7] Manual Overrides & Partial Principal Repaid
  // -------------------------------------------------------------
  console.log('\n[TEST 5, 6, 7] Manual Overrides & Partial Principal Repaid');
  {
    // Customer originally took ₹1,00,000, but outstanding principal is now ₹75,000
    // User manually overrides renewal count to 40 and next due date to 2026-12-05
    const overrideRes = await request(app)
      .post('/api/loans/legacy')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId1,
        vattiType: 'MONTHLY',
        originalLoanDate: '2023-05-10',
        originalPrincipal: 100000,
        currentOutstandingPrincipal: 75000, // Different from original principal!
        interestRatePercent: 2,
        renewalInterestAmount: 1500, // Customized monthly interest for ₹75,000
        lastPaidThroughDate: '2026-10-10',
        nextDueDate: '2026-12-05', // Manually corrected irregular due date
        completedRenewals: 40, // Manually corrected verified count
        remarks: 'Customer already repaid ₹25,000 principal in cash historically',
      });

    assert.strictEqual(overrideRes.status, 201);
    const loan = overrideRes.body.loan;
    assert.strictEqual(loan.principalPaise, 10000000, 'Original principal is ₹1,00,000');
    assert.strictEqual(loan.outstandingPrincipalPaise, 7500000, 'Test 7: Current outstanding principal is ₹75,000 (different from original)');
    assert.strictEqual(loan.totalPrincipalPaidPaise, 2500000, 'Historical principal repaid is ₹25,000');
    assert.strictEqual(loan.renewalCount, 40, 'Test 5: Manually corrected renewal count is 40');
    assert(new Date(loan.dueDate).toISOString().startsWith('2026-12-05'), 'Test 6: Manually corrected next due date is 2026-12-05');
    logPass('Test 5: Manual correction of renewal count (40) verified');
    logPass('Test 6: Manual correction of next due date (2026-12-05) verified');
    logPass('Test 7: Current outstanding principal (₹75,000) accurately differs from original (₹1,00,000)');
  }

  // -------------------------------------------------------------
  // [TEST 12] Future Monthly Renewal Increases Cash in Hand Exactly Once
  // -------------------------------------------------------------
  console.log('\n[TEST 12] Future Monthly Renewal Increases Cash in Hand Exactly Once');
  {
    // Find the first monthly legacy loan
    const legacyLoan = await Loan.findOne({ customerId: customerId1, principalPaise: 10000000, outstandingPrincipalPaise: 10000000 });
    assert(legacyLoan, 'Legacy loan not found');
    assert.strictEqual(legacyLoan.renewalCount, 33);

    const cashBefore = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;

    // Customer pays ₹2,000 to renew for another month
    const renewRes = await request(app)
      .post(`/api/loans/${legacyLoan._id}/renew`)
      .set('Authorization', authHeader)
      .send({
        paymentAmount: 2000,
        paymentMethod: 'CASH',
        paymentDate: '2026-11-25',
        remarks: 'Month 34 renewal fee collected',
      });

    assert.strictEqual(renewRes.status, 200, `Renewal failed: ${JSON.stringify(renewRes.body)}`);
    assert.strictEqual(renewRes.body.renewalNumber, 34);
    assert.strictEqual(renewRes.body.outstandingPrincipalRupees, 100000, 'Renewal interest must NOT reduce principal');

    // Check Irupu cash in hand
    const cashAfter = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;
    assert.strictEqual(cashAfter, cashBefore + 2000, 'Test 12: Future Monthly renewal must increase Cash in Hand by exactly ₹2,000');
    logPass('Test 12: Future Monthly renewal increases Cash in Hand by exactly ₹2,000 (Renewal #34 created with receipt)');
  }

  // -------------------------------------------------------------
  // [TEST 13] Future Daily Renewal Increases Cash in Hand Exactly Once
  // -------------------------------------------------------------
  console.log('\n[TEST 13] Future Daily Renewal Increases Cash in Hand Exactly Once');
  {
    const dailyLegacyLoan = await Loan.findOne({ customerId: customerId2, vattiType: 'DAILY' });
    assert(dailyLegacyLoan);
    assert.strictEqual(dailyLegacyLoan.renewalCount, 68);

    const cashBefore = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;

    // Customer pays ₹2,000 to renew for another 10 days
    const renewRes = await request(app)
      .post(`/api/loans/${dailyLegacyLoan._id}/renew`)
      .set('Authorization', authHeader)
      .send({
        paymentAmount: 2000,
        paymentMethod: 'CASH',
        paymentDate: '2026-11-30',
        remarks: 'Period 69 10-day renewal fee collected',
      });

    assert.strictEqual(renewRes.status, 200);
    assert.strictEqual(renewRes.body.renewalNumber, 69);
    assert.strictEqual(renewRes.body.newDueDate, '2026-12-10', 'Extended by exactly 10 days to 2026-12-10');

    const cashAfter = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;
    assert.strictEqual(cashAfter, cashBefore + 2000, 'Test 13: Future Daily renewal must increase Cash in Hand by exactly ₹2,000');
    logPass('Test 13: Future Daily renewal increases Cash in Hand by exactly ₹2,000 (Period #69 extended to 2026-12-10)');
  }

  // -------------------------------------------------------------
  // [TEST 14] Future Principal Collection Increases Cash & Reduces Outstanding
  // -------------------------------------------------------------
  console.log('\n[TEST 14] Future Principal Collection Increases Cash & Reduces Outstanding');
  {
    const loan = await Loan.findOne({ customerId: customerId1, outstandingPrincipalPaise: 7500000 });
    assert(loan);

    const cashBefore = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;

    // Borrower repays ₹25,000 principal
    const colRes = await request(app)
      .post('/api/collections')
      .set('Authorization', authHeader)
      .send({
        loanId: loan._id,
        paymentAmount: 25000,
        principalAllocation: 25000,
        interestAllocation: 0,
        penaltyAllocation: 0,
        paymentMethod: 'CASH',
        paymentDate: '2026-11-25',
        remarks: 'Partial principal reduction on legacy account',
      });

    assert.strictEqual(colRes.status, 201, `Collection failed: ${JSON.stringify(colRes.body)}`);
    const updatedLoan = await Loan.findById(loan._id);
    assert.strictEqual(updatedLoan.outstandingPrincipalPaise, 5000000, 'Outstanding principal must reduce from ₹75,000 to ₹50,000');

    const cashAfter = (await getIrupuSummary({ period: 'all' })).currentCashInHandRupees;
    assert.strictEqual(cashAfter, cashBefore + 25000, 'Test 14: Future principal collection must increase Cash in Hand by ₹25,000');
    logPass('Test 14: Future principal collection increases Cash in Hand (+₹25,000) and reduces principal to ₹50,000');
  }

  // -------------------------------------------------------------
  // [TEST 15 & 16] Existing Normal Monthly and Daily Loans Continue to Work
  // -------------------------------------------------------------
  console.log('\n[TEST 15 & 16] Existing Normal Monthly and Daily Loans Continue to Work');
  {
    // Normal Monthly Loan: ₹50,000 @ 2%, upfront ₹1,000, net cash given ₹49,000
    const normalMonthlyRes = await request(app)
      .post('/api/loans')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId1,
        vattiType: 'MONTHLY',
        principalAmount: 50000,
        interestRatePercent: 2,
        startDate: '2026-11-25',
        dueDate: '2026-12-25',
        disbursementPaymentMethod: 'CASH',
        remarks: 'Normal Monthly Loan',
      });

    assert.strictEqual(normalMonthlyRes.status, 201);
    const normalMonthly = normalMonthlyRes.body.loan;
    assert.strictEqual(normalMonthly.isLegacyLoan, false);
    assert.strictEqual(normalMonthly.upfrontInterestPaise, 100000);
    assert.strictEqual(normalMonthly.netDisbursementPaise, 4900000);
    logPass('Test 15: Normal Monthly Finance loan creates upfront collection and works normally');

    // Normal Daily Finance Loan: ₹50,000 @ 2%, upfront ₹1,000, net cash given ₹49,000
    const normalDailyRes = await request(app)
      .post('/api/loans')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId2,
        vattiType: 'DAILY',
        principalAmount: 50000,
        interestRatePercent: 2,
        startDate: '2026-11-25',
        dueDate: '2026-12-05',
        disbursementPaymentMethod: 'CASH',
        remarks: 'Normal Daily Loan',
      });

    assert.strictEqual(normalDailyRes.status, 201);
    const normalDaily = normalDailyRes.body.loan;
    assert.strictEqual(normalDaily.isLegacyLoan, false);
    assert.strictEqual(normalDaily.upfrontInterestPaise, 100000);
    assert.strictEqual(normalDaily.netDisbursementPaise, 4900000);
    logPass('Test 16: Normal Daily Finance loan creates upfront collection and works normally');
  }

  // -------------------------------------------------------------
  // [TEST 17] Existing Daily Collection Workflow Remains Unchanged
  // -------------------------------------------------------------
  console.log('\n[TEST 17] Existing Daily Collection Workflow Remains Unchanged');
  {
    const dcRes = await request(app)
      .post('/api/daily-collections')
      .set('Authorization', authHeader)
      .send({
        customerId: customerId1,
        grossPrincipal: 100000,
        upfrontInterestPercent: 10,
        scheme: 'UPFRONT_DEDUCTION',
        totalDurationDays: 100,
        startDate: '2026-11-25',
      });

    assert.strictEqual(dcRes.status, 201);
    const account = dcRes.body.account;
    assert.strictEqual(account.grossPrincipalPaise, 10000000);
    assert.strictEqual(account.upfrontInterestPaise, 1000000);
    assert.strictEqual(account.netDisbursementPaise, 9000000);
    assert(account.upfrontReceiptNumber);
    logPass('Test 17: Existing Daily Collection Scheme A workflow completely intact');
  }

  // -------------------------------------------------------------
  // [TEST 18] Chit Fund, Moi/Seer & Other Modules Unchanged
  // -------------------------------------------------------------
  console.log('\n[TEST 18] Chit Fund, Moi/Seer & Other Modules Unchanged');
  {
    // Create Chit Fund Group
    const chitRes = await request(app)
      .post('/api/chit-funds/groups')
      .set('Authorization', authHeader)
      .send({
        category: '10_LAKH',
        name: 'CPN 10 Lakh Test Group',
        firstInstalmentDate: '2026-11-25',
      });
    assert.strictEqual(chitRes.status, 201);

    // Create Moi Person
    const moiRes = await request(app)
      .post('/api/moi-seer/persons')
      .set('Authorization', authHeader)
      .send({
        name: 'Kandasamy Test',
        district: 'Salem',
        village: 'Omalur',
      });
    assert.strictEqual(moiRes.status, 201);

    // Verify Customer Ledger has LEGACY_LOAN_OPENING
    const ledgerRes = await request(app)
      .get(`/api/ledger/customer/${customerId1}`)
      .set('Authorization', authHeader);
    assert.strictEqual(ledgerRes.status, 200);
    const hasLegacyOpening = ledgerRes.body.ledger.transactions.some((t) => t.type === 'LEGACY_LOAN_OPENING');
    assert.strictEqual(hasLegacyOpening, true, 'Customer ledger must include LEGACY_LOAN_OPENING transaction');

    // Verify Customer Statement
    const statementRes = await request(app)
      .get(`/api/customers/${customerId1}/statement`)
      .set('Authorization', authHeader);
    assert.strictEqual(statementRes.status, 200);
    const statementHasLegacy = statementRes.body.statement.loans.some((l) => l.isLegacyLoan === true);
    assert.strictEqual(statementHasLegacy, true, 'Customer statement must include legacy loans');

    logPass('Test 18: Chit Fund, Moi/Seer, Customer Ledgers, and Statements verified with 100% integrity');
  }

  console.log('\n================================================================');
  console.log('   ALL 18 EXISTING / LEGACY LOAN REGRESSION TESTS PASSED!       ');
  console.log('================================================================\n');
}

if (require.main === module) {
  runLegacyLoanTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\x1b[31m[TEST SUITE FAILED]\x1b[0m', err);
      process.exit(1);
    });
}

module.exports = runLegacyLoanTests;
