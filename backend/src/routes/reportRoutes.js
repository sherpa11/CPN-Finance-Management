const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/daily', reportController.getDailyReport);
router.get('/monthly', reportController.getMonthlyReport);
router.get('/yearly', reportController.getYearlyReport);
router.get('/customer', reportController.getCustomerReport);
router.get('/category', reportController.getCategoryReport);

module.exports = router;
