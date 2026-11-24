const mongoose = require('mongoose');

const irupuInvestmentSchema = new mongoose.Schema(
  {
    investmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVERSED'],
      default: 'ACTIVE',
      index: true,
    },
    reversalReason: {
      type: String,
      default: '',
    },
    reversedAt: {
      type: Date,
    },
    reversedBy: {
      type: String,
    },
    createdBy: {
      type: String,
      default: 'admin',
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

irupuInvestmentSchema.index({ date: -1, status: 1 });

module.exports = mongoose.model('IrupuInvestment', irupuInvestmentSchema);
