const express = require('express');
const router = express.Router();
const dueController = require('../controllers/dueController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', dueController.getDuesList);

module.exports = router;
