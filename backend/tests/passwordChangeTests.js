/**
 * CPN RAJA – ADMIN PASSWORD CHANGE AUTOMATED TEST SUITE
 * 
 * Tests:
 * 1. Admin login with default credentials
 * 2. Unauthenticated password change rejection (401)
 * 3. Validation: missing current/new password rejection (400)
 * 4. Validation: new password < 6 characters rejection (400)
 * 5. Security: incorrect current password rejection (400)
 * 6. Successful password change (200)
 * 7. Verification: Old password login is rejected (401)
 * 8. Verification: New password login succeeds (200)
 * 9. Audit trail: CHANGE_PASSWORD event recorded
 * 10. Clean recovery: Restore original password (200)
 */

process.env.NODE_ENV = 'test';
require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

function logPass(msg) {
  console.log(`  ✓ PASS: ${msg}`);
}

function logFail(msg, err) {
  console.error(`  ✗ FAIL: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

async function runPasswordTests() {
  console.log('\n=====================================================');
  console.log('   CPN RAJA – ADMIN PASSWORD CHANGE TEST SUITE');
  console.log('=====================================================\n');

  try {
    await connectDB();

    // Ensure admin user exists with known password
    let admin = await User.findOne({ username: 'cpnraja' });
    if (!admin) {
      admin = new User({
        username: 'cpnraja',
        email: 'admin@cpnraja.com',
        fullName: 'CPN Raja',
        passwordHash: 'cpnraja2026',
        role: 'admin',
      });
      await admin.save();
    } else {
      admin.passwordHash = 'cpnraja2026';
      await admin.save();
    }

    // 1. Login with initial password
    console.log('[1] Initial Admin Authentication');
    const loginRes1 = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cpnraja', password: 'cpnraja2026' });

    if (loginRes1.status !== 200 || !loginRes1.body.token) {
      logFail('Admin login failed with status ' + loginRes1.status);
    }
    const token = loginRes1.body.token;
    logPass('Initial login succeeded with status 200 and JWT issued');

    // 2. Reject unauthenticated request
    console.log('\n[2] Reject Unauthenticated Request');
    const unauthRes = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'cpnraja2026', newPassword: 'newpassword123' });
    if (unauthRes.status !== 401) {
      logFail('Expected 401 for unauthenticated request, got ' + unauthRes.status);
    }
    logPass('Unauthenticated request rejected with status 401');

    // 3. Validation: Missing fields
    console.log('\n[3] Validation: Missing Required Fields');
    const missingRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: '', newPassword: '' });
    if (missingRes.status !== 400) {
      logFail('Expected 400 for empty fields, got ' + missingRes.status);
    }
    logPass('Empty fields rejected with status 400: ' + missingRes.body.message);

    // 4. Validation: New password < 6 characters
    console.log('\n[4] Validation: Password Length < 6');
    const shortRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'cpnraja2026', newPassword: '123' });
    if (shortRes.status !== 400) {
      logFail('Expected 400 for short password, got ' + shortRes.status);
    }
    logPass('Short password (< 6 chars) rejected with status 400: ' + shortRes.body.message);

    // 5. Security: Wrong current password
    console.log('\n[5] Security: Incorrect Current Password');
    const wrongCurrentRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong_password_xyz', newPassword: 'brandNewPassword2026' });
    if (wrongCurrentRes.status !== 400) {
      logFail('Expected 400 for wrong current password, got ' + wrongCurrentRes.status);
    }
    logPass('Wrong current password rejected with status 400: ' + wrongCurrentRes.body.message);

    // 6. Successful password change
    console.log('\n[6] Successful Password Change');
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'cpnraja2026', newPassword: 'newSecurePassword2026!' });
    if (changeRes.status !== 200 || !changeRes.body.success) {
      logFail('Password change failed with status ' + changeRes.status, changeRes.body);
    }
    logPass('Password changed successfully with status 200: ' + changeRes.body.message);

    // 7. Verify Old password login fails
    console.log('\n[7] Verify Old Password Fails');
    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cpnraja', password: 'cpnraja2026' });
    if (oldLoginRes.status !== 401) {
      logFail('Expected 401 for old password login, got ' + oldLoginRes.status);
    }
    logPass('Old password login cleanly rejected with status 401');

    // 8. Verify New password login succeeds
    console.log('\n[8] Verify New Password Login');
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cpnraja', password: 'newSecurePassword2026!' });
    if (newLoginRes.status !== 200 || !newLoginRes.body.token) {
      logFail('New password login failed with status ' + newLoginRes.status);
    }
    const newToken = newLoginRes.body.token;
    logPass('New password login succeeded with status 200 and fresh JWT issued');

    // 9. Verify Audit Trail entry
    console.log('\n[9] Audit Trail Verification');
    const auditEntry = await AuditLog.findOne({ action: 'CHANGE_PASSWORD' }).sort({ timestamp: -1 });
    if (!auditEntry) {
      logFail('No CHANGE_PASSWORD audit log entry found');
    }
    logPass(`AuditLog entry found: action="${auditEntry.action}", user="${auditEntry.performedBy}"`);

    // 10. Clean recovery: Restore original password
    console.log('\n[10] Clean Recovery: Restore Original Password');
    const restoreRes = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ currentPassword: 'newSecurePassword2026!', newPassword: 'cpnraja2026' });
    if (restoreRes.status !== 200) {
      logFail('Password restore failed with status ' + restoreRes.status);
    }
    logPass('Original password restored successfully to cpnraja2026');

    console.log('\n=====================================================');
    console.log('  ALL 10 PASSWORD CHANGE TESTS PASSED SUCCESSFULLY!  ');
    console.log('=====================================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    logFail('Unexpected test exception', err);
  }
}

runPasswordTests();
