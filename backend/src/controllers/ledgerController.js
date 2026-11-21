const Transaction = require('../models/Transaction');
const Loan = require('../models/Loan');
const Customer = require('../models/Customer');
const { toRupees } = require('../services/calculationEngine');

/**
 * Get Detailed Ledger for a specific Loan
 */
const getLoanLedger = async (req, res, next) => {
  try {
    const { loanId } = req.params;
    const { startDate, endDate } = req.query;

    const loan = await Loan.findById(loanId).populate('customerId');
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    const query = { loanId: loan._id };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const transactions = await Transaction.find(query).sort({ date: 1, createdAt: 1 }).lean();

    const formattedTxns = transactions.map((t) => ({
      id: t._id,
      transactionId: t.transactionId,
      date: t.date,
      type: t.type,
      principalDebitRupees: toRupees(t.principalDebitPaise),
      principalCreditRupees: toRupees(t.principalCreditPaise),
      interestDebitRupees: toRupees(t.interestDebitPaise),
      interestCreditRupees: toRupees(t.interestCreditPaise),
      balancePrincipalRupees: toRupees(t.balancePrincipalPaise),
      balanceInterestRupees: toRupees(t.balanceInterestPaise),
      balanceTotalRupees: toRupees(t.balanceTotalPaise),
      remarks: t.remarks,
      referenceId: t.referenceId,
      performedBy: t.performedBy,
    }));

    res.json({
      success: true,
      ledger: {
        loan,
        customer: loan.customerId,
        summary: {
          originalPrincipalRupees: toRupees(loan.principalPaise),
          totalPrincipalPaidRupees: toRupees(loan.totalPrincipalPaidPaise),
          totalInterestPaidRupees: toRupees(loan.totalInterestPaidPaise),
          accruedInterestRupees: toRupees(loan.accruedInterestPaise),
          outstandingPrincipalRupees: toRupees(loan.outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(loan.outstandingInterestPaise),
          totalOutstandingRupees: toRupees(loan.outstandingPrincipalPaise + loan.outstandingInterestPaise),
        },
        transactions: formattedTxns,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Comprehensive Customer Ledger across all their loans
 */
const getCustomerLedger = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, loanId } = req.query;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const query = { customerId: customer._id };
    if (loanId && loanId !== 'ALL') {
      query.loanId = loanId;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const transactions = await Transaction.find(query)
      .populate('loanId', 'loanId vattiType')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const loans = await Loan.find({ customerId: customer._id }).sort({ startDate: 1 }).lean();

    const formattedTxns = transactions.map((t) => ({
      id: t._id,
      transactionId: t.transactionId,
      loanCode: t.loanId?.loanId || 'N/A',
      financeType: t.loanId?.vattiType || 'N/A',
      vattiType: t.loanId?.vattiType || 'N/A',
      date: t.date,
      type: t.type,
      principalDebitRupees: toRupees(t.principalDebitPaise),
      principalCreditRupees: toRupees(t.principalCreditPaise),
      interestDebitRupees: toRupees(t.interestDebitPaise),
      interestCreditRupees: toRupees(t.interestCreditPaise),
      balancePrincipalRupees: toRupees(t.balancePrincipalPaise),
      balanceInterestRupees: toRupees(t.balanceInterestPaise),
      balanceTotalRupees: toRupees(t.balanceTotalPaise),
      remarks: t.remarks,
      referenceId: t.referenceId,
      performedBy: t.performedBy,
    }));

    res.json({
      success: true,
      ledger: {
        customer,
        loans,
        summary: {
          totalLentRupees: toRupees(customer.totalLentPaise),
          totalPrincipalPaidRupees: toRupees(customer.totalPrincipalPaidPaise),
          totalInterestPaidRupees: toRupees(customer.totalInterestPaidPaise),
          outstandingPrincipalRupees: toRupees(customer.outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(customer.outstandingInterestPaise),
          totalOutstandingRupees: toRupees(customer.outstandingPrincipalPaise + customer.outstandingInterestPaise),
        },
        transactions: formattedTxns,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLoanLedger,
  getCustomerLedger,
};
