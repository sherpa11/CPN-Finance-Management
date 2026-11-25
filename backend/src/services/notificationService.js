/**
 * CPN RAJA – VATTI MANAGEMENT SYSTEM
 * Notification Evaluation & Management Engine
 * 
 * Features:
 * - Persistent MongoDB-backed notifications
 * - Backend evaluation using Asia/Kolkata business dates
 * - Duplicate prevention via dedupKey
 * - Categories: UPCOMING, DUE_TODAY, OVERDUE, COMPLETED
 * - Modular design ready for WhatsApp API in future phase
 */

const { DateTime } = require('luxon');
const Loan = require('../models/Loan');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const CalculationConfiguration = require('../models/CalculationConfiguration');
const { calculateLoanInterest } = require('./calculationEngine');
const CONSTANTS = require('../config/constants');

const TIMEZONE = CONSTANTS.DEFAULT_TIMEZONE;

/**
 * Get current business date in Asia/Kolkata
 */
function getBusinessToday() {
  return DateTime.now().setZone(TIMEZONE).startOf('day');
}

/**
 * Evaluates active loans and synchronizes notifications in MongoDB
 */
async function evaluateDueNotifications() {
  const today = getBusinessToday();

  // Load configured reminder window (e.g. 3 days)
  let reminderDays = CONSTANTS.DEFAULT_REMINDER_DAYS;
  const businessConfig = await CalculationConfiguration.findOne({ configType: 'BUSINESS', isActive: true });
  if (businessConfig && businessConfig.settings && businessConfig.settings.reminderDays !== undefined) {
    reminderDays = Number(businessConfig.settings.reminderDays);
  }

  // Fetch all loans that are not CLOSED
  const loans = await Loan.find({
    status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE, CONSTANTS.LOAN_STATUS.SETTLED] }
  }).populate('customerId');

  const generatedOrUpdated = [];

  for (const loan of loans) {
    const customer = loan.customerId;
    if (!customer) continue;

    // Recalculate up-to-date accrued interest for active/overdue loans
    let accruedInterestPaise = loan.accruedInterestPaise || 0;
    if (loan.status === CONSTANTS.LOAN_STATUS.ACTIVE || loan.status === CONSTANTS.LOAN_STATUS.OVERDUE) {
      if (loan.vattiType === 'MONTHLY' || loan.vattiType === 'DAILY') {
        // Renewal Workflow: First month / 10-day interest is deducted upfront.
        // Renewals are paid as renewal interest. Ongoing outstanding interest does not compound or accumulate.
        accruedInterestPaise = loan.totalInterestPaidPaise || 0;
        loan.accruedInterestPaise = accruedInterestPaise;
        loan.outstandingInterestPaise = 0;
      } else if (loan.vattiType !== CONSTANTS.VATTI_TYPES.MEATER) {
        const calc = calculateLoanInterest({
          vattiType: loan.vattiType,
          principalPaise: loan.outstandingPrincipalPaise,
          ratePercent: loan.interestRatePercent,
          startDate: loan.startDate,
          asOfDate: today.toJSDate(),
          config: loan.calculationConfigSnapshot,
        });
        accruedInterestPaise = calc.interestPaise;
        const totalInterestPaid = loan.totalInterestPaidPaise || 0;
        loan.accruedInterestPaise = accruedInterestPaise;
        loan.outstandingInterestPaise = Math.max(0, accruedInterestPaise - totalInterestPaid);
      }
    }

    const outstandingPrincipalPaise = loan.outstandingPrincipalPaise || 0;
    const outstandingInterestPaise = loan.outstandingInterestPaise || 0;
    const totalOutstandingPaise = outstandingPrincipalPaise + outstandingInterestPaise;

    // Due date comparison in Asia/Kolkata
    const dueKolkata = DateTime.fromJSDate(loan.dueDate, { zone: TIMEZONE }).startOf('day');
    const diffDays = Math.round(dueKolkata.diff(today, 'days').days); // >0 upcoming, 0 today, <0 overdue

    let category = null;

    if (loan.status === CONSTANTS.LOAN_STATUS.SETTLED || totalOutstandingPaise === 0) {
      category = CONSTANTS.NOTIFICATION_CATEGORIES.COMPLETED;
    } else if (diffDays < 0) {
      category = CONSTANTS.NOTIFICATION_CATEGORIES.OVERDUE;
      // Mark loan status as OVERDUE in database if currently ACTIVE
      if (loan.status === CONSTANTS.LOAN_STATUS.ACTIVE) {
        loan.status = CONSTANTS.LOAN_STATUS.OVERDUE;
        await loan.save();
      }
    } else if (diffDays === 0) {
      category = CONSTANTS.NOTIFICATION_CATEGORIES.DUE_TODAY;
    } else if (diffDays > 0 && diffDays <= reminderDays) {
      category = CONSTANTS.NOTIFICATION_CATEGORIES.UPCOMING;
    }

    if (!category) {
      continue; // Far future due date beyond reminder window
    }

    // Deduplication Key: `${loan._id}-${category}-${dueKolkata.toISODate()}`
    const dedupKey = `${loan._id}-${category}-${dueKolkata.toISODate()}`;

    // Upsert notification
    const existing = await Notification.findOne({ dedupKey });

    if (existing) {
      // Update financial values in case payments or accruals occurred
      existing.principalPaise = loan.principalPaise;
      existing.accruedInterestPaise = accruedInterestPaise;
      existing.outstandingPrincipalPaise = outstandingPrincipalPaise;
      existing.outstandingInterestPaise = outstandingInterestPaise;
      existing.totalOutstandingPaise = totalOutstandingPaise;
      existing.daysRemainingOrOverdue = diffDays;
      if (category === CONSTANTS.NOTIFICATION_CATEGORIES.COMPLETED && existing.status !== CONSTANTS.NOTIFICATION_STATUS.RESOLVED) {
        existing.status = CONSTANTS.NOTIFICATION_STATUS.RESOLVED;
        existing.resolvedAt = new Date();
        existing.resolvedReason = 'Loan fully settled';
      }
      await existing.save();
      generatedOrUpdated.push(existing);
    } else {
      const notification = new Notification({
        notificationId: `NOTIF-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        category,
        customerId: customer._id,
        loanId: loan._id,
        customerName: customer.name,
        mobileNumber: customer.mobileNumber,
        loanCode: loan.loanId,
        vattiType: loan.vattiType,
        principalPaise: loan.principalPaise,
        accruedInterestPaise,
        outstandingPrincipalPaise,
        outstandingInterestPaise,
        totalOutstandingPaise,
        dueDate: loan.dueDate,
        daysRemainingOrOverdue: diffDays,
        status: category === CONSTANTS.NOTIFICATION_CATEGORIES.COMPLETED 
          ? CONSTANTS.NOTIFICATION_STATUS.RESOLVED 
          : CONSTANTS.NOTIFICATION_STATUS.ACTIVE,
        dedupKey,
      });

      await notification.save();
      generatedOrUpdated.push(notification);

      // Modular future hook for WhatsApp Business API
      triggerFutureWhatsAppHook({
        notification,
        customer,
        loan,
        diffDays,
      });
    }
  }

  return {
    evaluatedAt: today.toISO(),
    reminderDays,
    count: generatedOrUpdated.length,
  };
}

/**
 * Modular Future Hook for WhatsApp Business API
 * Does not call external APIs in Release 1, but provides the exact architectural hook
 */
function triggerFutureWhatsAppHook(payload) {
  // Release 1 requirement: Do not implement WhatsApp messaging yet.
  // This clean modular interface ensures that adding WhatsApp Business API
  // in the next phase requires zero refactoring of notification triggers.
  if (process.env.ENABLE_WHATSAPP_TEST === 'true') {
    console.log('[Future WhatsApp Hook Prepared]', payload.notification.notificationId);
  }
}

/**
 * Acknowledge a notification
 */
async function acknowledgeNotification(notificationId, username) {
  const notif = await Notification.findOne({
    $or: [{ notificationId }, { _id: notificationId }]
  });

  if (!notif) {
    throw new Error('Notification not found');
  }

  notif.status = CONSTANTS.NOTIFICATION_STATUS.ACKNOWLEDGED;
  notif.acknowledgedAt = new Date();
  notif.acknowledgedBy = username || 'CPN Raja';
  await notif.save();
  return notif;
}

module.exports = {
  getBusinessToday,
  evaluateDueNotifications,
  acknowledgeNotification,
  triggerFutureWhatsAppHook,
};
