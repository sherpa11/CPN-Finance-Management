const mongoose = require('mongoose');

const dailyCollectionPaymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    collectionAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DailyCollectionAccount',
      required: true,
      index: true,
    },
    accountCode: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      index: true,
    },
    dayNumber: {
      type: Number,
      required: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      enum: ['PRINCIPAL', 'INTEREST', 'PENALTY'],
      required: true,
    },
    principalAllocationPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestAllocationPaise: {
      type: Number,
      default: 0,
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
    reversedAt: {
      type: Date,
    },
    reversalReason: {
      type: String,
    },
    remarks: {
      type: String,
      default: '',
    },
    recordedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

dailyCollectionPaymentSchema.index({ collectionAccountId: 1, dayNumber: 1 });
dailyCollectionPaymentSchema.index({ collectionAccountId: 1, paymentDate: -1 });
dailyCollectionPaymentSchema.index({ paymentDate: -1, status: 1 });
dailyCollectionPaymentSchema.index({ customerId: 1, paymentDate: -1 });

module.exports = mongoose.model('DailyCollectionPayment', dailyCollectionPaymentSchema);
