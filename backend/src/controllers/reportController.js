const { DateTime } = require('luxon');
const Loan = require('../models/Loan');
const Collection = require('../models/Collection');
const Customer = require('../models/Customer');
const Transaction = require('../models/Transaction');
const { toRupees } = require('../services/calculationEngine');
const CONSTANTS = require('../config/constants');

const TIMEZONE = CONSTANTS.DEFAULT_TIMEZONE;

/**
 * Daily Financial Report
 */
const getDailyReport = async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date
      ? DateTime.fromISO(date, { zone: TIMEZONE }).startOf('day')
      : DateTime.now().setZone(TIMEZONE).startOf('day');

    const startOfDay = targetDate.toJSDate();
    const endOfDay = targetDate.endOf('day').toJSDate();

    // 1. Loans issued on this day (optimized: lean, no redundant populate)
    const loansIssued = await Loan.find({
      startDate: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    // 2. Collections received on this day (optimized: lean, no redundant populate)
    const collections = await Collection.find({
      paymentDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'CONFIRMED',
    }).lean();

    // 3. Customers Due on this day (optimized: lean, no redundant populate)
    const dueToday = await Loan.find({
      dueDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
    }).lean();

    // 4. Overdue Customers as of this day (optimized: lean, no redundant populate)
    const overdue = await Loan.find({
      dueDate: { $lt: startOfDay },
      status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
    }).lean();

    const principalLentPaise = loansIssued.reduce((sum, l) => sum + l.principalPaise, 0);
    const principalCollectedPaise = collections.reduce((sum, c) => sum + c.principalAllocationPaise, 0);
    const interestCollectedPaise = collections.reduce((sum, c) => sum + c.interestAllocationPaise, 0);
    const totalCollectionPaise = collections.reduce((sum, c) => sum + c.totalAmountPaise, 0);

    res.json({
      success: true,
      report: {
        date: targetDate.toISODate(),
        summary: {
          loansIssuedCount: loansIssued.length,
          principalLentRupees: toRupees(principalLentPaise),
          collectionsCount: collections.length,
          principalCollectedRupees: toRupees(principalCollectedPaise),
          interestCollectedRupees: toRupees(interestCollectedPaise),
          totalCollectionRupees: toRupees(totalCollectionPaise),
          dueTodayCount: dueToday.length,
          overdueCount: overdue.length,
        },
        loansIssued: loansIssued.map((l) => ({
          loanId: l.loanId,
          customerName: l.customerName,
          customerMobile: l.customerMobile,
          vattiType: l.vattiType,
          principalRupees: toRupees(l.principalPaise),
          rate: l.interestRatePercent,
          dueDate: l.dueDate,
        })),
        collections: collections.map((c) => ({
          receiptNumber: c.receiptNumber,
          customerName: c.customerName,
          loanCode: c.loanCode,
          totalAmountRupees: toRupees(c.totalAmountPaise),
          principalAllocationRupees: toRupees(c.principalAllocationPaise),
          interestAllocationRupees: toRupees(c.interestAllocationPaise),
          paymentMethod: c.paymentMethod,
        })),
        dueToday: dueToday.map((d) => ({
          loanId: d.loanId,
          customerName: d.customerName,
          customerMobile: d.customerMobile,
          vattiType: d.vattiType,
          outstandingPrincipalRupees: toRupees(d.outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(d.outstandingInterestPaise),
          totalOutstandingRupees: toRupees(d.outstandingPrincipalPaise + d.outstandingInterestPaise),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Monthly Financial Report
 */
const getMonthlyReport = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const now = DateTime.now().setZone(TIMEZONE);
    const targetYear = year ? parseInt(year, 10) : now.year;
    const targetMonth = month ? parseInt(month, 10) : now.month;

    const startOfMonth = DateTime.fromObject({ year: targetYear, month: targetMonth, day: 1 }, { zone: TIMEZONE }).startOf('month');
    const endOfMonth = startOfMonth.endOf('month');

    // Run monthly queries in parallel with optimized projections
    const [loans, collections, activeLoans] = await Promise.all([
      Loan.find({
        startDate: { $gte: startOfMonth.toJSDate(), $lte: endOfMonth.toJSDate() },
      })
        .select('principalPaise vattiType loanId')
        .lean(),
      Collection.find({
        paymentDate: { $gte: startOfMonth.toJSDate(), $lte: endOfMonth.toJSDate() },
        status: 'CONFIRMED',
      })
        .select('principalAllocationPaise interestAllocationPaise totalAmountPaise loanCode')
        .lean(),
      Loan.find({
        status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
      })
        .select('outstandingPrincipalPaise outstandingInterestPaise accruedInterestPaise')
        .lean(),
    ]);

    const totalPrincipalLentPaise = loans.reduce((sum, l) => sum + l.principalPaise, 0);
    const totalPrincipalCollectedPaise = collections.reduce((sum, c) => sum + c.principalAllocationPaise, 0);
    const totalInterestCollectedPaise = collections.reduce((sum, c) => sum + c.interestAllocationPaise, 0);
    const totalCollectionPaise = collections.reduce((sum, c) => sum + c.totalAmountPaise, 0);

    const outstandingPrincipalPaise = activeLoans.reduce((sum, l) => sum + l.outstandingPrincipalPaise, 0);
    const outstandingInterestPaise = activeLoans.reduce((sum, l) => sum + l.outstandingInterestPaise, 0);
    const totalAccruedInterestPaise = activeLoans.reduce((sum, l) => sum + (l.accruedInterestPaise || 0), 0);

    // Finance Type Breakdown
    const vattiTypes = ['MONTHLY', 'DAILY', 'MEATER'];
    const vattiBreakdown = vattiTypes.map((type) => {
      const typeLoans = loans.filter((l) => l.vattiType === type);
      const typeCollections = collections.filter((c) => c.loanCode && c.loanCode.includes(type.slice(0, 1))); // or mapped
      return {
        financeType: type,
        vattiType: type,
        loansCount: typeLoans.length,
        principalLentRupees: toRupees(typeLoans.reduce((sum, l) => sum + l.principalPaise, 0)),
      };
    });

    res.json({
      success: true,
      report: {
        year: targetYear,
        month: targetMonth,
        monthName: startOfMonth.monthLong,
        summary: {
          totalPrincipalLentRupees: toRupees(totalPrincipalLentPaise),
          totalPrincipalCollectedRupees: toRupees(totalPrincipalCollectedPaise),
          totalInterestCollectedRupees: toRupees(totalInterestCollectedPaise),
          totalCollectionRupees: toRupees(totalCollectionPaise),
          totalAccruedInterestRupees: toRupees(totalAccruedInterestPaise),
          outstandingPrincipalRupees: toRupees(outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(outstandingInterestPaise),
          totalOutstandingRupees: toRupees(outstandingPrincipalPaise + outstandingInterestPaise),
          loansCount: loans.length,
          collectionsCount: collections.length,
        },
        financeBreakdown: vattiBreakdown,
        vattiBreakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Yearly Financial Report
 */
const getYearlyReport = async (req, res, next) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year, 10) : DateTime.now().setZone(TIMEZONE).year;

    const startOfYear = DateTime.fromObject({ year: targetYear, month: 1, day: 1 }, { zone: TIMEZONE }).startOf('year');
    const endOfYear = startOfYear.endOf('year');

    // Run yearly queries in parallel with optimized projections
    const [loans, collections, activeLoans] = await Promise.all([
      Loan.find({
        startDate: { $gte: startOfYear.toJSDate(), $lte: endOfYear.toJSDate() },
      })
        .select('principalPaise vattiType')
        .lean(),
      Collection.find({
        paymentDate: { $gte: startOfYear.toJSDate(), $lte: endOfYear.toJSDate() },
        status: 'CONFIRMED',
      })
        .select('principalAllocationPaise interestAllocationPaise totalAmountPaise')
        .lean(),
      Loan.find({
        status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
      })
        .select('outstandingPrincipalPaise outstandingInterestPaise')
        .lean(),
    ]);

    const totalPrincipalLentPaise = loans.reduce((sum, l) => sum + l.principalPaise, 0);
    const totalPrincipalCollectedPaise = collections.reduce((sum, c) => sum + c.principalAllocationPaise, 0);
    const totalInterestCollectedPaise = collections.reduce((sum, c) => sum + c.interestAllocationPaise, 0);

    const outstandingPrincipalPaise = activeLoans.reduce((sum, l) => sum + l.outstandingPrincipalPaise, 0);
    const outstandingInterestPaise = activeLoans.reduce((sum, l) => sum + l.outstandingInterestPaise, 0);

    res.json({
      success: true,
      report: {
        year: targetYear,
        summary: {
          totalPrincipalLentRupees: toRupees(totalPrincipalLentPaise),
          totalPrincipalCollectedRupees: toRupees(totalPrincipalCollectedPaise),
          totalInterestCollectedRupees: toRupees(totalInterestCollectedPaise),
          totalCollectionRupees: toRupees(totalPrincipalCollectedPaise + totalInterestCollectedPaise),
          outstandingPrincipalRupees: toRupees(outstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(outstandingInterestPaise),
          totalOutstandingRupees: toRupees(outstandingPrincipalPaise + outstandingInterestPaise),
          loansIssuedCount: loans.length,
          collectionsCount: collections.length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Customer Financial Summary Report
 */
const getCustomerReport = async (req, res, next) => {
  try {
    const customers = await Customer.find().sort({ name: 1 }).lean();

    const customerReports = customers.map((c) => ({
      id: c._id,
      customerId: c.customerId,
      name: c.name,
      mobileNumber: c.mobileNumber,
      status: c.status,
      totalLoans: c.totalLoanCount || 0,
      activeLoans: c.activeLoanCount || 0,
      totalBorrowedRupees: toRupees(c.totalLentPaise),
      totalPrincipalRepaidRupees: toRupees(c.totalPrincipalPaidPaise),
      totalInterestRepaidRupees: toRupees(c.totalInterestPaidPaise),
      outstandingPrincipalRupees: toRupees(c.outstandingPrincipalPaise),
      outstandingInterestRupees: toRupees(c.outstandingInterestPaise),
      totalOutstandingRupees: toRupees(c.outstandingPrincipalPaise + c.outstandingInterestPaise),
    }));

    res.json({
      success: true,
      totalCustomers: customerReports.length,
      customers: customerReports,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Vatti Category Breakdown Report
 */
const getCategoryReport = async (req, res, next) => {
  try {
    const categories = ['MONTHLY', 'DAILY', 'MEATER'];
    const results = [];

    for (const cat of categories) {
      const allLoans = await Loan.find({ vattiType: cat }).lean();
      const activeLoans = allLoans.filter((l) => [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE].includes(l.status));
      const settledLoans = allLoans.filter((l) => l.status === CONSTANTS.LOAN_STATUS.SETTLED);

      const totalPrincipalPaise = allLoans.reduce((s, l) => s + l.principalPaise, 0);
      const totalPrincipalPaidPaise = allLoans.reduce((s, l) => s + l.totalPrincipalPaidPaise, 0);
      const totalInterestPaidPaise = allLoans.reduce((s, l) => s + l.totalInterestPaidPaise, 0);
      const outstandingPrincipalPaise = activeLoans.reduce((s, l) => s + l.outstandingPrincipalPaise, 0);
      const outstandingInterestPaise = activeLoans.reduce((s, l) => s + l.outstandingInterestPaise, 0);

      results.push({
        financeType: cat,
        vattiType: cat,
        totalLoans: allLoans.length,
        activeLoans: activeLoans.length,
        settledLoans: settledLoans.length,
        totalPrincipalLentRupees: toRupees(totalPrincipalPaise),
        totalPrincipalCollectedRupees: toRupees(totalPrincipalPaidPaise),
        totalInterestCollectedRupees: toRupees(totalInterestPaidPaise),
        outstandingPrincipalRupees: toRupees(outstandingPrincipalPaise),
        outstandingInterestRupees: toRupees(outstandingInterestPaise),
        totalOutstandingRupees: toRupees(outstandingPrincipalPaise + outstandingInterestPaise),
        isPendingOwnerConfirmation: cat === 'MEATER',
      });
    }

    res.json({
      success: true,
      categories: results,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDailyReport,
  getMonthlyReport,
  getYearlyReport,
  getCustomerReport,
  getCategoryReport,
};
