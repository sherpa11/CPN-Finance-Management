const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  previewDailyCollection,
  createDailyCollectionAccount,
  getDailyCollectionAccounts,
  getDailyCollectionAccountById,
  recordDailyCollectionPayment,
  reverseDailyCollectionPayment,
  getDailyCollectionDashboardSummary,
  getDailyCollectionReports,
} = require('../controllers/dailyCollectionController');

// All daily collection routes require authentication
router.use(authMiddleware);

router.post('/preview', previewDailyCollection);
router.post('/', createDailyCollectionAccount);
router.get('/', getDailyCollectionAccounts);
router.get('/summary', getDailyCollectionDashboardSummary);
router.get('/reports', getDailyCollectionReports);
router.get('/:id', getDailyCollectionAccountById);
router.post('/:id/payments', recordDailyCollectionPayment);
router.post('/:id/payments/:paymentId/reverse', reverseDailyCollectionPayment);

module.exports = router;
