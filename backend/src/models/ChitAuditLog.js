const mongoose = require('mongoose');

const ChitAuditLogSchema = new mongoose.Schema({
  chitGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChitGroup',
    index: true,
  },
  chitId: {
    type: String,
    index: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CHIT_GROUP_CREATED',
      'CHIT_SCHEDULE_UPDATED',
      'CHIT_SCHEDULE_APPROVED',
      'MEMBER_ADDED',
      'MEMBER_UPDATED',
      'COLLECTION_RECORDED',
      'COLLECTION_REVERSED',
      'PAYOUT_RECORDED',
      'PAYOUT_REVERSED',
      'CHIT_STATUS_CHANGED',
    ],
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  performedBy: {
    type: String,
    default: 'cpnraja',
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

ChitAuditLogSchema.index({ chitGroupId: 1, timestamp: -1 });

module.exports = mongoose.model('ChitAuditLog', ChitAuditLogSchema);
