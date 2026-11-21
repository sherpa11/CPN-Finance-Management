const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'COMPLETED'],
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    mobileNumber: {
      type: String,
      required: true,
    },
    loanCode: {
      type: String,
      required: true,
    },
    vattiType: {
      type: String,
      enum: ['MONTHLY', 'DAILY', 'DAILY_COLLECTION', 'MEATER'],
      required: true,
    },
    principalPaise: {
      type: Number,
      required: true,
    },
    accruedInterestPaise: {
      type: Number,
      default: 0,
    },
    outstandingPrincipalPaise: {
      type: Number,
      required: true,
    },
    outstandingInterestPaise: {
      type: Number,
      default: 0,
    },
    totalOutstandingPaise: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    daysRemainingOrOverdue: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'],
      default: 'ACTIVE',
      index: true,
    },
    acknowledgedAt: {
      type: Date,
    },
    acknowledgedBy: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
    resolvedReason: {
      type: String,
    },
    // Deduplication key to prevent duplicate notifications: `${loanId}-${category}-${dueDateStr}`
    dedupKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ category: 1, status: 1 });
notificationSchema.index({ dueDate: 1, status: 1 });
notificationSchema.index({ status: 1, dueDate: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
