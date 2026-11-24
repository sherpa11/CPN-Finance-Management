const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/preview', loanController.previewLoan);
router.post('/', loanController.createLoan);
router.get('/', loanController.listLoans);
router.get('/:id', loanController.getLoanById);
router.post('/:id/amend-rate', loanController.amendInterestRate);
router.post('/:id/reverse', loanController.reverseLoan);
router.delete('/:id', loanController.deleteLoan);

module.exports = router;
