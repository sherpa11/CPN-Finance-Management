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
      enum: ['MONTHLY', 'DAILY', 'DAILY_COLLECTION', 'MEATER'],
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
      enum: ['ACTIVE', 'SETTLED', 'OVERDUE', 'CLOSED', 'CANCELLED', 'REVERSED'],
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
    // Daily Finance Penalty Tracking (Strictly 2% of daily repayment amount per overdue day)
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
    lastPenaltyCalculationDate: {
      type: Date,
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
    // For Daily Collection details snapshot
    dailyCollectionDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // For Monthly Finance Upfront Interest Deduction snapshot
    monthlyFinanceDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    // For Daily Finance Upfront Interest Deduction snapshot
    dailyFinanceDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    upfrontInterestPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    netDisbursementPaise: {
      type: Number,
      default: undefined,
    },
    grossPrincipalPaise: {
      type: Number,
      default: undefined,
    },
    dailyInstalmentPaise: {
      type: Number,
      default: undefined,
    },
    totalDurationDays: {
      type: Number,
      default: undefined,
    },
    disbursementPaymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
      default: 'CASH',
      index: true,
    },
    // For MEATER Finance status and formula parameters
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
    // Auto-recorded upfront interest collection reference
    upfrontCollectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
      index: true,
    },
    upfrontReceiptNumber: {
      type: String,
      index: true,
    },
    // Renewal Tracking for Monthly and Daily Finance
    renewalCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    currentPeriodStartDate: {
      type: Date,
    },
    currentPeriodDueDate: {
      type: Date,
    },
    renewalHistory: [
      {
        renewalNumber: {
          type: Number,
          required: true,
        },
        renewalDate: {
          type: Date,
          required: true,
        },
        previousDueDate: {
          type: Date,
          required: true,
        },
        newDueDate: {
          type: Date,
          required: true,
        },
        renewalInterestPaise: {
          type: Number,
          required: true,
        },
        principalPaiseAtRenewal: {
          type: Number,
          required: true,
        },
        interestRatePercent: {
          type: Number,
          required: true,
        },
        collectionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Collection',
        },
        receiptNumber: {
          type: String,
        },
        paymentMethod: {
          type: String,
          enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
          default: 'CASH',
        },
        remarks: {
          type: String,
          default: '',
        },
        recordedBy: {
          type: String,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

loanSchema.index({ customerId: 1, status: 1 });
loanSchema.index({ vattiType: 1, status: 1 });
loanSchema.index({ dueDate: 1, status: 1 });
loanSchema.index({ status: 1, dueDate: 1 });
loanSchema.index({ status: 1, createdAt: -1 });
loanSchema.index({ status: 1, settledDate: -1 });
loanSchema.index({ vattiType: 1, status: 1, createdAt: -1 });
loanSchema.index({ status: 1, disbursementPaymentMethod: 1, startDate: -1 });
loanSchema.index({ startDate: -1 });

module.exports = mongoose.model('Loan', loanSchema);
