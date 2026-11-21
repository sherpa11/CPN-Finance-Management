const mongoose = require('mongoose');

const ChitPayoutSchema = new mongoose.Schema({
  payoutVoucherNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  chitGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChitGroup',
    required: true,
    index: true,
  },
  chitId: {
    type: String,
    required: true,
    index: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
  },
  hasPayout: {
    type: Boolean,
    required: true,
    default: true,
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChitMember',
    default: null,
  },
  memberNumber: {
    type: Number,
    default: null,
  },
  memberName: {
    type: String,
    default: '',
    trim: true,
  },
  payoutAmountPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  kasarPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  payoutDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'NO_PAYOUT'],
    default: 'CASH',
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
  recordedBy: {
    type: String,
    default: 'cpnraja',
  },
  isReversed: {
    type: Boolean,
    default: false,
    index: true,
  },
  reversedAt: {
    type: Date,
    default: null,
  },
  reversedReason: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

ChitPayoutSchema.index({ chitGroupId: 1, month: 1 });

module.exports = mongoose.model('ChitPayout', ChitPayoutSchema);
