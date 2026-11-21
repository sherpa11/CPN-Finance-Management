/**
 * CPN RAJA – Secure Administrator Provisioning Script
 * 
 * Usage:
 *   node src/scripts/provisionAdmin.js
 * Or with arguments:
 *   node src/scripts/provisionAdmin.js <username> <password> <email> <fullName>
 * Or via environment variables:
 *   ADMIN_INITIAL_USERNAME, ADMIN_INITIAL_PASSWORD, ADMIN_INITIAL_EMAIL, ADMIN_INITIAL_FULLNAME
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const connectDB = require('../config/db');

async function provisionAdmin() {
  await connectDB();
  console.log('[Admin Provisioning] Connected to MongoDB...');

  const args = process.argv.slice(2);
  const username = (args[0] || process.env.ADMIN_INITIAL_USERNAME || 'cpnraja').trim().toLowerCase();
  const password = args[1] || process.env.ADMIN_INITIAL_PASSWORD || 'cpnraja2026';
  const email = (args[2] || process.env.ADMIN_INITIAL_EMAIL || 'admin@cpnraja.com').trim().toLowerCase();
  const fullName = args[3] || process.env.ADMIN_INITIAL_FULLNAME || 'CPN Raja';

  if (!username) {
    throw new Error('Administrator username is required.');
  }

  if (!password || password.length < 8) {
    throw new Error('Administrator password must be at least 8 characters long.');
  }

  let user = await User.findOne({ username });

  if (user) {
    console.log(`[Admin Provisioning] Administrator account "${username}" found. Updating credentials...`);
    user.fullName = fullName;
    user.email = email;
    user.passwordHash = password; // Will be hashed by pre-save hook
    user.role = 'admin';
    user.isActive = true;
    await user.save();
    console.log(`  ✓ Updated existing administrator: "${username}" (${email})`);
  } else {
    user = new User({
      username,
      fullName,
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      role: 'admin',
      isActive: true,
    });
    await user.save();
    console.log(`  ✓ Created new administrator account: "${username}" (${email})`);
  }

  // Audit Log
  const audit = new AuditLog({
    logId: `AUD-PROV-${Date.now()}`,
    action: 'ADMIN_PROVISIONED',
    entityType: 'USER',
    entityId: String(user._id),
    performedBy: 'CLI_PROVISION_SCRIPT',
    ipAddress: '127.0.0.1',
    details: `Administrator account "${username}" successfully provisioned with role admin.`,
    timestamp: new Date(),
  });
  await audit.save();

  console.log('\n[Admin Provisioning] Administrator setup complete!');
  console.log(`  - Username: ${username}`);
  console.log(`  - Role: admin`);
  console.log(`  - Status: ACTIVE\n`);

  await mongoose.disconnect();
}

if (require.main === module) {
  provisionAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Admin Provisioning Error]', err.message);
      process.exit(1);
    });
}

module.exports = provisionAdmin;
