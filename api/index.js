const app = require('../backend/src/app');
const connectDB = require('../backend/src/config/db');
const { syncHistoricalUpfrontCollections } = require('../backend/src/services/reconciliationService');

module.exports = async (req, res) => {
  try {
    await connectDB();
    syncHistoricalUpfrontCollections().catch((err) => {
      console.error('[Vercel Serverless] Preflight sync error:', err.message);
    });
  } catch (err) {
    console.error('[Vercel Serverless] Database connection error:', err);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: err.message,
    });
  }
  return app(req, res);
};
