const mongoose = require('mongoose');

const calculationConfigurationSchema = new mongoose.Schema(
  {
    configType: {
      type: String,
      enum: ['MONTHLY', 'DAILY', 'MEATER', 'BUSINESS'],
      required: true,
      unique: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    isPendingOwnerConfirmation: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      default: '',
    },
    version: {
      type: Number,
      default: 1,
    },
    updatedBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CalculationConfiguration', calculationConfigurationSchema);
