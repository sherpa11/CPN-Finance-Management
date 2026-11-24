const IrupuInvestment = require('../models/IrupuInvestment');
const IrupuOutflow = require('../models/IrupuOutflow');
const IrupuOpeningBalance = require('../models/IrupuOpeningBalance');
const { logAuditEvent } = require('../services/auditService');
const {
  generateInvestmentId,
  generateOutflowId,
  generateOpeningBalanceId,
  getIrupuSummary,
  getCurrentOpeningBalance,
} = require('../services/irupuService');
const { toPaise, toRupees } = require('../services/calculationEngine');

/**
 * Get Irupu Cash In Hand Summary & Digital Cash Register
 * GET /api/irupu/summary
 */
const getSummary = async (req, res, next) => {
  try {
    const { period, startDate, endDate } = req.query;
    const summary = await getIrupuSummary({ period, startDate, endDate });
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
};

/**
 * List Investments
 * GET /api/irupu/investments
 */
const listInvestments = async (req, res, next) => {
  try {
    const { status, limit = 100 } = req.query;
    const filter = {};
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const investments = await IrupuInvestment.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    const formatted = investments.map((inv) => ({
      ...inv,
      amountRupees: toRupees(inv.amountPaise),
    }));

    return res.json({
      success: true,
      investments: formatted,
      totalCount: formatted.length,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Add Manual Investment
 * POST /api/irupu/investments
 */
const addInvestment = async (req, res, next) => {
  try {
    const { amount, date, description, referenceNumber } = req.body;

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid positive investment amount is required.',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Investment description / remarks is required.',
      });
    }

    const amountPaise = toPaise(amountNum);
    const investmentId = await generateInvestmentId();
    const invDate = date ? new Date(date) : new Date();

    const investment = new IrupuInvestment({
      investmentId,
      amountPaise,
      date: invDate,
      description: description.trim(),
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
      status: 'ACTIVE',
      createdBy: req.user?.username || 'admin',
    });

    await investment.save();

    await logAuditEvent({
      action: 'IRUPU_INVESTMENT_ADD',
      entityType: 'IRUPU_INVESTMENT',
      entityId: investmentId,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      newState: {
        investmentId,
        amountRupees: amountNum,
        amountPaise,
        date: invDate,
        description: description.trim(),
      },
      details: `Added manual investment of ₹${amountNum} (${investmentId})`,
    });

    return res.status(201).json({
      success: true,
      message: `Investment of ₹${amountNum.toLocaleString('en-IN')} added successfully to Cash in Hand!`,
      investment: {
        ...investment.toObject(),
        amountRupees: toRupees(amountPaise),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Reverse Investment
 * POST /api/irupu/investments/:id/reverse
 */
const reverseInvestment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reversal reason is required.',
      });
    }

    const investment = await IrupuInvestment.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { investmentId: id }],
    });

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment record not found.',
      });
    }

    if (investment.status === 'REVERSED') {
      return res.status(400).json({
        success: false,
        message: 'This investment has already been reversed.',
      });
    }

    const previousState = { ...investment.toObject() };

    investment.status = 'REVERSED';
    investment.reversalReason = reason.trim();
    investment.reversedAt = new Date();
    investment.reversedBy = req.user?.username || 'admin';

    await investment.save();

    await logAuditEvent({
      action: 'IRUPU_INVESTMENT_REVERSE',
      entityType: 'IRUPU_INVESTMENT',
      entityId: investment.investmentId,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      previousState,
      newState: investment.toObject(),
      details: `Reversed investment ${investment.investmentId} (₹${toRupees(investment.amountPaise)}). Reason: ${reason.trim()}`,
    });

    return res.json({
      success: true,
      message: `Investment ${investment.investmentId} reversed successfully. Cash in hand has been updated.`,
      investment: {
        ...investment.toObject(),
        amountRupees: toRupees(investment.amountPaise),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * List Cash Outflows
 * GET /api/irupu/outflows
 */
const listOutflows = async (req, res, next) => {
  try {
    const { category, status, limit = 100 } = req.query;
    const filter = {};
    if (category && category !== 'ALL') {
      filter.category = category;
    }
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const outflows = await IrupuOutflow.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    const formatted = outflows.map((out) => ({
      ...out,
      amountRupees: toRupees(out.amountPaise),
    }));

    return res.json({
      success: true,
      outflows: formatted,
      totalCount: formatted.length,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Add Manual Cash Outflow (Expense / Withdrawal / Other)
 * POST /api/irupu/outflows
 */
const addOutflow = async (req, res, next) => {
  try {
    const { amount, date, category = 'EXPENSE', description, referenceNumber } = req.body;

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid positive outflow amount is required.',
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Outflow description / remarks is required.',
      });
    }

    const validCategories = ['EXPENSE', 'WITHDRAWAL', 'OTHER'];
    const validCat = validCategories.includes(category) ? category : 'EXPENSE';

    const amountPaise = toPaise(amountNum);
    const outflowId = await generateOutflowId();
    const outDate = date ? new Date(date) : new Date();

    const outflow = new IrupuOutflow({
      outflowId,
      amountPaise,
      date: outDate,
      category: validCat,
      description: description.trim(),
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
      status: 'ACTIVE',
      createdBy: req.user?.username || 'admin',
    });

    await outflow.save();

    await logAuditEvent({
      action: 'IRUPU_OUTFLOW_ADD',
      entityType: 'IRUPU_OUTFLOW',
      entityId: outflowId,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      newState: {
        outflowId,
        amountRupees: amountNum,
        amountPaise,
        category: validCat,
        date: outDate,
        description: description.trim(),
      },
      details: `Added cash outflow [${validCat}] of ₹${amountNum} (${outflowId})`,
    });

    return res.status(201).json({
      success: true,
      message: `Cash outflow of ₹${amountNum.toLocaleString('en-IN')} recorded successfully!`,
      outflow: {
        ...outflow.toObject(),
        amountRupees: toRupees(amountPaise),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Reverse Cash Outflow
 * POST /api/irupu/outflows/:id/reverse
 */
const reverseOutflow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reversal reason is required.',
      });
    }

    const outflow = await IrupuOutflow.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { outflowId: id }],
    });

    if (!outflow) {
      return res.status(404).json({
        success: false,
        message: 'Cash outflow record not found.',
      });
    }

    if (outflow.status === 'REVERSED') {
      return res.status(400).json({
        success: false,
        message: 'This outflow has already been reversed.',
      });
    }

    const previousState = { ...outflow.toObject() };

    outflow.status = 'REVERSED';
    outflow.reversalReason = reason.trim();
    outflow.reversedAt = new Date();
    outflow.reversedBy = req.user?.username || 'admin';

    await outflow.save();

    await logAuditEvent({
      action: 'IRUPU_OUTFLOW_REVERSE',
      entityType: 'IRUPU_OUTFLOW',
      entityId: outflow.outflowId,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      previousState,
      newState: outflow.toObject(),
      details: `Reversed cash outflow ${outflow.outflowId} (₹${toRupees(outflow.amountPaise)}). Reason: ${reason.trim()}`,
    });

    return res.json({
      success: true,
      message: `Cash outflow ${outflow.outflowId} reversed successfully. Cash in hand has been restored.`,
      outflow: {
        ...outflow.toObject(),
        amountRupees: toRupees(outflow.amountPaise),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Set or Update Opening Cash Balance
 * POST /api/irupu/opening-balance
 */
const setOpeningBalance = async (req, res, next) => {
  try {
    const { amount, effectiveDate, remarks } = req.body;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid non-negative opening balance amount is required.',
      });
    }

    const amountPaise = toPaise(amountNum);
    const openingBalanceId = await generateOpeningBalanceId();
    const effDate = effectiveDate ? new Date(effectiveDate) : new Date();

    // Mark previous opening balances as not current
    await IrupuOpeningBalance.updateMany({}, { $set: { isCurrent: false } });

    const newOpb = new IrupuOpeningBalance({
      openingBalanceId,
      amountPaise,
      effectiveDate: effDate,
      remarks: remarks ? remarks.trim() : 'Manual Opening Cash in Hand setup',
      setBy: req.user?.username || 'admin',
      isCurrent: true,
    });

    await newOpb.save();

    await logAuditEvent({
      action: 'IRUPU_OPENING_BALANCE_SET',
      entityType: 'IRUPU_OPENING_BALANCE',
      entityId: openingBalanceId,
      performedBy: req.user?.username || 'admin',
      ipAddress: req.ip,
      newState: {
        openingBalanceId,
        amountRupees: amountNum,
        amountPaise,
        effectiveDate: effDate,
      },
      details: `Set physical cash opening balance to ₹${amountNum} (${openingBalanceId})`,
    });

    return res.status(201).json({
      success: true,
      message: `Opening Cash in Hand updated to ₹${amountNum.toLocaleString('en-IN')} successfully!`,
      openingBalance: {
        ...newOpb.toObject(),
        amountRupees: toRupees(amountPaise),
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get Opening Balance History
 * GET /api/irupu/opening-balance
 */
const getOpeningBalanceHistory = async (req, res, next) => {
  try {
    const current = await getCurrentOpeningBalance();
    const history = await IrupuOpeningBalance.find().sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      current: {
        ...current,
        amountRupees: toRupees(current.amountPaise),
      },
      history: history.map((h) => ({
        ...h,
        amountRupees: toRupees(h.amountPaise),
      })),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSummary,
  listInvestments,
  addInvestment,
  reverseInvestment,
  listOutflows,
  addOutflow,
  reverseOutflow,
  setOpeningBalance,
  getOpeningBalanceHistory,
};
