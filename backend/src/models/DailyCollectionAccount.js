const mongoose = require('mongoose');

const scheduleItemSchema = new mongoose.Schema(
  {
    dayNumber: {
      type: Number,
      required: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      enum: ['PRINCIPAL', 'INTEREST', 'PENALTY'],
      required: true,
    },
    expectedPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    collectedPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['UPCOMING', 'PAID', 'PARTIAL', 'MISSED'],
      default: 'UPCOMING',
    },
    paymentDate: {
      type: Date,
    },
    paymentId: {
      type: String,
    },
    remarks: {
      type: String,
      default: '',
    },
  },
  { _id: true }
);

const dailyCollectionAccountSchema = new mongoose.Schema(
  {
    accountId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerCode: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      index: true,
    },
    customerMobile: {
      type: String,
      required: true,
      index: true,
    },
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      index: true,
    },
    loanCode: {
      type: String,
      index: true,
    },
    scheme: {
      type: String,
      enum: ['UPFRONT_DEDUCTION', 'EXTENDED_DAYS'],
      required: true,
      index: true,
    },
    grossPrincipalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    upfrontInterestPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    upfrontInterestPercent: {
      type: Number,
      default: 0,
      min: 0,
    },
    netDisbursementPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    dailyInstalmentPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    principalRepaymentDays: {
      type: Number,
      default: 100,
    },
    additionalInterestDays: {
      type: Number,
      default: 0,
      min: 0,
      max: 20,
    },
    totalDurationDays: {
      type: Number,
      required: true,
    },
    totalRepaymentPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCollectedPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    principalCollectedPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestCollectedPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingPrincipalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    outstandingInterestPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Penalty Tracking for Daily Collection (2% of daily instalment per overdue day)
    penaltyRatePercent: {
      type: Number,
      default: 2.0,
    },
    penaltyAssessedPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyPaidPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyOutstandingPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    overdueDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalOutstandingPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    expectedCompletionDate: {
      type: Date,
      required: true,
      index: true,
    },
    actualCompletionDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'OVERDUE'],
      default: 'ACTIVE',
      index: true,
    },
    daysCompleted: {
      type: Number,
      default: 0,
    },
    daysMissed: {
      type: Number,
      default: 0,
    },
    daysRemaining: {
      type: Number,
      required: true,
    },
    remarks: {
      type: String,
      default: '',
    },
    schedule: [scheduleItemSchema],
  },
  {
    timestamps: true,
  }
);

dailyCollectionAccountSchema.index({ customerId: 1, status: 1 });
dailyCollectionAccountSchema.index({ customerId: 1, status: 1, createdAt: -1 });
dailyCollectionAccountSchema.index({ scheme: 1, status: 1 });
dailyCollectionAccountSchema.index({ expectedCompletionDate: 1, status: 1 });
dailyCollectionAccountSchema.index({ status: 1, createdAt: -1 });
dailyCollectionAccountSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('DailyCollectionAccount', dailyCollectionAccountSchema);
