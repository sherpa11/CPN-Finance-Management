const mongoose = require('mongoose');

const rateAmendmentSchema = new mongoose.Schema(
  {
    amendedAt: {
      type: Date,
      default: Date.now,
    },
    previousRatePercent: {
      type: Number,
      required: true,
    },
    newRatePercent: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    authorizedBy: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
    },
  },
  { _id: true }
);

const loanSchema = new mongoose.Schema(
  {
    loanId: {
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
    vattiType: {
      type: String,
      enum: ['MONTHLY', 'DAILY', 'MEATER'],
      required: true,
      index: true,
    },
    principalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    interestRatePercent: {
      type: Number,
      required: true,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SETTLED', 'OVERDUE', 'CLOSED'],
      default: 'ACTIVE',
      index: true,
    },
    // Historical calculation snapshot at the time loan is created
    calculationConfigSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Outstanding and accrued balances (all in integer paise)
    outstandingPrincipalPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    accruedInterestPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingInterestPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPrincipalPaidPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalInterestPaidPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAccrualDate: {
      type: Date,
    },
    settledDate: {
      type: Date,
    },
    remarks: {
      type: String,
      default: '',
    },
    // Audit trail of any interest rate amendments
    amendmentHistory: [rateAmendmentSchema],
    // For MEATER Vatti status and formula parameters
    meaterConfig: {
      status: {
        type: String,
        default: 'PENDING_CONFIRMATION',
      },
      note: {
        type: String,
        default: 'Formula pending owner confirmation as per business specification',
      },
      customParameters: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
  },
  {
    timestamps: true,
  }
);

loanSchema.index({ customerId: 1, status: 1 });
loanSchema.index({ vattiType: 1, status: 1 });
loanSchema.index({ dueDate: 1, status: 1 });

module.exports = mongoose.model('Loan', loanSchema);
