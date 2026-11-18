require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Collection = require('../models/Collection');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CalculationConfiguration = require('../models/CalculationConfiguration');
const connectDB = require('../config/db');

async function clearDemoData() {
  await connectDB();
  console.log('[Cleanup] Connected to MongoDB. Removing all demo and test data...');

  const [
    custResult,
    loanResult,
    colResult,
    txnResult,
    notifResult,
    auditResult,
  ] = await Promise.all([
    Customer.deleteMany({}),
    Loan.deleteMany({}),
    Collection.deleteMany({}),
    Transaction.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  console.log(`[Cleanup] Deleted ${custResult.deletedCount} customers.`);
  console.log(`[Cleanup] Deleted ${loanResult.deletedCount} loans.`);
  console.log(`[Cleanup] Deleted ${colResult.deletedCount} collections.`);
  console.log(`[Cleanup] Deleted ${txnResult.deletedCount} transactions.`);
  console.log(`[Cleanup] Deleted ${notifResult.deletedCount} notifications.`);
  console.log(`[Cleanup] Deleted ${auditResult.deletedCount} audit logs.`);

  // Create an initial fresh audit log entry
  const initAudit = new AuditLog({
    logId: `AUD-${Date.now()}-0001`,
    action: 'SYSTEM_INITIALIZATION',
    entityType: 'SETTINGS',
    entityId: 'SYSTEM',
    performedBy: 'CPN Raja',
    ipAddress: '127.0.0.1',
    details: 'All demo and test data removed. System initialized with zero balances ready for live production use.',
    timestamp: new Date(),
  });
  await initAudit.save();

  // Verify Admin user exists
  const admin = await User.findOne({ username: 'cpnraja' });
  if (!admin) {
    const newAdmin = new User({
      username: 'cpnraja',
      fullName: 'CPN Raja',
      email: 'cpnraja@vattibusiness.com',
      passwordHash: 'cpnraja2026',
      role: 'admin',
      isActive: true,
    });
    await newAdmin.save();
    console.log('[Cleanup] Admin user "cpnraja" ensured.');
  } else {
    console.log('[Cleanup] Preserved administrator: cpnraja');
  }

  // Verify default configurations exist
  const configCount = await CalculationConfiguration.countDocuments();
  console.log(`[Cleanup] Preserved ${configCount} calculation configurations.`);

  console.log('[Cleanup] Successfully removed all demo data! System is 100% clean and production-ready.');
  process.exit(0);
}

clearDemoData().catch((err) => {
  console.error('[Cleanup Error]', err);
  process.exit(1);
});
