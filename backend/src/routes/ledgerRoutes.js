const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/loan/:loanId', ledgerController.getLoanLedger);
router.get('/customer/:customerId', ledgerController.getCustomerLedger);

module.exports = router;
