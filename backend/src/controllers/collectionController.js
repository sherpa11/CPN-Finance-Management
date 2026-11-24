const Collection = require('../models/Collection');
const Loan = require('../models/Loan');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const { logAuditEvent } = require('../services/auditService');
const { runInTransaction } = require('../services/transactionHelper');
const {
  toPaise,
  toRupees,
  formatINR,
  validateAndAllocatePayment,
} = require('../services/calculationEngine');
const { evaluateDueNotifications } = require('../services/notificationService');
const { invalidateDashboardCache } = require('./dashboardController');
const CONSTANTS = require('../config/constants');

// Generate unique sequential Collection ID e.g. CPN-COL-0001
async function generateCollectionId() {
  const lastCol = await Collection.findOne().sort({ collectionId: -1 });
  if (!lastCol || !lastCol.collectionId) {
    return 'CPN-COL-0001';
  }
  const match = lastCol.collectionId.match(/CPN-COL-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-COL-${String(nextSeq).padStart(4, '0')}`;
  }
  return `CPN-COL-${Date.now().toString().slice(-4)}`;
}

async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const lastCol = await Collection.findOne({ receiptNumber: new RegExp(`RCP-${year}-`) }).sort({ receiptNumber: -1 });
  if (!lastCol || !lastCol.receiptNumber) {
    return `RCP-${year}-0001`;
  }
  const match = lastCol.receiptNumber.match(new RegExp(`RCP-${year}-(\\d+)`));
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `RCP-${year}-${String(nextSeq).padStart(4, '0')}`;
  }
  return `RCP-${year}-${Date.now().toString().slice(-4)}`;
}

async function generateTransactionId() {
  const lastTxn = await Transaction.findOne().sort({ transactionId: -1 });
  if (!lastTxn || !lastTxn.transactionId) {
    return 'CPN-TXN-00001';
  }
  const match = lastTxn.transactionId.match(/CPN-TXN-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-TXN-${String(nextSeq).padStart(5, '0')}`;
  }
  return `CPN-TXN-${Date.now().toString().slice(-5)}`;
}

/**
 * Pre-payment calculation breakdown preview
 */
