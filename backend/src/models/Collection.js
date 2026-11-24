const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema(
  {
    collectionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    receiptNumber: {
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
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: false,
      index: true,
    },
    loanCode: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      index: true,
    },
    totalAmountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    principalAllocationPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    interestAllocationPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    penaltyAllocationPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
      default: 'CASH',
      required: true,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['CONFIRMED', 'REVERSED'],
      default: 'CONFIRMED',
      index: true,
    },
    // Upfront interest deduction tracking
    isUpfrontInterest: {
      type: Boolean,
      default: false,
      index: true,
    },
    collectionType: {
      type: String,
      enum: ['REGULAR', 'UPFRONT_INTEREST'],
      default: 'REGULAR',
      index: true,
    },
    vattiType: {
      type: String,
      enum: ['MONTHLY', 'DAILY', 'DAILY_COLLECTION', 'MEATER'],
      default: 'MONTHLY',
    },
    // Balance snapshots for audit accuracy
    previousOutstandingPrincipalPaise: {
      type: Number,
      required: true,
    },
    previousOutstandingInterestPaise: {
      type: Number,
      required: true,
    },
    previousOutstandingPenaltyPaise: {
      type: Number,
      default: 0,
    },
    remainingPrincipalPaise: {
      type: Number,
      required: true,
    },
    remainingInterestPaise: {
      type: Number,
      required: true,
    },
    remainingPenaltyPaise: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      default: '',
    },
    collectedBy: {
      type: String,
      required: true,
    },
    // Explicit reversal tracking
    reversal: {
      reversedAt: { type: Date },
      reversedBy: { type: String },
      reason: { type: String },
      reversalTransactionId: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

collectionSchema.index({ customerId: 1, paymentDate: -1 });
collectionSchema.index({ loanId: 1, paymentDate: -1 });
collectionSchema.index({ status: 1, paymentDate: -1 });
collectionSchema.index({ paymentDate: -1 });
collectionSchema.index({ status: 1, paymentMethod: 1, paymentDate: -1 });
collectionSchema.index({ vattiType: 1, status: 1, paymentMethod: 1 });
collectionSchema.index({ loanId: 1, isUpfrontInterest: 1 });

module.exports = mongoose.model('Collection', collectionSchema);
