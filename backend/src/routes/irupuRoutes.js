const express = require('express');
const router = express.Router();
const irupuController = require('../controllers/irupuController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Summary & Cash Register
router.get('/summary', irupuController.getSummary);

// Investments
router.get('/investments', irupuController.listInvestments);
router.post('/investments', irupuController.addInvestment);
router.post('/investments/:id/reverse', irupuController.reverseInvestment);

// Cash Outflows (Expenses, Withdrawals, Other)
router.get('/outflows', irupuController.listOutflows);
router.post('/outflows', irupuController.addOutflow);
router.post('/outflows/:id/reverse', irupuController.reverseOutflow);

// Opening Balance
router.get('/opening-balance', irupuController.getOpeningBalanceHistory);
router.post('/opening-balance', irupuController.setOpeningBalance);

module.exports = router;
