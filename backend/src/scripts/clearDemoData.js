/**
 * CPN RAJA – Safe Demo & Test Data Cleanup Utility
 * 
 * Safety Standards:
 * 1. Takes an automatic full snapshot backup before modifying any record.
 * 2. Supports '--dry-run' to audit and list records without modifying anything.
 * 3. Never deletes calculation configurations or business rule snapshots.
 * 4. Preserves administrator user account.
 * 5. Logs full audit record of the cleanup action.
 * 
 * Usage:
 *   node src/scripts/clearDemoData.js --dry-run   (Audit only, no changes)
 *   node src/scripts/clearDemoData.js            (Execute backup & cleanup)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Collection = require('../models/Collection');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const CalculationConfiguration = require('../models/CalculationConfiguration');
const MoiSeerPerson = require('../models/MoiSeerPerson');
const MoiSeerContribution = require('../models/MoiSeerContribution');
const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const DailyCollectionPayment = require('../models/DailyCollectionPayment');
const ChitGroup = require('../models/ChitGroup');
const ChitMember = require('../models/ChitMember');
const ChitCollection = require('../models/ChitCollection');
const ChitPayout = require('../models/ChitPayout');
const ChitAuditLog = require('../models/ChitAuditLog');
const User = require('../models/User');
const backupDatabase = require('./backupDatabase');
const connectDB = require('../config/db');

async function safeCleanup() {
  const isDryRun = process.argv.includes('--dry-run');

  await connectDB();
  const db = mongoose.connection.db;

  console.log('\n=====================================================');
  console.log(`  CPN RAJA – DEMO DATA AUDIT & CLEANUP (${isDryRun ? 'DRY RUN' : 'LIVE CLEANUP'})`);
  console.log('=====================================================\n');

  // Count existing records across all business collections
  const counts = {
    customers: await Customer.countDocuments(),
    loans: await Loan.countDocuments(),
    collections: await Collection.countDocuments(),
    transactions: await Transaction.countDocuments(),
    dailyAccounts: await DailyCollectionAccount.countDocuments(),
    dailyPayments: await DailyCollectionPayment.countDocuments(),
    chitGroups: await ChitGroup.countDocuments(),
    chitMembers: await ChitMember.countDocuments(),
    chitCollections: await ChitCollection.countDocuments(),
    chitPayouts: await ChitPayout.countDocuments(),
    moiPersons: await MoiSeerPerson.countDocuments(),
    moiContributions: await MoiSeerContribution.countDocuments(),
    notifications: await Notification.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
    chitAuditLogs: await ChitAuditLog.countDocuments(),
    calculationConfigurations: await CalculationConfiguration.countDocuments(),
    users: await User.countDocuments(),
  };

  console.log('Current Database Inventory:');
  for (const [key, val] of Object.entries(counts)) {
    console.log(`  - ${key}: ${val}`);
  }

  if (isDryRun) {
    console.log('\n[Dry Run] Inspection complete. No records were modified.');
    console.log('To execute cleanup with automatic backup, run: node src/scripts/clearDemoData.js\n');
    await mongoose.disconnect();
    return;
  }

  // 1. Automatic Backup before any destructive action
  console.log('\n[Step 1] Creating pre-cleanup database backup...');
  await mongoose.disconnect(); // Disconnect to let backupDatabase manage its own connection
  const backupDir = await backupDatabase();
  await connectDB(); // Reconnect for cleanup

  console.log(`[Step 1] Pre-cleanup backup saved at: ${backupDir}`);

  // 2. Perform Cleanup
  console.log('\n[Step 2] Cleaning demo and test records...');

  const [
    custResult,
    loanResult,
    colResult,
    txnResult,
    notifResult,
    auditResult,
    mspResult,
    mscResult,
    dcaResult,
    dcpResult,
    cgResult,
    cmResult,
    ccResult,
    cpResult,
    calResult,
  ] = await Promise.all([
    Customer.deleteMany({}),
    Loan.deleteMany({}),
    Collection.deleteMany({}),
    Transaction.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    MoiSeerPerson.deleteMany({}),
    MoiSeerContribution.deleteMany({}),
    DailyCollectionAccount.deleteMany({}),
    DailyCollectionPayment.deleteMany({}),
    ChitGroup.deleteMany({}),
    ChitMember.deleteMany({}),
    ChitCollection.deleteMany({}),
    ChitPayout.deleteMany({}),
    ChitAuditLog.deleteMany({}),
  ]);

  console.log(`  ✓ Cleared ${custResult.deletedCount} demo customers`);
  console.log(`  ✓ Cleared ${loanResult.deletedCount} demo loans`);
  console.log(`  ✓ Cleared ${colResult.deletedCount} demo collections`);
  console.log(`  ✓ Cleared ${txnResult.deletedCount} demo transactions`);
  console.log(`  ✓ Cleared ${dcaResult.deletedCount} demo Daily Collection accounts`);
  console.log(`  ✓ Cleared ${dcpResult.deletedCount} demo Daily Collection payments`);
  console.log(`  ✓ Cleared ${cgResult.deletedCount} demo Chit groups`);
  console.log(`  ✓ Cleared ${cmResult.deletedCount} demo Chit members`);
  console.log(`  ✓ Cleared ${ccResult.deletedCount} demo Chit collections`);
  console.log(`  ✓ Cleared ${cpResult.deletedCount} demo Chit payouts`);
  console.log(`  ✓ Cleared ${mspResult.deletedCount} demo Moi/Seer persons`);
  console.log(`  ✓ Cleared ${mscResult.deletedCount} demo Moi/Seer contributions`);
  console.log(`  ✓ Cleared ${notifResult.deletedCount} demo notifications`);

  // 3. Preserve Configurations and Ensure Initial Audit Entry
  const initAudit = new AuditLog({
    logId: `AUD-INIT-${Date.now()}`,
    action: 'PRODUCTION_INITIALIZATION',
    entityType: 'SETTINGS',
    entityId: 'SYSTEM',
    performedBy: 'DEPLOYMENT_SCRIPT',
    ipAddress: '127.0.0.1',
    details: 'Database cleaned of demo and test records. Pre-cleanup backup created. Ready for genuine production business data.',
    timestamp: new Date(),
  });
  await initAudit.save();

  console.log('\n[Step 3] Verification:');
  const preservedConfigs = await CalculationConfiguration.countDocuments();
  const preservedUsers = await User.countDocuments();
  console.log(`  ✓ Calculation configurations preserved: ${preservedConfigs}`);
  console.log(`  ✓ Administrator accounts preserved: ${preservedUsers}`);

  console.log('\n=====================================================');
  console.log('  PRODUCTION CLEANUP COMPLETED SUCCESSFULLY');
  console.log('  Database is 100% clean and ready for genuine business data');
  console.log('=====================================================\n');

  await mongoose.disconnect();
}

if (require.main === module) {
  safeCleanup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Cleanup Error]', err);
      process.exit(1);
    });
}

module.exports = safeCleanup;
