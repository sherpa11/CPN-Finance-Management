const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Collection = require('../models/Collection');
const Transaction = require('../models/Transaction');
const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const DailyCollectionPayment = require('../models/DailyCollectionPayment');
const ChitMember = require('../models/ChitMember');
const Notification = require('../models/Notification');
const { logAuditEvent } = require('../services/auditService');
const { toRupees, formatINR } = require('../services/calculationEngine');
const { escapeRegex } = require('../utils/sanitize');

// Generate sequential customer ID e.g. CPN-CUST-0001
async function generateCustomerId() {
  const lastCustomer = await Customer.findOne().sort({ customerId: -1 });
  if (!lastCustomer || !lastCustomer.customerId) {
    return 'CPN-CUST-0001';
  }
  const match = lastCustomer.customerId.match(/CPN-CUST-(\d+)/);
  if (match) {
    const nextSeq = parseInt(match[1], 10) + 1;
    return `CPN-CUST-${String(nextSeq).padStart(4, '0')}`;
  }
  return `CPN-CUST-${Date.now().toString().slice(-4)}`;
}

const listCustomers = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 50, fields, minimal } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search && search.trim()) {
      const escaped = escapeRegex(search.trim());
      const searchRegex = new RegExp(escaped, 'i');
      query.$or = [
        { name: searchRegex },
        { mobileNumber: searchRegex },
        { customerId: searchRegex },
        { address: searchRegex },
      ];
    }

    const isMinimal = minimal === 'true' || fields === 'minimal' || fields === 'dropdown';
    let customerQuery = Customer.find(query);

    if (isMinimal) {
      customerQuery = customerQuery.select('customerId name mobileNumber status address');
    }

    const total = await Customer.countDocuments(query);
    const customers = await customerQuery
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      customers,
    });
  } catch (error) {
    next(error);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Fetch customer's loans with lean
    const loans = await Loan.find({ customerId: customer._id }).sort({ createdAt: -1 }).lean();

    // Fetch customer's collections with lean
    const collections = await Collection.find({ customerId: customer._id })
      .sort({ paymentDate: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      customer,
      loans,
      collections,
    });
  } catch (error) {
    next(error);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const { name, mobileNumber, address, notes, registrationDate, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    // Check duplicate mobile number
    const existing = await Customer.findOne({ mobileNumber: mobileNumber.trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A customer with mobile number ${mobileNumber} already exists (${existing.name} - ${existing.customerId}).`,
      });
    }

    const customerId = await generateCustomerId();

    const customer = new Customer({
      customerId,
      name: name.trim(),
      mobileNumber: mobileNumber.trim(),
      address: address ? address.trim() : '',
      notes: notes ? notes.trim() : '',
      registrationDate: registrationDate ? new Date(registrationDate) : new Date(),
      status: status || 'ACTIVE',
    });

    await customer.save();

    await logAuditEvent({
      action: 'CREATE_CUSTOMER',
      entityType: 'CUSTOMER',
      entityId: customer._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      newState: customer.toObject(),
      details: `Created new customer ${customer.name} (${customer.customerId})`,
    });

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      customer,
    });
  } catch (error) {
    next(error);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const { name, mobileNumber, address, notes, status } = req.body;
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const previousState = customer.toObject();

    if (name) customer.name = name.trim();
    if (address !== undefined) customer.address = address.trim();
    if (notes !== undefined) customer.notes = notes.trim();
    if (status) customer.status = status;

    if (mobileNumber && mobileNumber.trim() !== customer.mobileNumber) {
      const duplicate = await Customer.findOne({
        mobileNumber: mobileNumber.trim(),
        _id: { $ne: customer._id },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another customer with mobile ${mobileNumber} already exists.`,
        });
      }
      customer.mobileNumber = mobileNumber.trim();
    }

    // CRITICAL REQUIREMENT: Do not delete or alter financial transactions when updating customer details
    await customer.save();

    await logAuditEvent({
      action: 'EDIT_CUSTOMER',
      entityType: 'CUSTOMER',
      entityId: customer._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      previousState,
      newState: customer.toObject(),
      details: `Updated details for customer ${customer.customerId}`,
    });

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer,
    });
  } catch (error) {
    next(error);
  }
};

