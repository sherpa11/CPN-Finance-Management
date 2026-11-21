/**
 * CPN RAJA – Database Backup Utility
 * Exports all collections and documents to a timestamped JSON backup archive.
 * Safe, non-destructive, and works across local MongoDB and MongoDB Atlas.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');

async function backupDatabase() {
  await connectDB();
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../../backups', `backup-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`[Backup] Starting full backup of database "${dbName}"...`);
  console.log(`[Backup] Target directory: ${backupDir}`);

  const collections = await db.listCollections().toArray();
  const manifest = {
    database: dbName,
    timestamp: new Date().toISOString(),
    collections: {},
    totalDocuments: 0,
  };

  for (const collInfo of collections) {
    const collName = collInfo.name;
    // Skip internal system collections
    if (collName.startsWith('system.')) continue;

    const docs = await db.collection(collName).find({}).toArray();
    const filePath = path.join(backupDir, `${collName}.json`);

    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    manifest.collections[collName] = docs.length;
    manifest.totalDocuments += docs.length;

    console.log(`  ✓ Backed up "${collName}": ${docs.length} documents`);
  }

  // Write manifest
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  console.log(`\n[Backup] Complete! Total documents archived: ${manifest.totalDocuments}`);
  console.log(`[Backup] Backup location: ${backupDir}\n`);

  await mongoose.disconnect();
  return backupDir;
}

if (require.main === module) {
  backupDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Backup Error]', err);
      process.exit(1);
    });
}

module.exports = backupDatabase;
