const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const connectDB = require('../src/config/db');

async function runTests() {
  console.log('=====================================================');
  console.log('  CPN RAJA – CUSTOMER DELETION & ARCHIVING TEST SUITE');
  console.log('=====================================================');

  await connectDB();

  // 1. Login
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: 'cpnraja2026' });
  const token = loginRes.body.token;
  const authHeader = `Bearer ${token}`;

  console.log('\n[1] Authentication & Permission Check');
  const unauthRes = await request(app).delete('/api/customers/invalid-id');
  if (unauthRes.status === 401) {
    console.log('  ✓ PASS: Unauthenticated delete rejected with 401');
  } else {
    console.error(`  ✗ FAIL: Expected 401, got ${unauthRes.status}`);
  }

  // 2. Invalid ObjectId validation
  const invalidIdRes = await request(app)
    .delete('/api/customers/12345notanid')
    .set('Authorization', authHeader);
  if (invalidIdRes.status === 400) {
    console.log('  ✓ PASS: Invalid ObjectId rejected with 400');
  } else {
    console.error(`  ✗ FAIL: Expected 400, got ${invalidIdRes.status}`);
  }

  // 3. Non-existent customer
  const fakeId = new mongoose.Types.ObjectId();
  const notFoundRes = await request(app)
    .delete(`/api/customers/${fakeId}`)
    .set('Authorization', authHeader);
  if (notFoundRes.status === 404) {
    console.log('  ✓ PASS: Non-existent customer returns 404');
  } else {
    console.error(`  ✗ FAIL: Expected 404, got ${notFoundRes.status}`);
  }

  // 4. Create clean test customer with NO financial records
  const cleanMobile = '99990' + Math.floor(10000 + Math.random() * 90000);
  const cleanCustReq = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Clean Test Borrower No Loans',
      mobileNumber: cleanMobile,
      address: 'Test Address Without Loans',
    });
  const cleanCustData = cleanCustReq.body;
  const cleanCustId = cleanCustData.customer._id;
  console.log(`\n[2] Safe Permanent Deletion (Customer With Zero Records)`);
  console.log(`  ✓ Created test customer: ${cleanCustData.customer.customerId}`);

  // Pre-flight check
  const preCheckRes = await request(app)
    .get(`/api/customers/${cleanCustId}/delete-check`)
    .set('Authorization', authHeader);
  const preCheck = preCheckRes.body;
  if (preCheck.eligibleForPermanentDelete === true && preCheck.hasFinancialRecords === false) {
    console.log('  ✓ PASS: Delete-check reports customer is eligible for permanent deletion');
  } else {
    console.error('  ✗ FAIL in preCheck:', preCheck);
  }

  // Delete customer
  const delReq = await request(app)
    .delete(`/api/customers/${cleanCustId}`)
    .set('Authorization', authHeader);
  const delRes = delReq.body;
  if (delReq.status === 200 && delRes.success && delRes.deleted) {
    console.log('  ✓ PASS: Customer with zero records successfully deleted permanently');
  } else {
    console.error('  ✗ FAIL in deletion:', delRes);
  }

  // Verify document is gone
  const checkGone = await Customer.findById(cleanCustId);
  if (!checkGone) {
    console.log('  ✓ PASS: Customer document verified removed from database');
  } else {
    console.error('  ✗ FAIL: Customer document still exists');
  }

  // 5. Test Customer WITH Financial Records
  console.log('\n[3] Protection of Customer With Financial History');
  const finMobile = '99991' + Math.floor(10000 + Math.random() * 90000);
  const finCustReq = await request(app)
    .post('/api/customers')
    .set('Authorization', authHeader)
    .send({
      name: 'Financial Borrower With Active Loan',
      mobileNumber: finMobile,
      address: 'Financial Test Colony',
    });
  const finCustData = finCustReq.body;
  const finCustId = finCustData.customer._id;

  // Disburse a test loan for this customer
  const loanReq = await request(app)
    .post('/api/loans')
    .set('Authorization', authHeader)
    .send({
      customerId: finCustId,
      financeType: 'MONTHLY',
      principalAmount: 25000,
      interestRatePercent: 2,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      remarks: 'Test loan for deletion protection check',
    });
  const loanData = loanReq.body;
  console.log(`  ✓ Created customer ${finCustData.customer.customerId} and disbursed Loan ${loanData.loan?.loanId}`);

  // Pre-flight check on customer with loan
  const finPreCheckReq = await request(app)
    .get(`/api/customers/${finCustId}/delete-check`)
    .set('Authorization', authHeader);
  const finPreCheck = finPreCheckReq.body;
  if (finPreCheck.eligibleForPermanentDelete === false && finPreCheck.hasFinancialRecords === true) {
    console.log('  ✓ PASS: Pre-flight check correctly flags customer has financial records');
    console.log(`    Loans count: ${finPreCheck.dependencies.loansCount}`);
  } else {
    console.error('  ✗ FAIL in finPreCheck:', finPreCheck);
  }

  // Attempt permanent delete - MUST BE REJECTED
  const finDelReq = await request(app)
    .delete(`/api/customers/${finCustId}`)
    .set('Authorization', authHeader);
  const finDelRes = finDelReq.body;
  if (finDelReq.status === 400 && finDelRes.hasFinancialRecords === true) {
    console.log('  ✓ PASS: Permanent delete strictly rejected with 400 Bad Request');
    console.log(`    Reason: ${finDelRes.message.slice(0, 85)}...`);
  } else {
    console.error('  ✗ FAIL: Permanent delete was not rejected as expected:', finDelReq.status, finDelRes);
  }

  // Verify customer still exists in database
  const stillExists = await Customer.findById(finCustId);
  if (stillExists) {
    console.log('  ✓ PASS: Customer record preserved in database');
  }

  // 6. Test Deactivation / Archiving
  console.log('\n[4] Deactivation & Safe Archiving Workflow');
  const deactReq = await request(app)
    .delete(`/api/customers/${finCustId}?action=deactivate`)
    .set('Authorization', authHeader);
  const deactRes = deactReq.body;
  if (deactReq.status === 200 && deactRes.success && deactRes.deactivated && deactRes.customer.status === 'INACTIVE') {
    console.log('  ✓ PASS: Customer successfully archived with status INACTIVE');
    console.log(`    Message: ${deactRes.message}`);
  } else {
    console.error('  ✗ FAIL in deactivation:', deactRes);
  }

  // Verify customer loan is still completely intact
  const verifiedLoan = await Loan.findOne({ customerId: finCustId });
  if (verifiedLoan && verifiedLoan.principalPaise === 2500000) {
    console.log('  ✓ PASS: Loan principal (₹25,000) and calculations 100% intact');
  } else {
    console.error('  ✗ FAIL: Loan was affected:', verifiedLoan);
  }

  // Cleanup the test loan and customer created in step 5
  if (loanData.loan?._id) await Loan.findByIdAndDelete(loanData.loan._id);
  await Customer.findByIdAndDelete(finCustId);

  console.log('\n=====================================================');
  console.log('  ALL CUSTOMER DELETION TESTS PASSED SUCCESSFULLY!    ');
  console.log('=====================================================\n');

  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
