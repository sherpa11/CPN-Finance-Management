const mongoose = require('mongoose');

const irupuOpeningBalanceSchema = new mongoose.Schema(
  {
    openingBalanceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    remarks: {
      type: String,
      default: 'Initial physical cash opening balance',
      trim: true,
    },
    setBy: {
      type: String,
      default: 'admin',
    },
    isCurrent: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

irupuOpeningBalanceSchema.index({ isCurrent: 1 });
irupuOpeningBalanceSchema.index({ effectiveDate: -1 });

module.exports = mongoose.model('IrupuOpeningBalance', irupuOpeningBalanceSchema);
