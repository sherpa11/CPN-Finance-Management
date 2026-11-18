const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
    // Historical financial aggregates (stored in integer paise)
    totalLentPaise: {
      type: Number,
      default: 0,
    },
    totalPrincipalPaidPaise: {
      type: Number,
      default: 0,
    },
    totalInterestPaidPaise: {
      type: Number,
      default: 0,
    },
    outstandingPrincipalPaise: {
      type: Number,
      default: 0,
    },
    outstandingInterestPaise: {
      type: Number,
      default: 0,
    },
    activeLoanCount: {
      type: Number,
      default: 0,
    },
    totalLoanCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

customerSchema.index({ name: 'text', mobileNumber: 'text', customerId: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