const getCustomerStatement = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const loans = await Loan.find({ customerId: customer._id }).sort({ startDate: 1 }).lean();
    const transactions = await Transaction.find({ customerId: customer._id }).sort({ date: 1, createdAt: 1 }).lean();
    const collections = await Collection.find({ customerId: customer._id, status: 'CONFIRMED' }).sort({ paymentDate: 1 }).lean();

    res.json({
      success: true,
      statement: {
        customer,
        generatedAt: new Date(),
        loans,
        transactions,
        collections,
        summary: {
          totalLentRupees: toRupees(customer.totalLentPaise),
          totalPrincipalPaidRupees: toRupees(customer.totalPrincipalPaidPaise),
          totalInterestPaidRupees: toRupees(customer.totalInterestPaidPaise),
          outstandingPrincipalRupees: toRupees(customer.outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(customer.outstandingInterestPaise),
          totalOutstandingRupees: toRupees(customer.outstandingPrincipalPaise + customer.outstandingInterestPaise),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: Inspect all associated financial and transactional dependencies
 */
async function getCustomerFinancialDependencies(customerId) {
  const [
    loansCount,
    collectionsCount,
    transactionsCount,
    dailyAccountsCount,
    dailyPaymentsCount,
    chitMembershipsCount,
  ] = await Promise.all([
    Loan.countDocuments({ customerId }),
    Collection.countDocuments({ customerId }),
    Transaction.countDocuments({ customerId }),
    DailyCollectionAccount.countDocuments({ customerId }),
    DailyCollectionPayment.countDocuments({ customerId }),
    ChitMember.countDocuments({ customerId }),
  ]);

  const totalFinancialRecords =
    loansCount +
    collectionsCount +
    transactionsCount +
    dailyAccountsCount +
    dailyPaymentsCount +
    chitMembershipsCount;

  return {
    loansCount,
    collectionsCount,
    transactionsCount,
    dailyAccountsCount,
    dailyPaymentsCount,
    chitMembershipsCount,
    totalFinancialRecords,
    hasFinancialHistory: totalFinancialRecords > 0,
  };
}

/**
 * Pre-flight eligibility check: Determine if customer can be permanently deleted or must be archived
 */
const checkDeleteEligibility = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer identifier format.' });
    }

    const customer = await Customer.findById(id).lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const deps = await getCustomerFinancialDependencies(customer._id);
    const hasBalanceHistory =
      (customer.totalLentPaise || 0) > 0 ||
      (customer.outstandingPrincipalPaise || 0) > 0 ||
      (customer.activeLoanCount || 0) > 0 ||
      (customer.totalPrincipalPaidPaise || 0) > 0 ||
      (customer.totalInterestPaidPaise || 0) > 0;

    const hasFinancialRecords = deps.hasFinancialHistory || hasBalanceHistory;

    res.json({
      success: true,
      eligibleForPermanentDelete: !hasFinancialRecords,
      hasFinancialRecords,
      canDeactivate: true,
      dependencies: deps,
      customer: {
        _id: customer._id,
        customerId: customer.customerId,
        name: customer.name,
        mobileNumber: customer.mobileNumber,
        status: customer.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Safe customer deletion / archiving
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const action = req.body?.action || req.query?.action;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer identifier format.' });
    }

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    // 1. Check if user requested deactivation / archiving
    if (action === 'deactivate') {
      const previousState = customer.toObject();
      customer.status = 'INACTIVE';
      await customer.save();

      await logAuditEvent({
        action: 'DEACTIVATE_CUSTOMER',
        entityType: 'CUSTOMER',
        entityId: customer._id,
        performedBy: req.user?.username || 'system',
        ipAddress: req.ip,
        previousState,
        newState: customer.toObject(),
        details: `Deactivated and archived customer ${customer.name} (${customer.customerId}) preserving all financial and ledger history`,
      });

      return res.json({
        success: true,
        message: `Customer ${customer.name} (${customer.customerId}) has been archived and set to INACTIVE. All financial ledgers and reports remain 100% intact.`,
        deactivated: true,
        customer,
      });
    }

    // 2. Perform strict dependency checks before permanent deletion
    const deps = await getCustomerFinancialDependencies(customer._id);
    const hasBalanceHistory =
      (customer.totalLentPaise || 0) > 0 ||
      (customer.outstandingPrincipalPaise || 0) > 0 ||
      (customer.activeLoanCount || 0) > 0 ||
      (customer.totalPrincipalPaidPaise || 0) > 0 ||
      (customer.totalInterestPaidPaise || 0) > 0;

    if (deps.hasFinancialHistory || hasBalanceHistory) {
      return res.status(400).json({
        success: false,
        hasFinancialRecords: true,
        canDeactivate: true,
        message: `Cannot permanently delete customer ${customer.name} (${customer.customerId}) because associated financial records exist (${deps.loansCount} loans, ${deps.collectionsCount} collections, ${deps.dailyAccountsCount} daily collection accounts, ${deps.chitMembershipsCount} chit memberships). Under financial regulations, complete audit trails and ledger integrity must be preserved. You can archive/deactivate this customer instead.`,
        dependencies: deps,
      });
    }

    // 3. Customer has zero financial records - safe to delete permanently
    const previousState = customer.toObject();

    // Safely remove any non-financial notifications for this customer
    await Notification.deleteMany({ customerId: customer._id });

    // Permanently remove customer
    await Customer.findByIdAndDelete(customer._id);

    await logAuditEvent({
      action: 'DELETE_CUSTOMER',
      entityType: 'CUSTOMER',
      entityId: customer._id,
      performedBy: req.user?.username || 'system',
      ipAddress: req.ip,
      previousState,
      details: `Permanently deleted customer ${customer.name} (${customer.customerId}) with zero associated financial records`,
    });

    res.json({
      success: true,
      message: `Customer ${customer.name} (${customer.customerId}) was permanently deleted successfully.`,
      deleted: true,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerStatement,
  checkDeleteEligibility,
  deleteCustomer,
};
