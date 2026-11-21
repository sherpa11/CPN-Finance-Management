const mongoose = require('mongoose');

const ChitCollectionSchema = new mongoose.Schema({
  receiptNumber: {
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
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChitMember',
    required: true,
    index: true,
  },
  memberNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
  },
  memberName: {
    type: String,
    required: true,
    trim: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
  },
  expectedAmountPaise: {
    type: Number,
    required: true,
    min: 0,
  },
  amountPaidPaise: {
    type: Number,
    required: true,
    min: 1,
  },
  paymentDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  paymentMethod: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'],
    default: 'CASH',
  },
  status: {
    type: String,
    enum: ['PAID', 'PARTIAL'],
    required: true,
  },
  notes: {
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

ChitCollectionSchema.index({ chitGroupId: 1, month: 1, memberNumber: 1 });
ChitCollectionSchema.index({ chitGroupId: 1, isReversed: 1 });
ChitCollectionSchema.index({ chitMemberId: 1, paymentDate: -1 });
ChitCollectionSchema.index({ paymentDate: -1 });

module.exports = mongoose.model('ChitCollection', ChitCollectionSchema);
