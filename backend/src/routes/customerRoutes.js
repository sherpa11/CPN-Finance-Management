const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', customerController.listCustomers);
router.post('/', customerController.createCustomer);
router.get('/:id', customerController.getCustomerById);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);
router.get('/:id/delete-check', customerController.checkDeleteEligibility);
router.get('/:id/statement', customerController.getCustomerStatement);

module.exports = router;
