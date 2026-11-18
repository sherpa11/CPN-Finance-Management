/**
 * Safe Transaction Execution Helper
 * Handles MongoDB transactions on replica sets (MongoDB Atlas)
 * with robust fallback on standalone development instances.
 */
const mongoose = require('mongoose');

let supportsTransactions = null;

async function checkTransactionSupport() {
  if (supportsTransactions !== null) return supportsTransactions;
  try {
    const isMaster = await mongoose.connection.db.admin().command({ isMaster: 1 });
    supportsTransactions = !!isMaster.setName;
  } catch (err) {
    supportsTransactions = false;
  }
  return supportsTransactions;
}

async function runInTransaction(workFunction) {
  const isSupported = await checkTransactionSupport();

  if (isSupported) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await workFunction(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone development mode: execute directly
    return await workFunction(null);
  }
}

module.exports = {
  runInTransaction,
  checkTransactionSupport,
};
