const Notification = require('../models/Notification');
const { evaluateDueNotifications, acknowledgeNotification } = require('../services/notificationService');
const { toRupees } = require('../services/calculationEngine');
const { escapeRegex } = require('../utils/sanitize');

const listNotifications = async (req, res, next) => {
  try {
    const { category, status, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (category && category !== 'ALL') {
      query.category = category;
    }

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { customerName: searchRegex },
        { mobileNumber: searchRegex },
        { loanCode: searchRegex },
      ];
    }

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const formatted = notifications.map((n) => ({
      id: n._id,
      notificationId: n.notificationId,
      category: n.category,
      customerId: n.customerId,
      loanId: n.loanId,
      customerName: n.customerName,
      mobileNumber: n.mobileNumber,
      loanCode: n.loanCode,
      financeType: n.vattiType,
      vattiType: n.vattiType,
      principalRupees: toRupees(n.principalPaise),
      accruedInterestRupees: toRupees(n.accruedInterestPaise),
      outstandingPrincipalRupees: toRupees(n.outstandingPrincipalPaise),
      outstandingInterestRupees: toRupees(n.outstandingInterestPaise),
      totalOutstandingRupees: toRupees(n.totalOutstandingPaise),
      dueDate: n.dueDate,
      daysRemainingOrOverdue: n.daysRemainingOrOverdue,
      status: n.status,
      acknowledgedAt: n.acknowledgedAt,
      acknowledgedBy: n.acknowledgedBy,
      resolvedAt: n.resolvedAt,
      resolvedReason: n.resolvedReason,
      createdAt: n.createdAt,
    }));

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      notifications: formatted,
    });
  } catch (error) {
    next(error);
  }
};

const getNotificationStats = async (req, res, next) => {
  try {
    const [upcomingCount, dueTodayCount, overdueCount, completedCount] = await Promise.all([
      Notification.countDocuments({ category: 'UPCOMING', status: 'ACTIVE' }),
      Notification.countDocuments({ category: 'DUE_TODAY', status: 'ACTIVE' }),
      Notification.countDocuments({ category: 'OVERDUE', status: 'ACTIVE' }),
      Notification.countDocuments({ category: 'COMPLETED' }),
    ]);

    res.json({
      success: true,
      stats: {
        upcoming: upcomingCount,
        dueToday: dueTodayCount,
        overdue: overdueCount,
        completed: completedCount,
        totalActive: upcomingCount + dueTodayCount + overdueCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

const runEvaluation = async (req, res, next) => {
  try {
    const result = await evaluateDueNotifications();
    res.json({
      success: true,
      message: `Due-date evaluation completed successfully in Asia/Kolkata timezone. Processed ${result.count} records.`,
      result,
    });
  } catch (error) {
    next(error);
  }
};

const acknowledge = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await acknowledgeNotification(id, req.user.username);
    res.json({
      success: true,
      message: 'Notification acknowledged',
      notification,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listNotifications,
  getNotificationStats,
  runEvaluation,
  acknowledge,
};
