const mongoose = require('mongoose');

const moiSeerPersonSchema = new mongoose.Schema(
  {
    personId: {
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
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    village: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    // Running aggregates for fast lookup & reporting
    totalMoneyPaise: {
      type: Number,
      default: 0,
    },
    totalMaterialCount: {
      type: Number,
      default: 0,
    },
    totalContributionsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

moiSeerPersonSchema.index({ district: 1, village: 1 });
moiSeerPersonSchema.index({ name: 'text', village: 'text', district: 'text' });

module.exports = mongoose.model('MoiSeerPerson', moiSeerPersonSchema);
