const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', settingController.getSettings);
router.post('/config', requireRole('admin'), settingController.updateConfiguration);
router.get('/audit-logs', settingController.getAuditLogs);
router.get('/backup/export', requireRole('admin'), settingController.exportDatabaseBackup);
router.post('/reset-demo-data', requireRole('admin'), settingController.resetDemoData);

module.exports = router;