const previewCollection = async (req, res, next) => {
  try {
    const { loanId, paymentAmount, principalAllocation, interestAllocation } = req.body;

    if (!loanId || !paymentAmount) {
      return res.status(400).json({ success: false, message: 'Loan ID and payment amount are required' });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan account not found' });
    }

    const totalPaymentPaise = toPaise(paymentAmount);
    const pAllocPaise = toPaise(principalAllocation || 0);
    const iAllocPaise = toPaise(interestAllocation || 0);

    const breakdown = validateAndAllocatePayment({
      currentOutstandingPrincipalPaise: loan.outstandingPrincipalPaise,
      currentOutstandingInterestPaise: loan.outstandingInterestPaise,
      totalPaymentPaise,
      principalAllocationPaise: pAllocPaise,
      interestAllocationPaise: iAllocPaise,
    });

    res.json({
      success: true,
      breakdown: {
        previousOutstandingPrincipalRupees: toRupees(breakdown.previousOutstandingPrincipalPaise),
        previousOutstandingInterestRupees: toRupees(breakdown.previousOutstandingInterestPaise),
        previousTotalOutstandingRupees: toRupees(breakdown.previousOutstandingPrincipalPaise + breakdown.previousOutstandingInterestPaise),
        amountReceivedRupees: toRupees(breakdown.totalPaymentPaise),
        principalAllocationRupees: toRupees(breakdown.principalAllocationPaise),
        interestAllocationRupees: toRupees(breakdown.interestAllocationPaise),
        remainingPrincipalRupees: toRupees(breakdown.remainingPrincipalPaise),
        remainingInterestRupees: toRupees(breakdown.remainingInterestPaise),
        totalRemainingRupees: toRupees(breakdown.totalOutstandingPaise),
        isFullySettled: breakdown.isFullySettled,
      },
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Record Collection with Idempotency and Atomic Execution
 */
const recordCollection = async (req, res, next) => {
  try {
    const {
      loanId,
      paymentDate,
      paymentAmount,
      principalAllocation,
      interestAllocation,
      paymentMethod,
      remarks,
      idempotencyKey,
    } = req.body;

    if (!loanId || !paymentAmount || paymentMethod === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Loan ID, payment amount, and payment method are required.',
      });
    }

    // Idempotency check to prevent duplicate payments
    if (idempotencyKey) {
      const existing = await Collection.findOne({ idempotencyKey });
      if (existing) {
        return res.json({
          success: true,
          message: 'Payment already processed with this transaction token (duplicate prevented).',
          collection: existing,
          isDuplicateSubmission: true,
        });
      }
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan account not found' });
    }

    if (loan.status === CONSTANTS.LOAN_STATUS.SETTLED || loan.status === CONSTANTS.LOAN_STATUS.CLOSED) {
      return res.status(400).json({
        success: false,
        message: 'Cannot record collection against a settled or closed loan account.',
      });
    }

    const customer = await Customer.findById(loan.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer account not found' });
    }

    const totalPaymentPaise = toPaise(paymentAmount);
    const pAllocPaise = toPaise(principalAllocation || 0);
    const iAllocPaise = toPaise(interestAllocation || 0);

    // Validate allocations against loan balances
    const breakdown = validateAndAllocatePayment({
      currentOutstandingPrincipalPaise: loan.outstandingPrincipalPaise,
      currentOutstandingInterestPaise: loan.outstandingInterestPaise,
      totalPaymentPaise,
      principalAllocationPaise: pAllocPaise,
      interestAllocationPaise: iAllocPaise,
    });

    const collectionId = await generateCollectionId();
    const receiptNumber = await generateReceiptNumber();
    const txnId = await generateTransactionId();

    const result = await runInTransaction(async (session) => {
      // 1. Create Collection Record
      const collection = new Collection({
        collectionId,
        receiptNumber,
        customerId: customer._id,
        loanId: loan._id,
        loanCode: loan.loanId,
        customerName: customer.name,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        totalAmountPaise: totalPaymentPaise,
        principalAllocationPaise: breakdown.principalAllocationPaise,
        interestAllocationPaise: breakdown.interestAllocationPaise,
        paymentMethod: paymentMethod || 'CASH',
        idempotencyKey: idempotencyKey || undefined,
        status: CONSTANTS.COLLECTION_STATUS.CONFIRMED,
        previousOutstandingPrincipalPaise: breakdown.previousOutstandingPrincipalPaise,
        previousOutstandingInterestPaise: breakdown.previousOutstandingInterestPaise,
        remainingPrincipalPaise: breakdown.remainingPrincipalPaise,
        remainingInterestPaise: breakdown.remainingInterestPaise,
        remarks: remarks || '',
        collectedBy: req.user.username,
      });

      await collection.save(session ? { session } : undefined);

      // 2. Create Ledger Transaction Entry
      const txn = new Transaction({
        transactionId: txnId,
        customerId: customer._id,
        loanId: loan._id,
        collectionId: collection._id,
        date: collection.paymentDate,
        type: CONSTANTS.TRANSACTION_TYPES.COLLECTION,
        principalDebitPaise: 0,
        principalCreditPaise: breakdown.principalAllocationPaise,
        interestDebitPaise: 0,
        interestCreditPaise: breakdown.interestAllocationPaise,
        balancePrincipalPaise: breakdown.remainingPrincipalPaise,
        balanceInterestPaise: breakdown.remainingInterestPaise,
        balanceTotalPaise: breakdown.totalOutstandingPaise,
        remarks: `Collection [${collection.receiptNumber}] via ${collection.paymentMethod}: Principal ₹${toRupees(breakdown.principalAllocationPaise)}, Interest ₹${toRupees(breakdown.interestAllocationPaise)}`,
        referenceId: collection.receiptNumber,
        performedBy: req.user.username,
      });

      await txn.save(session ? { session } : undefined);

      // 3. Update Loan Balances
      loan.outstandingPrincipalPaise = breakdown.remainingPrincipalPaise;
      loan.outstandingInterestPaise = breakdown.remainingInterestPaise;
      loan.totalPrincipalPaidPaise = (loan.totalPrincipalPaidPaise || 0) + breakdown.principalAllocationPaise;
      loan.totalInterestPaidPaise = (loan.totalInterestPaidPaise || 0) + breakdown.interestAllocationPaise;

      if (breakdown.isFullySettled) {
        loan.status = CONSTANTS.LOAN_STATUS.SETTLED;
        loan.settledDate = new Date();
      }

      await loan.save(session ? { session } : undefined);

      // 4. Update Customer Aggregates
      customer.outstandingPrincipalPaise = Math.max(
        0,
        (customer.outstandingPrincipalPaise || 0) - breakdown.principalAllocationPaise
      );
      customer.outstandingInterestPaise = Math.max(
        0,
        (customer.outstandingInterestPaise || 0) - breakdown.interestAllocationPaise
      );
      customer.totalPrincipalPaidPaise =
        (customer.totalPrincipalPaidPaise || 0) + breakdown.principalAllocationPaise;
      customer.totalInterestPaidPaise =
        (customer.totalInterestPaidPaise || 0) + breakdown.interestAllocationPaise;

      if (breakdown.isFullySettled && customer.activeLoanCount > 0) {
        customer.activeLoanCount -= 1;
      }

      await customer.save(session ? { session } : undefined);

      return collection;
    });

    // 5. Audit Log
    await logAuditEvent({
      action: 'RECORD_COLLECTION',
      entityType: 'COLLECTION',
      entityId: result._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      newState: result.toObject(),
      details: `Recorded collection ${result.receiptNumber} of ₹${toRupees(totalPaymentPaise)} for loan ${loan.loanId}`,
    });

    // 6. Trigger Notification Recalculation
    evaluateDueNotifications().catch((err) => {
      console.error('[Notification Trigger Error]', err.message);
    });

    invalidateDashboardCache();

    res.status(201).json({
      success: true,
      message: `Payment receipt ${result.receiptNumber} recorded successfully`,
      collection: result,
      remainingSummary: {
        remainingPrincipalRupees: toRupees(breakdown.remainingPrincipalPaise),
        remainingInterestRupees: toRupees(breakdown.remainingInterestPaise),
        totalRemainingRupees: toRupees(breakdown.totalOutstandingPaise),
        isFullySettled: breakdown.isFullySettled,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reverse or Delete Collection
 * Requirement: Confirmed payment records must NEVER be silently deleted.
 * Reversing/deleting atomically restores loan balances, customer balances, 
 * inserts compensatory ledger entries, and logs full audit history.
 */
const reverseCollection = async (req, res, next) => {
  try {
    const isDelete = req.method === 'DELETE' || req.query.action === 'delete';
    const reason = (req.body && req.body.reason && req.body.reason.trim()) || 
      (isDelete ? `Deleted by admin (${req.user?.username || 'admin'})` : 'Payment reversed by admin');
    const collection = await Collection.findById(req.params.id);

    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection receipt not found' });
    }

    if (collection.status === CONSTANTS.COLLECTION_STATUS.REVERSED) {
      return res.status(400).json({
        success: false,
        message: 'This collection receipt is already reversed/deleted.',
      });
    }

    const loan = await Loan.findById(collection.loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Associated loan account not found' });
    }

    const customer = await Customer.findById(collection.customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Associated customer account not found' });
    }

    const reversalTxnId = await generateTransactionId();

    const result = await runInTransaction(async (session) => {
      // 1. Mark collection as REVERSED
      collection.status = CONSTANTS.COLLECTION_STATUS.REVERSED;
      collection.reversal = {
        reversedAt: new Date(),
        reversedBy: req.user.username,
        reason: reason.trim(),
        reversalTransactionId: reversalTxnId,
      };

      await collection.save(session ? { session } : undefined);

      // 2. Restore loan balances
      loan.outstandingPrincipalPaise += collection.principalAllocationPaise;
      loan.outstandingInterestPaise += collection.interestAllocationPaise;
      loan.totalPrincipalPaidPaise = Math.max(0, loan.totalPrincipalPaidPaise - collection.principalAllocationPaise);
      loan.totalInterestPaidPaise = Math.max(0, loan.totalInterestPaidPaise - collection.interestAllocationPaise);

      if (loan.status === CONSTANTS.LOAN_STATUS.SETTLED) {
        loan.status = CONSTANTS.LOAN_STATUS.ACTIVE;
        loan.settledDate = undefined;
      }

      await loan.save(session ? { session } : undefined);

      // 3. Restore customer aggregates
      customer.outstandingPrincipalPaise += collection.principalAllocationPaise;
      customer.outstandingInterestPaise += collection.interestAllocationPaise;
      customer.totalPrincipalPaidPaise = Math.max(0, customer.totalPrincipalPaidPaise - collection.principalAllocationPaise);
      customer.totalInterestPaidPaise = Math.max(0, customer.totalInterestPaidPaise - collection.interestAllocationPaise);

      if (loan.status === CONSTANTS.LOAN_STATUS.ACTIVE) {
        customer.activeLoanCount += 1;
      }

      await customer.save(session ? { session } : undefined);

      // 4. Create Reversal Ledger Transaction
      const reversalTxn = new Transaction({
        transactionId: reversalTxnId,
        customerId: customer._id,
        loanId: loan._id,
        collectionId: collection._id,
        date: new Date(),
        type: CONSTANTS.TRANSACTION_TYPES.REVERSAL,
        principalDebitPaise: collection.principalAllocationPaise, // Re-debit
        principalCreditPaise: 0,
        interestDebitPaise: collection.interestAllocationPaise, // Re-debit
        interestCreditPaise: 0,
        balancePrincipalPaise: loan.outstandingPrincipalPaise,
        balanceInterestPaise: loan.outstandingInterestPaise,
        balanceTotalPaise: loan.outstandingPrincipalPaise + loan.outstandingInterestPaise,
        remarks: `${isDelete ? 'Deletion / Reversal' : 'Reversal'} of Receipt [${collection.receiptNumber}]. Reason: ${reason}`,
        referenceId: collection.receiptNumber,
        performedBy: req.user.username,
      });

      await reversalTxn.save(session ? { session } : undefined);

      return collection;
    });

    // 5. Audit Log
    await logAuditEvent({
      action: isDelete ? 'DELETE_COLLECTION' : 'REVERSE_COLLECTION',
      entityType: 'COLLECTION',
      entityId: result._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      details: `${isDelete ? 'Deleted' : 'Reversed'} collection receipt ${result.receiptNumber} of ₹${toRupees(result.totalAmountPaise)}. Reason: ${reason}`,
    });

    // 6. Trigger Notification Recalculation
    evaluateDueNotifications().catch((err) => {
      console.error('[Notification Trigger Error]', err.message);
    });

    invalidateDashboardCache();

    res.json({
      success: true,
      message: `Collection ${result.receiptNumber} successfully ${isDelete ? 'deleted and reversed' : 'reversed'} with compensating audit ledger entries`,
      collection: result,
      deleted: isDelete,
    });
  } catch (error) {
    next(error);
  }
};

const deleteCollection = async (req, res, next) => {
  return reverseCollection(req, res, next);
};

/**
 * List Collections with filtering
 */
const listCollections = async (req, res, next) => {
  try {
    const { customerId, loanId, paymentMethod, status, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = {};

    if (customerId) query.customerId = customerId;
    if (loanId) query.loanId = loanId;
    if (paymentMethod && paymentMethod !== 'ALL') query.paymentMethod = paymentMethod;
    if (status && status !== 'ALL') query.status = status;

    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.paymentDate.$lte = end;
      }
    }

    const total = await Collection.countDocuments(query);
    const collections = await Collection.find(query)
      .populate('customerId', 'name customerId mobileNumber')
      .populate('loanId', 'loanId vattiType')
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      collections,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Receipt Details for Print / View
 */
const getReceipt = async (req, res, next) => {
  try {
    const collection = await Collection.findById(req.params.id)
      .populate('customerId')
      .populate('loanId')
      .lean();

    if (!collection) {
      return res.status(404).json({ success: false, message: 'Collection receipt not found' });
    }

    res.json({
      success: true,
      receipt: {
        receiptNumber: collection.receiptNumber,
        collectionId: collection.collectionId,
        paymentDate: collection.paymentDate,
        customerName: collection.customerName,
        customerMobile: collection.customerId?.mobileNumber,
        customerAddress: collection.customerId?.address,
        customerId: collection.customerId?.customerId,
        loanCode: collection.loanCode,
        financeType: collection.loanId?.vattiType,
        vattiType: collection.loanId?.vattiType,
        totalAmountRupees: toRupees(collection.totalAmountPaise),
        principalAllocationRupees: toRupees(collection.principalAllocationPaise),
        interestAllocationRupees: toRupees(collection.interestAllocationPaise),
        paymentMethod: collection.paymentMethod,
        status: collection.status,
        previousOutstandingPrincipalRupees: toRupees(collection.previousOutstandingPrincipalPaise),
        previousOutstandingInterestRupees: toRupees(collection.previousOutstandingInterestPaise),
        remainingPrincipalRupees: toRupees(collection.remainingPrincipalPaise),
        remainingInterestRupees: toRupees(collection.remainingInterestPaise),
        totalRemainingRupees: toRupees(collection.remainingPrincipalPaise + collection.remainingInterestPaise),
        remarks: collection.remarks,
        collectedBy: collection.collectedBy,
        businessName: CONSTANTS.APP_NAME,
        businessOwner: CONSTANTS.BUSINESS_OWNER,
        reversal: collection.reversal,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  previewCollection,
  recordCollection,
  reverseCollection,
  deleteCollection,
  listCollections,
  getReceipt,
};
