const mongoose = require('mongoose');

const moiSeerContributionSchema = new mongoose.Schema(
  {
    contributionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MoiSeerPerson',
      required: true,
      index: true,
    },
    personCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    personName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    contributionDate: {
      type: Date,
      required: true,
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
    contributionType: {
      type: String,
      enum: ['MONEY', 'MATERIAL'],
      required: true,
      index: true,
    },
    // Money contribution (integer paise + calculated rupees)
    amountPaise: {
      type: Number,
      default: 0,
    },
    amountRupees: {
      type: Number,
      default: 0,
    },
    // Material contribution
    materialName: {
      type: String,
      trim: true,
      default: '',
    },
    quantity: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      default: 'cpnraja',
    },
  },
  {
    timestamps: true,
  }
);

// Compound and text indexes for fast filtering and searching
moiSeerContributionSchema.index({ personId: 1, contributionDate: -1 });
moiSeerContributionSchema.index({ contributionDate: -1, contributionType: 1 });
moiSeerContributionSchema.index({ district: 1, village: 1 });
moiSeerContributionSchema.index({ materialName: 1 });
moiSeerContributionSchema.index({
  personName: 'text',
  materialName: 'text',
  village: 'text',
  district: 'text',
  description: 'text',
});

module.exports = mongoose.model('MoiSeerContribution', moiSeerContributionSchema);
