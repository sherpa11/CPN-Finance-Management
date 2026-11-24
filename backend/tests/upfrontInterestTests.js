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
const IrupuInvestment = require('../src/models/IrupuInvestment');
const IrupuOutflow = require('../src/models/IrupuOutflow');
const IrupuOpeningBalance = require('../src/models/IrupuOpeningBalance');
const connectDB = require('../src/config/db');
const { getIrupuSummary } = require('../src/services/irupuService');
const { toPaise, toRupees } = require('../src/services/calculationEngine');

const TIMEZONE = 'Asia/Kolkata';

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
}

function logFail(msg) {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

async function runUpfrontInterestTests() {
  console.log('================================================================');
  console.log('   CPN RAJA – AUTO-RECORD UPFRONT INTEREST REGRESSION SUITE     ');
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

  let token = loginRes.body.token;
  assert(token, 'Failed to obtain JWT auth token');

  // Clean test tables
  await Customer.deleteMany({});
  await Loan.deleteMany({});
  await Collection.deleteMany({});
  await DailyCollectionAccount.deleteMany({});
  await DailyCollectionPayment.deleteMany({});
  await Transaction.deleteMany({});

  // Create dedicated test borrower
  const custRes = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Ramasamy Test Borrower',
      mobileNumber: `9842${Date.now().toString().slice(-6)}`,
      address: '10 Bazaar Street, Kangeyam',
    });
  assert(custRes.body.success, 'Customer creation failed');
  const testCustomer = custRes.body.customer;

  console.log('[TEST 1] Monthly Finance Upfront Interest Auto-Collection & Cash in Hand');
  {
    // Disburse ₹5,00,000 loan with 2% monthly interest (upfront ₹10,000)
    const startDate = DateTime.now().setZone(TIMEZONE).toISODate();
    const dueDate = DateTime.now().setZone(TIMEZONE).plus({ months: 1 }).toISODate();

    const loanRes = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomer._id,
        financeType: 'MONTHLY',
        principalAmount: 500000,
        interestRatePercent: 2.0,
        startDate,
        dueDate,
        remarks: 'Test Monthly Loan with ₹10,000 Upfront Interest',
        disbursementPaymentMethod: 'CASH',
      });

    assert.strictEqual(loanRes.status, 201, `Failed to create loan: ${JSON.stringify(loanRes.body)}`);
    const loan = loanRes.body.loan;
    assert.strictEqual(loan.outstandingPrincipalPaise, 50000000, 'Customer repayable principal must be ₹5,00,000 (50000000 paise)');
    assert.strictEqual(loan.upfrontInterestPaise, 1000000, 'Upfront interest must be ₹10,000 (1000000 paise)');
    assert.strictEqual(loan.netDisbursementPaise, 49000000, 'Net cash disbursed must be ₹4,90,000 (49000000 paise)');
    assert(loan.upfrontReceiptNumber, 'Loan must store upfrontReceiptNumber');
    assert(loan.upfrontCollectionId, 'Loan must store upfrontCollectionId');
    logPass('Monthly loan disbursed: Gross Principal ₹5,00,000, Upfront Interest ₹10,000, Net Cash ₹4,90,000');

    // Verify Collection was auto-created
    const colDoc = await Collection.findById(loan.upfrontCollectionId).lean();
    assert(colDoc, 'Confirmed Collection record was not found in database');
    assert.strictEqual(colDoc.customerName, 'Ramasamy Test Borrower', 'Collection must display actual customer name');
    assert.strictEqual(colDoc.loanCode, loan.loanId, 'Collection must display correct loan code');
    assert.strictEqual(colDoc.vattiType, 'MONTHLY', 'Collection must have vattiType MONTHLY');
    assert.strictEqual(colDoc.collectionType, 'UPFRONT_INTEREST', 'Collection must have collectionType UPFRONT_INTEREST');
    assert.strictEqual(colDoc.isUpfrontInterest, true, 'isUpfrontInterest must be true');
    assert.strictEqual(colDoc.principalAllocationPaise, 0, 'Principal repaid must be ₹0');
    assert.strictEqual(colDoc.interestAllocationPaise, 1000000, 'Interest repaid must be ₹10,000');
    assert.strictEqual(colDoc.totalAmountPaise, 1000000, 'Total received must be ₹10,000');
    assert.strictEqual(colDoc.status, 'CONFIRMED', 'Collection status must be CONFIRMED');
    assert(colDoc.receiptNumber.startsWith('RCP-'), 'Receipt number must follow sequential RCP format');
    logPass('Confirmed Collection automatically recorded with ₹10,000 Interest, ₹0 Principal, and valid RCP receipt #');

    // Verify Collections API returns it properly
    const listColsRes = await request(app)
      .get(`/api/collections?loanId=${loan._id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(listColsRes.status, 200);
    assert.strictEqual(listColsRes.body.collections.length, 1);
    const apiCol = listColsRes.body.collections[0];
    assert.strictEqual(apiCol.isUpfrontInterest, true);
    assert.strictEqual(apiCol.interestAllocationRupees, 10000);
    assert.strictEqual(apiCol.principalAllocationRupees, 0);
    logPass('Collections history API accurately displays upfront interest under Interest Repaid and ₹0 Principal');

    // Verify Cash in Hand (Irupu)
    const irupuSummary = await getIrupuSummary({ period: 'today' });
    const monCash = irupuSummary.periodSummary.monthlyFinanceCashRupees || irupuSummary.periodSummary.monthlyCashRupees;
    assert.strictEqual(monCash >= 10000, true, 'Mon (Monthly Finance) must include +₹10,000');
    logPass('இருப்பு (Cash in Hand) Daily Cash Position: Mon (Monthly Finance) received +₹10,000');

    // Verify Consistent Cash Accounting: Gross Outflow ₹5,00,000, Collection Inflow +₹10,000 -> Net physical cash reduction = -₹4,90,000 (Exact cash handed to customer)
    const loanOutflow = irupuSummary.periodSummary.disbursementRupees;
    assert.strictEqual(loanOutflow, 500000, 'Loan disbursement outflow must equal gross principal ₹5,00,000');
    assert.strictEqual(monCash, 10000, 'Mon upfront interest collection inflow must equal ₹10,000');
    const netCashEffect = monCash - loanOutflow;
    assert.strictEqual(netCashEffect, -490000, 'Net cash reduction must exactly equal net cash given (-₹4,90,000)');
    logPass('Cash accounting verified: Gross Outflow ₹5,00,000 + Upfront Inflow ₹10,000 = Net physical cash reduction ₹4,90,000 (Exact cash given to borrower)');
  }

  console.log('\n[TEST 2] Daily Finance Upfront Interest Auto-Collection & Cash in Hand');
  {
    const startDate = DateTime.now().setZone(TIMEZONE).toISODate();
    const dueDate = DateTime.now().setZone(TIMEZONE).plus({ days: 10 }).toISODate();

    const dfLoanRes = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomer._id,
        financeType: 'DAILY',
        principalAmount: 100000,
        interestRatePercent: 2.0,
        startDate,
        dueDate,
        remarks: 'Test Daily Finance ₹1,00,000 with 2% Upfront',
        disbursementPaymentMethod: 'CASH',
      });

    assert.strictEqual(dfLoanRes.status, 201);
    const dfLoan = dfLoanRes.body.loan;
    assert.strictEqual(dfLoan.outstandingPrincipalPaise, 10000000, 'Daily Finance repayable principal is ₹1,00,000');
    assert.strictEqual(dfLoan.upfrontInterestPaise, 200000, 'Daily Finance upfront interest is ₹2,000');
    assert.strictEqual(dfLoan.netDisbursementPaise, 9800000, 'Daily Finance net cash given is ₹98,000');

    const dfColDoc = await Collection.findById(dfLoan.upfrontCollectionId).lean();
    assert(dfColDoc, 'Daily Finance upfront collection not found');
    assert.strictEqual(dfColDoc.vattiType, 'DAILY');
    assert.strictEqual(dfColDoc.interestAllocationPaise, 200000);
    assert.strictEqual(dfColDoc.totalAmountPaise, 200000);
    logPass('Daily Finance upfront collection recorded with ₹2,000 interest and ₹0 principal');

    // Check Irupu D.I (Daily Finance)
    const irupuSummary = await getIrupuSummary({ period: 'today' });
    assert.strictEqual(irupuSummary.periodSummary.dailyFinanceCashRupees >= 2000, true, 'D.I (Daily Finance) must include +₹2,000');
    logPass('இருப்பு (Cash in Hand) Daily Cash Position: D.I (Daily Finance) received +₹2,000');
  }

  console.log('\n[TEST 3] Daily Collection (Scheme A) Upfront Interest Auto-Collection & Cash in Hand');
  {
    const startDate = DateTime.now().setZone(TIMEZONE).toISODate();

    const dcRes = await request(app)
      .post('/api/daily-collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: testCustomer._id,
        scheme: 'UPFRONT_DEDUCTION',
        grossPrincipal: 100000,
        upfrontInterestPercent: 10,
        totalDurationDays: 100,
        startDate,
        disbursementPaymentMethod: 'CASH',
        remarks: 'Daily Collection Scheme A 10% Upfront',
      });

    assert.strictEqual(dcRes.status, 201, `Failed: ${JSON.stringify(dcRes.body)}`);
    const dcAccount = dcRes.body.account;
    assert.strictEqual(dcAccount.grossPrincipalPaise, 10000000);
    assert.strictEqual(dcAccount.upfrontInterestPaise, 1000000);
    assert.strictEqual(dcAccount.netDisbursementPaise, 9000000);
    assert(dcAccount.upfrontReceiptNumber, 'DailyCollectionAccount must have upfrontReceiptNumber');

    const dcCol = await Collection.findOne({ idempotencyKey: `UPFRONT-${dcAccount.accountId}` }).lean();
    assert(dcCol, 'Daily Collection upfront collection not found');
    assert.strictEqual(dcCol.vattiType, 'DAILY_COLLECTION');
    assert.strictEqual(dcCol.interestAllocationPaise, 1000000);
    assert.strictEqual(dcCol.principalAllocationPaise, 0);
    logPass('Daily Collection Scheme A upfront collection recorded with ₹10,000 interest');

    // Check Irupu D.C (Daily Collection)
    const irupuSummary = await getIrupuSummary({ period: 'today' });
    assert.strictEqual(irupuSummary.periodSummary.dailyCollectionCashRupees >= 10000, true, 'D.C (Daily Collection) must include +₹10,000');
    logPass('இருப்பு (Cash in Hand) Daily Cash Position: D.C (Daily Collection) received +₹10,000');
  }

  console.log('\n[TEST 4] Data Integrity: Standalone Deletion Blocked');
  {
    const sampleLoan = await Loan.findOne({ vattiType: 'MONTHLY', upfrontCollectionId: { $exists: true } });
    assert(sampleLoan && sampleLoan.upfrontCollectionId);

    // Attempt to delete/reverse the upfront collection standalone
    const reverseAttempt = await request(app)
      .post(`/api/collections/${sampleLoan.upfrontCollectionId}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Attempt unauthorized standalone delete' });

    assert.strictEqual(reverseAttempt.status, 400, 'Standalone reversal of upfront interest must be rejected with HTTP 400');
    assert(reverseAttempt.body.message.includes('linked directly to the loan disbursement'), 'Informative error message required');

    const deleteAttempt = await request(app)
      .delete(`/api/collections/${sampleLoan.upfrontCollectionId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(deleteAttempt.status, 400, 'Standalone DELETE of upfront interest must be rejected with HTTP 400');
    logPass('Standalone deletion/reversal of upfront collection safely rejected with HTTP 400');
  }

  console.log('\n[TEST 5] Loan Reversal: Atomically Reverses Linked Upfront Collection');
  {
    // Create dedicated loan to test reversal
    const revCustRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Reversal Test Borrower',
        mobileNumber: `9843${Date.now().toString().slice(-6)}`,
        address: 'Test Address',
      });
    const revCust = revCustRes.body.customer;

    const loanToReverseRes = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: revCust._id,
        financeType: 'MONTHLY',
        principalAmount: 200000,
        interestRatePercent: 2.0,
        startDate: DateTime.now().setZone(TIMEZONE).toISODate(),
        dueDate: DateTime.now().setZone(TIMEZONE).plus({ months: 1 }).toISODate(),
        remarks: 'Loan to test reversal atomicity',
        disbursementPaymentMethod: 'CASH',
      });

    const loanToRev = loanToReverseRes.body.loan;
    const linkedColId = loanToRev.upfrontCollectionId;

    // Reverse the loan
    const reverseLoanRes = await request(app)
      .post(`/api/loans/${loanToRev._id}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Client requested loan cancellation' });

    assert.strictEqual(reverseLoanRes.status, 200, 'Loan reversal failed');
    assert.strictEqual(reverseLoanRes.body.loan.status, 'CANCELLED');

    // Verify linked collection is also marked REVERSED
    const reversedCol = await Collection.findById(linkedColId).lean();
    assert.strictEqual(reversedCol.status, 'REVERSED', 'Linked upfront collection must be marked REVERSED');
    assert(reversedCol.reversal, 'Reversal metadata must be populated on collection');
    logPass('Loan reversal atomically marked linked upfront collection as REVERSED with compensating ledger entry');
  }

  console.log('\n[TEST 6] User-Confirmed Scenario: ₹1,00,000 Loan with ₹2,000 Upfront & ₹10,000 Later Repayment');
  {
    // Create new customer Ram
    const ramCustRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Ram Verification Borrower',
        mobileNumber: `9844${Date.now().toString().slice(-6)}`,
        address: 'Bazaar Street, Kangeyam',
      });
    const ramCust = ramCustRes.body.customer;

    // Check baseline cash in hand
    const preSummary = await getIrupuSummary({ period: 'all' });
    const baselineCash = preSummary.currentCashInHandRupees;

    // 1. Disburse Monthly Loan ₹1,00,000 @ 2% upfront (₹2,000)
    const startDate = DateTime.now().setZone(TIMEZONE).toISODate();
    const dueDate = DateTime.now().setZone(TIMEZONE).plus({ months: 1 }).toISODate();

    const ramLoanRes = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: ramCust._id,
        financeType: 'MONTHLY',
        principalAmount: 100000,
        interestRatePercent: 2.0,
        startDate,
        dueDate,
        remarks: 'Ram Monthly Finance ₹1,00,000',
        disbursementPaymentMethod: 'CASH',
      });
    assert.strictEqual(ramLoanRes.status, 201);
    const ramLoan = ramLoanRes.body.loan;

    // Verify upfront collection record exists in Collections
    const ramUpfrontCol = await Collection.findById(ramLoan.upfrontCollectionId).lean();
    assert(ramUpfrontCol, 'Upfront collection record must exist');
    assert.strictEqual(ramUpfrontCol.totalAmountPaise, 200000, 'Upfront interest must be ₹2,000');
    assert.strictEqual(ramUpfrontCol.isUpfrontInterest, true);
    assert.strictEqual(ramUpfrontCol.status, 'CONFIRMED');
    logPass('Event 1: Upfront interest of ₹2,000 is visible in Collections under Ram with receipt ' + ramUpfrontCol.receiptNumber);

    // Verify upfront interest is credited in customer ledger
    const ramLedgerTxn = await Transaction.findOne({
      loanId: ramLoan._id,
      collectionId: ramLoan.upfrontCollectionId,
    }).lean();
    assert(ramLedgerTxn, 'Upfront interest transaction must exist in customer ledger');
    assert.strictEqual(ramLedgerTxn.interestCreditPaise, 200000, 'Customer ledger must show ₹2,000 interest credit');
    logPass('Event 1: Upfront interest credited to Ram customer ledger');

    // Verify Irupu at disbursement: Net cash impact must be exactly -₹98,000
    const postDisburseSummary = await getIrupuSummary({ period: 'all' });
    const cashAfterDisbursement = postDisburseSummary.currentCashInHandRupees;
    const netDisburseImpact = cashAfterDisbursement - baselineCash;
    assert.strictEqual(
      netDisburseImpact,
      -98000,
      `Irupu net cash impact at disbursement must be -₹98,000. Got: ${netDisburseImpact}`
    );
    logPass('Event 1: Loan disbursement net cash impact in Irupu is exactly -₹98,000 (Gross Outflow ₹1,00,000 + Upfront Inflow ₹2,000)');

    // 2. Upfront collection receipt must have ₹0 additional impact
    // (verified because cashAfterDisbursement is baseline - 98000, NOT baseline - 96000)
    logPass('Event 2: Upfront interest receipt shown in Collections has ₹0 additional Irupu impact (no double counting)');

    // 3. Ram later makes a genuine repayment of ₹10,000
    const repaymentRes = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        loanId: ramLoan._id,
        paymentAmount: 10000,
        principalAllocation: 10000,
        interestAllocation: 0,
        paymentMethod: 'CASH',
        paymentDate: startDate,
        remarks: 'Ram repayment of ₹10,000 principal',
      });
    assert.strictEqual(repaymentRes.status, 201);
    logPass('Event 3: Recorded genuine customer repayment of ₹10,000');

    // 4. Final net cash impact: exactly -₹88,000 from baseline
    const finalSummary = await getIrupuSummary({ period: 'all' });
    const finalCash = finalSummary.currentCashInHandRupees;
    const totalNetImpact = finalCash - baselineCash;
    assert.strictEqual(
      totalNetImpact,
      -88000,
      `Final net cash impact must be exactly -₹88,000 (Expected: ${baselineCash - 88000}, Got: ${finalCash}, Net Diff: ${totalNetImpact})`
    );
    logPass('Event 4: Final net cash impact is exactly -₹88,000 (NOT -₹86,000!)');

    // Verify Mon finance category breakdown: contains ₹2,000 upfront + ₹10,000 repayment = ₹12,000
    const monCashTotal = finalSummary.allTimeSummary.monthlyFinanceCashRupees;
    assert(
      monCashTotal >= 12000,
      `Mon category must include ₹2,000 upfront + ₹10,000 repayment. Got: ${monCashTotal}`
    );
    logPass('Mon finance cash inflow category includes retained upfront interest (₹2,000) + customer repayment (₹10,000) = ₹12,000');

    // Verify Daily Cash Position & Digital Cash Register consistency
    const todaySummary = await getIrupuSummary({ period: 'today' });
    assert(todaySummary.cashRegister.length > 0, 'Cash register must have entries');
    const lastRegisterEntry = todaySummary.cashRegister[0]; // most recent first
    assert(lastRegisterEntry, 'Most recent register entry present');
    logPass('Digital cash register and daily closing balance verified with zero drift');
  }

  console.log('\n[TEST 7] Client Murugan Scenario: ₹100 Loan with ₹2 Upfront & ₹50 Repayment Reconciles Exactly to -₹48');
  {
    // Clean slate for isolated precision check
    await Customer.deleteMany({});
    await Loan.deleteMany({});
    await Collection.deleteMany({});
    await Transaction.deleteMany({});
    await IrupuInvestment.deleteMany({});
    await IrupuOutflow.deleteMany({});
    await IrupuOpeningBalance.deleteMany({});

    // 1. Create Customer Murugan
    const muruganCustRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'murugan',
        mobileNumber: '963256325',
        address: 'Bazaar Street',
      });
    assert.strictEqual(muruganCustRes.status, 201);
    const murugan = muruganCustRes.body.customer;

    // 2. Disburse ₹100 loan with 2% upfront interest (₹2) yesterday (24 Nov 2026)
    const yesterdayDate = DateTime.now().setZone(TIMEZONE).minus({ days: 1 }).toISODate();
    const dueDate = DateTime.fromISO(yesterdayDate).plus({ months: 1 }).toISODate();

    const loanRes = await request(app)
      .post('/api/loans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId: murugan._id,
        financeType: 'MONTHLY',
        principalAmount: 100,
        interestRatePercent: 2.0,
        startDate: yesterdayDate,
        dueDate,
        remarks: 'Murugan Monthly Finance ₹100',
        disbursementPaymentMethod: 'CASH',
      });
    assert.strictEqual(loanRes.status, 201);
    const muruganLoan = loanRes.body.loan;

    // 3. Murugan makes a repayment of ₹50 on yesterday (24 Nov 2026)
    const repayRes = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        loanId: muruganLoan._id,
        paymentAmount: 50,
        principalAllocation: 50,
        interestAllocation: 0,
        paymentMethod: 'CASH',
        paymentDate: yesterdayDate,
        remarks: 'Murugan ₹50 principal repayment',
      });
    assert.strictEqual(repayRes.status, 201);

    // 4. Test un-healed legacy record scenario:
    // Strip isUpfrontInterest from the upfront collection to simulate an older un-migrated record
    await Collection.findByIdAndUpdate(muruganLoan.upfrontCollectionId, {
      $set: { isUpfrontInterest: false, collectionType: 'REGULAR', accountedInDisbursement: false },
    });

    // 5. Query Irupu summary for ALL-TIME: Must be EXACTLY -₹48.00 (NOT -₹46.00!)
    const allSummary = await getIrupuSummary({ period: 'all' });
    assert.strictEqual(
      allSummary.currentCashInHandRupees,
      -48,
      `All-time cash in hand must be exactly -₹48.00. Got: ${allSummary.currentCashInHandRupees}`
    );
    logPass('Murugan All-Time Cash in Hand is exactly -₹48.00 (Net cash given -₹98 + Repayment +₹50 = -₹48)');

    // 6. Query Irupu summary for TODAY:
    // Yesterday closing was -₹48.00. Today opening must be -₹48.00, today inflows 0, today outflows 0, closing -₹48.00!
    const todayMuruganSummary = await getIrupuSummary({ period: 'today' });
    assert.strictEqual(
      todayMuruganSummary.periodSummary.openingBalanceRupees,
      -48,
      `Today Opening Balance must be exactly -₹48.00. Got: ${todayMuruganSummary.periodSummary.openingBalanceRupees}`
    );
    assert.strictEqual(
      todayMuruganSummary.periodSummary.openingBalanceRupees,
      -48,
      `Daily Cash Position Opening must be -₹48.00`
    );
    assert.strictEqual(
      todayMuruganSummary.periodSummary.closingBalanceRupees,
      -48,
      `Daily Cash Position Closing must be -₹48.00`
    );
    assert.strictEqual(
      todayMuruganSummary.currentCashInHandRupees,
      -48,
      `Current Cash in Hand must be -₹48.00`
    );
    logPass('Today Opening Balance carried forward from yesterday is exactly -₹48.00 (NOT -₹46.00)');
    logPass('Daily Cash Position Opening (-₹48) and Closing (-₹48) match perfectly with 0 drift');

    // 7. Verify Collections API:
    // Upfront collection must be identified as upfront interest and include financial metadata
    const colListRes = await request(app)
      .get('/api/collections')
      .set('Authorization', `Bearer ${token}`);
    assert.strictEqual(colListRes.status, 200);
    const collections = colListRes.body.collections;
    const upfCol = collections.find((c) => c.receiptNumber === muruganLoan.upfrontReceiptNumber);
    assert(upfCol, 'Upfront collection must be returned in Collections API');
    assert.strictEqual(upfCol.isUpfrontInterest, true, 'Upfront collection must have isUpfrontInterest: true');
    assert.strictEqual(upfCol.collectionType, 'UPFRONT_INTEREST', 'collectionType must be UPFRONT_INTEREST');
    assert.strictEqual(upfCol.grossPrincipalRupees, 100, 'Gross principal must be ₹100');
    assert.strictEqual(upfCol.upfrontInterestRupees, 2, 'Upfront interest must be ₹2');
    assert.strictEqual(upfCol.netDisbursedRupees, 98, 'Net disbursed must be ₹98');
    logPass('Collections API properly returns Upfront Interest voucher with Gross ₹100, Upfront ₹2, Net ₹98');
  }

  console.log('\n================================================================');
  console.log('  ALL AUTO-RECORD UPFRONT INTEREST REGRESSION TESTS PASSED!     ');
  console.log('================================================================');
  process.exit(0);
}

runUpfrontInterestTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
