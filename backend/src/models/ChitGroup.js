const mongoose = require('mongoose');

const ChitScheduleEntrySchema = new mongoose.Schema({
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 20,
  },
  chitAmountPaise: {
    type: Number,
    required: true,
    min: 0,
  },
  instalmentPaise: {
    type: Number,
    required: true,
    min: 0,
  },
  kasarPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  payoutAmountPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  hasPayout: {
    type: Boolean,
    default: true,
  },
  payoutRecipientMemberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChitMember',
    default: null,
  },
  payoutRecipientMemberNumber: {
    type: Number,
    default: null,
  },
  payoutRecipientName: {
    type: String,
    default: '',
  },
  payoutDate: {
    type: Date,
    default: null,
  },
  payoutStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'NO_PAYOUT'],
    default: 'PENDING',
  },
  collectionStatus: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'COMPLETED'],
    default: 'PENDING',
  },
  totalCollectedForMonthPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  dueDate: {
    type: Date,
    default: null,
  },
}, { _id: false });

const ChitGroupSchema = new mongoose.Schema({
  chitId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['5_LAKH', '10_LAKH', '20_LAKH'],
  },
  totalValuePaise: {
    type: Number,
    required: true,
    min: 0,
  },
  monthlyChitAmountPaise: {
    type: Number,
    required: true,
    min: 0,
  },
  maxMembers: {
    type: Number,
    default: 20,
    immutable: true,
  },
  durationMonths: {
    type: Number,
    default: 20,
    immutable: true,
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  firstInstalmentDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    default: null,
  },
  currentMonth: {
    type: Number,
    default: 1,
    min: 1,
    max: 20,
  },
  status: {
    type: String,
    enum: ['FORMING', 'ACTIVE', 'COMPLETED'],
    default: 'FORMING',
  },
  isScheduleApproved: {
    type: Boolean,
    default: true,
  },
  memberCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 20,
  },
  totalInstalmentExpectedPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalCollectedPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalPayoutsPaise: {
    type: Number,
    default: 0,
    min: 0,
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
  schedule: [ChitScheduleEntrySchema],
}, {
  timestamps: true,
});

ChitGroupSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('ChitGroup', ChitGroupSchema);
