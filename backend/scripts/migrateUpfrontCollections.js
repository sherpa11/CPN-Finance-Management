/**
 * CPN RAJA – Upfront Collections Historical Reconciliation Script
 * Usage:
 *   node backend/scripts/migrateUpfrontCollections.js --dry-run
 *   node backend/scripts/migrateUpfrontCollections.js --execute
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const connectDB = require('../src/config/db');
const { syncHistoricalUpfrontCollections } = require('../src/services/reconciliationService');

(async () => {
  const isExecute = process.argv.includes('--execute');
  const isDryRun = !isExecute;

  console.log('===============================================================');
  console.log(` CPN RAJA – UPFRONT INTEREST HISTORICAL RECONCILIATION SCRIPT `);
  console.log(` Mode: ${isDryRun ? 'DRY RUN (Preview Only - No DB writes)' : 'EXECUTE (Applying changes)'}`);
  console.log('===============================================================\n');

  try {
    await connectDB();
    const result = await syncHistoricalUpfrontCollections({ dryRun: isDryRun });

    console.log(`Loans Scanned:          ${result.loansScanned}`);
    console.log(`Loans Requiring Action: ${result.loansFixed}`);
    console.log(`DC Accounts Scanned:    ${result.dcAccountsScanned}`);
    console.log(`DC Accounts Actioned:   ${result.dcAccountsFixed}`);
    console.log(`Errors:                 ${result.errors.length}`);

    if (result.createdCollections.length > 0) {
      console.log('\nDetails:');
      result.createdCollections.forEach((c, idx) => {
        console.log(`  ${idx + 1}. [${c.type}] ${c.loanCode || c.accountCode} (${c.customerName}) - ₹${c.upfrontInterestRupees} -> ${c.action} ${c.receiptNumber ? `(Receipt: ${c.receiptNumber})` : ''}`);
      });
    } else {
      console.log('\nAll upfront interest collections are already up to date! Zero actions required.');
    }

    if (isDryRun) {
      console.log('\n✓ Dry run completed successfully. Run with --execute to commit changes.');
    } else {
      console.log('\n✓ Upfront interest reconciliation committed successfully.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
