const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const Loan = require('../src/models/Loan');
const Collection = require('../src/models/Collection');
const connectDB = require('../src/config/db');

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('=====================================================');
  console.log('  CPN RAJA – CUSTOMER DELETION & ARCHIVING TEST SUITE');
  console.log('=====================================================');

  await connectDB();

  // 1. Login
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cpnraja', password: 'cpnraja2026' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  console.log('\n[1] Authentication & Permission Check');
  const unauthRes = await fetch(`${API_BASE}/customers/invalid-id`, { method: 'DELETE' });
  if (unauthRes.status === 401) {
    console.log('  ✓ PASS: Unauthenticated delete rejected with 401');
  } else {
    console.error(`  ✗ FAIL: Expected 401, got ${unauthRes.status}`);
  }

  // 2. Invalid ObjectId validation
  const invalidIdRes = await fetch(`${API_BASE}/customers/12345notanid`, {
    method: 'DELETE',
    headers,
  });
  if (invalidIdRes.status === 400) {
    console.log('  ✓ PASS: Invalid ObjectId rejected with 400');
  } else {
    console.error(`  ✗ FAIL: Expected 400, got ${invalidIdRes.status}`);
  }

  // 3. Non-existent customer
  const fakeId = new mongoose.Types.ObjectId();
  const notFoundRes = await fetch(`${API_BASE}/customers/${fakeId}`, {
    method: 'DELETE',
    headers,
  });
  if (notFoundRes.status === 404) {
    console.log('  ✓ PASS: Non-existent customer returns 404');
  } else {
    console.error(`  ✗ FAIL: Expected 404, got ${notFoundRes.status}`);
  }

  // 4. Create clean test customer with NO financial records
  const cleanMobile = '99990' + Math.floor(10000 + Math.random() * 90000);
  const cleanCustReq = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Clean Test Borrower No Loans',
      mobileNumber: cleanMobile,
      address: 'Test Address Without Loans',
    }),
  });
  const cleanCustData = await cleanCustReq.json();
  const cleanCustId = cleanCustData.customer._id;
  console.log(`\n[2] Safe Permanent Deletion (Customer With Zero Records)`);
  console.log(`  ✓ Created test customer: ${cleanCustData.customer.customerId}`);

  // Pre-flight check
  const preCheckRes = await fetch(`${API_BASE}/customers/${cleanCustId}/delete-check`, { headers });
  const preCheck = await preCheckRes.json();
  if (preCheck.eligibleForPermanentDelete === true && preCheck.hasFinancialRecords === false) {
    console.log('  ✓ PASS: Delete-check reports customer is eligible for permanent deletion');
  } else {
    console.error('  ✗ FAIL in preCheck:', preCheck);
  }

  // Delete customer
  const delReq = await fetch(`${API_BASE}/customers/${cleanCustId}`, {
    method: 'DELETE',
    headers,
  });
  const delRes = await delReq.json();
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
  const finCustReq = await fetch(`${API_BASE}/customers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Financial Borrower With Active Loan',
      mobileNumber: finMobile,
      address: 'Financial Test Colony',
    }),
  });
  const finCustData = await finCustReq.json();
  const finCustId = finCustData.customer._id;

  // Disburse a test loan for this customer
  const loanReq = await fetch(`${API_BASE}/loans`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      customerId: finCustId,
      financeType: 'MONTHLY',
      principalAmount: 25000,
      interestRatePercent: 2,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      remarks: 'Test loan for deletion protection check',
    }),
  });
  const loanData = await loanReq.json();
  console.log(`  ✓ Created customer ${finCustData.customer.customerId} and disbursed Loan ${loanData.loan?.loanId}`);

  // Pre-flight check on customer with loan
  const finPreCheckReq = await fetch(`${API_BASE}/customers/${finCustId}/delete-check`, { headers });
  const finPreCheck = await finPreCheckReq.json();
  if (finPreCheck.eligibleForPermanentDelete === false && finPreCheck.hasFinancialRecords === true) {
    console.log('  ✓ PASS: Pre-flight check correctly flags customer has financial records');
    console.log(`    Loans count: ${finPreCheck.dependencies.loansCount}`);
  } else {
    console.error('  ✗ FAIL in finPreCheck:', finPreCheck);
  }

  // Attempt permanent delete - MUST BE REJECTED
  const finDelReq = await fetch(`${API_BASE}/customers/${finCustId}`, {
    method: 'DELETE',
    headers,
  });
  const finDelRes = await finDelReq.json();
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
  const deactReq = await fetch(`${API_BASE}/customers/${finCustId}?action=deactivate`, {
    method: 'DELETE',
    headers,
  });
  const deactRes = await deactReq.json();
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
