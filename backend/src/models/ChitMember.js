const mongoose = require('mongoose');

const ChitMemberSchema = new mongoose.Schema({
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
  memberNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    default: '',
    trim: true,
  },
  district: {
    type: String,
    default: '',
    trim: true,
  },
  village: {
    type: String,
    default: '',
    trim: true,
  },
  joiningDate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'REPLACED'],
    default: 'ACTIVE',
  },
  hasReceivedPayout: {
    type: Boolean,
    default: false,
  },
  payoutMonth: {
    type: Number,
    default: null,
  },
  payoutAmountPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalPaidPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
}, {
  timestamps: true,
});

// Ensure a member number 1-20 is unique within a chit group
ChitMemberSchema.index({ chitGroupId: 1, memberNumber: 1 }, { unique: true });
ChitMemberSchema.index({ chitGroupId: 1, status: 1 });

module.exports = mongoose.model('ChitMember', ChitMemberSchema);
