const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
      index: true,
    },
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['LOAN_DISBURSEMENT', 'INTEREST_ACCRUAL', 'COLLECTION', 'RENEWAL_INTEREST', 'REVERSAL', 'ADJUSTMENT', 'PENALTY_ASSESSMENT'],
      required: true,
      index: true,
    },
    // Accounting Debits / Credits in Paise
    principalDebitPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    principalCreditPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestDebitPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    interestCreditPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyDebitPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyCreditPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Running Balances after this transaction
    balancePrincipalPaise: {
      type: Number,
      required: true,
    },
    balanceInterestPaise: {
      type: Number,
      required: true,
    },
    balancePenaltyPaise: {
      type: Number,
      default: 0,
    },
    balanceTotalPaise: {
      type: Number,
      required: true,
    },
    remarks: {
      type: String,
      default: '',
    },
    referenceId: {
      type: String,
      default: '',
    },
    performedBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ loanId: 1, date: 1, createdAt: 1 });
transactionSchema.index({ customerId: 1, date: 1, createdAt: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
