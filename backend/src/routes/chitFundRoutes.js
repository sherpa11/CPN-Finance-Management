const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  getChitSummary,
  getChitGroups,
  getChitGroupById,
  createChitGroup,
  updateChitSchedule,
  getChitMembers,
  addChitMember,
  updateChitMember,
  getChitMemberById,
  getMonthlyCollectionSheet,
  recordMemberCollection,
  reverseMemberCollection,
  recordMonthlyPayout,
  reverseMonthlyPayout,
  getChitReports,
} = require('../controllers/chitFundController');

// All chit routes require authentication
router.use(authMiddleware);

// Summary KPIs
router.get('/summary', getChitSummary);

// Reports
router.get('/reports', getChitReports);

// Groups CRUD
router.get('/groups', getChitGroups);
router.post('/groups', createChitGroup);
router.get('/groups/:id', getChitGroupById);
router.put('/groups/:id/schedule', updateChitSchedule);

// Members within group
router.get('/groups/:id/members', getChitMembers);
router.post('/groups/:id/members', addChitMember);
router.put('/groups/:id/members/:memberId', updateChitMember);
router.get('/members/:memberId', getChitMemberById);

// Monthly Collection Sheet & Payments
router.get('/groups/:id/collections', getMonthlyCollectionSheet);
router.post('/groups/:id/collections', recordMemberCollection);
router.post('/collections/:receiptNumber/reverse', reverseMemberCollection);

// Monthly Payout
router.post('/groups/:id/payouts', recordMonthlyPayout);
router.post('/payouts/:voucherNumber/reverse', reverseMonthlyPayout);

module.exports = router;
