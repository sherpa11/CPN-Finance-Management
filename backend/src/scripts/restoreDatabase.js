/**
 * CPN RAJA – Database Restore Utility
 * Restores all collections and documents from a timestamped JSON backup archive.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');

async function restoreDatabase(targetBackupDir) {
  await connectDB();
  const db = mongoose.connection.db;

  const backupsBase = path.join(__dirname, '../../backups');
  let backupDir = targetBackupDir;

  if (!backupDir) {
    if (!fs.existsSync(backupsBase)) {
      throw new Error('No backups directory found.');
    }
    const entries = fs.readdirSync(backupsBase)
      .filter((e) => e.startsWith('backup-'))
      .sort()
      .reverse();

    if (entries.length === 0) {
      throw new Error('No backups available to restore.');
    }
    backupDir = path.join(backupsBase, entries[0]);
  }

  console.log(`[Restore] Restoring database from: ${backupDir}`);

  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Invalid backup directory: manifest.json missing.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  console.log(`[Restore] Backup manifest: Database="${manifest.database}", CreatedAt="${manifest.timestamp}"`);

  for (const [collName, docCount] of Object.entries(manifest.collections)) {
    const filePath = path.join(backupDir, `${collName}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ! Warning: ${collName}.json not found, skipping.`);
      continue;
    }

    const docs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (docs.length === 0) {
      console.log(`  - "${collName}": 0 documents to restore`);
      continue;
    }

    // Convert date strings back to Date objects where applicable
    const parsedDocs = docs.map((d) => {
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          d[k] = new Date(v);
        }
      }
      return d;
    });

    // Clear existing collection and insert
    await db.collection(collName).deleteMany({});
    await db.collection(collName).insertMany(parsedDocs);
    console.log(`  ✓ Restored "${collName}": ${docs.length} documents`);
  }

  console.log(`\n[Restore] Successfully restored database from backup!\n`);
  await mongoose.disconnect();
}

if (require.main === module) {
  const dirArg = process.argv[2];
  restoreDatabase(dirArg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Restore Error]', err);
      process.exit(1);
    });
}

module.exports = restoreDatabase;
