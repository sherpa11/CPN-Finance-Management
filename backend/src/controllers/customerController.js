const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Collection = require('../models/Collection');
const Transaction = require('../models/Transaction');
const { logAuditEvent } = require('../services/auditService');
const { toRupees, formatINR } = require('../services/calculationEngine');

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
    const { search, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { mobileNumber: searchRegex },
        { customerId: searchRegex },
        { address: searchRegex },
      ];
    }

    const total = await Customer.countDocuments(query);
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

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
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Fetch customer's loans
    const loans = await Loan.find({ customerId: customer._id }).sort({ createdAt: -1 });

    // Fetch customer's collections
    const collections = await Collection.find({ customerId: customer._id })
      .sort({ paymentDate: -1 })
      .limit(50);

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
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const loans = await Loan.find({ customerId: customer._id }).sort({ startDate: 1 });
    const transactions = await Transaction.find({ customerId: customer._id }).sort({ date: 1, createdAt: 1 });
    const collections = await Collection.find({ customerId: customer._id, status: 'CONFIRMED' }).sort({ paymentDate: 1 });

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

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  getCustomerStatement,
};
