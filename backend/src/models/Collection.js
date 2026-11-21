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
      required: true,
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
    // Balance snapshots for audit accuracy
    previousOutstandingPrincipalPaise: {
      type: Number,
      required: true,
    },
    previousOutstandingInterestPaise: {
      type: Number,
      required: true,
    },
    remainingPrincipalPaise: {
      type: Number,
      required: true,
    },
    remainingInterestPaise: {
      type: Number,
      required: true,
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

module.exports = mongoose.model('Collection', collectionSchema);
