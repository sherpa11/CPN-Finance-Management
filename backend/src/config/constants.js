/**
 * CPN RAJA – VATTI MANAGEMENT SYSTEM
 * Central Constants & Enums
 */

const CONSTANTS = {
  APP_NAME: 'CPN RAJA – VATTI MANAGEMENT SYSTEM',
  BUSINESS_OWNER: 'CPN Raja',
  DEFAULT_TIMEZONE: 'Asia/Kolkata',

  VATTI_TYPES: {
    MONTHLY: 'MONTHLY',
    DAILY: 'DAILY',
    MEATER: 'MEATER'
  },

  LOAN_STATUS: {
    ACTIVE: 'ACTIVE',
    SETTLED: 'SETTLED',
    OVERDUE: 'OVERDUE',
    CLOSED: 'CLOSED'
  },

  COLLECTION_TYPES: {
    INTEREST: 'INTEREST',
    PRINCIPAL: 'PRINCIPAL',
    COMBINED: 'COMBINED'
  },

  COLLECTION_STATUS: {
    CONFIRMED: 'CONFIRMED',
    REVERSED: 'REVERSED'
  },

  PAYMENT_METHODS: {
    CASH: 'CASH',
    UPI: 'UPI',
    BANK_TRANSFER: 'BANK_TRANSFER',
    OTHER: 'OTHER'
  },

  TRANSACTION_TYPES: {
    LOAN_DISBURSEMENT: 'LOAN_DISBURSEMENT',
    INTEREST_ACCRUAL: 'INTEREST_ACCRUAL',
    COLLECTION: 'COLLECTION',
    REVERSAL: 'REVERSAL',
    ADJUSTMENT: 'ADJUSTMENT'
  },

  NOTIFICATION_CATEGORIES: {
    UPCOMING: 'UPCOMING',
    DUE_TODAY: 'DUE_TODAY',
    OVERDUE: 'OVERDUE',
    COMPLETED: 'COMPLETED'
  },

  NOTIFICATION_STATUS: {
    ACTIVE: 'ACTIVE',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    RESOLVED: 'RESOLVED'
  },

  USER_ROLES: {
    ADMIN: 'admin',
    STAFF: 'staff'
  },

  CUSTOMER_STATUS: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE'
  },

  // Monthly partial month rules
  MONTHLY_PARTIAL_RULES: {
    PRO_RATA_DAILY: 'PRO_RATA_DAILY',         // Daily interest based on actual days in month
    THIRTY_DAY_BASE: 'THIRTY_DAY_BASE',       // Daily interest assuming standard 30-day month
    FULL_MONTH_IF_STARTED: 'FULL_MONTH_IF_STARTED', // Count started month as full month
    NO_INTEREST_IF_PARTIAL: 'NO_INTEREST_IF_PARTIAL' // Only count completed full months
  },

  // Daily date inclusion conventions
  DAILY_INCLUSION_CONVENTIONS: {
    INCLUDE_START_EXCLUDE_END: 'INCLUDE_START_EXCLUDE_END', // Standard financial convention
    INCLUDE_BOTH: 'INCLUDE_BOTH',                           // Count both start date and payment date
    EXCLUDE_START_INCLUDE_END: 'EXCLUDE_START_INCLUDE_END'
  },

  DEFAULT_REMINDER_DAYS: 3
};

module.exports = CONSTANTS;
