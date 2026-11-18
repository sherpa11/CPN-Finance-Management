const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', notificationController.listNotifications);
router.get('/stats', notificationController.getNotificationStats);
router.post('/evaluate', notificationController.runEvaluation);
router.put('/:id/acknowledge', notificationController.acknowledge);

module.exports = router;
