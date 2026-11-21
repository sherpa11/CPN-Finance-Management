const { DateTime } = require('luxon');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Collection = require('../models/Collection');
const Transaction = require('../models/Transaction');
const { toRupees } = require('../services/calculationEngine');
const CONSTANTS = require('../config/constants');

const TIMEZONE = CONSTANTS.DEFAULT_TIMEZONE;

// In-memory safe cache for dashboard metrics (10 seconds TTL)
let dashboardCache = {
  timestamp: 0,
  payload: null,
};

function invalidateDashboardCache() {
  dashboardCache.timestamp = 0;
  dashboardCache.payload = null;
}

const getDashboardData = async (req, res, next) => {
  try {
    const isFreshRequested = req.query.fresh === 'true' || req.query.skipCache === 'true';
    const nowMs = Date.now();

    // Serve cached payload if valid within 10 seconds and not forced fresh
    if (!isFreshRequested && dashboardCache.payload && nowMs - dashboardCache.timestamp < 10000) {
      return res.json(dashboardCache.payload);
    }

    const today = DateTime.now().setZone(TIMEZONE).startOf('day');

    // 1. Aggregations for Summary Cards with optimized projections and lean execution
    const [
      totalCustomers,
      activeLoansCount,
      customerAggregates,
      categoryCounts,
      todayDueLoans,
      overdueLoans,
      upcomingLoans,
      recentlySettledLoans,
    ] = await Promise.all([
      Customer.countDocuments({ status: 'ACTIVE' }),
      Loan.countDocuments({ status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] } }),
      Loan.aggregate([
        {
          $group: {
            _id: null,
            totalPrincipalLentPaise: { $sum: '$principalPaise' },
            totalPrincipalPaidPaise: { $sum: '$totalPrincipalPaidPaise' },
            totalInterestPaidPaise: { $sum: '$totalInterestPaidPaise' },
            totalAccruedInterestPaise: { $sum: '$accruedInterestPaise' },
            totalOutstandingPrincipalPaise: { $sum: '$outstandingPrincipalPaise' },
            totalOutstandingInterestPaise: { $sum: '$outstandingInterestPaise' },
          },
        },
      ]),
      Loan.aggregate([
        {
          $group: {
            _id: '$vattiType',
            count: { $sum: 1 },
            activeCount: {
              $sum: {
                $cond: [{ $in: ['$status', [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE]] }, 1, 0],
              },
            },
            totalPrincipalPaise: { $sum: '$principalPaise' },
            outstandingPrincipalPaise: { $sum: '$outstandingPrincipalPaise' },
          },
        },
      ]),
      // Today Due Loans (optimized: no redundant populate, explicit select + lean)
      Loan.find({
        status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
        dueDate: {
          $gte: today.toJSDate(),
          $lte: today.endOf('day').toJSDate(),
        },
      })
        .select('loanId customerName customerMobile vattiType principalPaise outstandingPrincipalPaise outstandingInterestPaise dueDate')
        .sort({ dueDate: 1 })
        .lean()
        .limit(10),
      // Overdue Loans (optimized: no redundant populate, explicit select + lean)
      Loan.find({
        status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
        dueDate: { $lt: today.toJSDate() },
      })
        .select('loanId customerName customerMobile vattiType principalPaise outstandingPrincipalPaise outstandingInterestPaise dueDate')
        .sort({ dueDate: 1 })
        .lean()
        .limit(10),
      // Upcoming Loans (next 7 days, optimized: no redundant populate, explicit select + lean)
      Loan.find({
        status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
        dueDate: {
          $gt: today.endOf('day').toJSDate(),
          $lte: today.plus({ days: 7 }).endOf('day').toJSDate(),
        },
      })
        .select('loanId customerName customerMobile vattiType principalPaise outstandingPrincipalPaise outstandingInterestPaise dueDate')
        .sort({ dueDate: 1 })
        .lean()
        .limit(10),
      // Recently Settled Accounts (optimized: no redundant populate, explicit select + lean)
      Loan.find({ status: CONSTANTS.LOAN_STATUS.SETTLED })
        .select('loanId customerName customerMobile vattiType principalPaise outstandingPrincipalPaise outstandingInterestPaise dueDate settledDate updatedAt')
        .sort({ settledDate: -1, updatedAt: -1 })
        .lean()
        .limit(5),
    ]);

    const agg = customerAggregates[0] || {
      totalPrincipalLentPaise: 0,
      totalPrincipalPaidPaise: 0,
      totalInterestPaidPaise: 0,
      totalAccruedInterestPaise: 0,
      totalOutstandingPrincipalPaise: 0,
      totalOutstandingInterestPaise: 0,
    };

    // 2. Monthly Trend Data (Last 6 months) for Recharts
    const sixMonthsAgo = today.minus({ months: 5 }).startOf('month').toJSDate();

    const [monthlyLending, monthlyCollections] = await Promise.all([
      Loan.aggregate([
        { $match: { startDate: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: { date: '$startDate', timezone: TIMEZONE } },
              month: { $month: { date: '$startDate', timezone: TIMEZONE } },
            },
            totalPrincipalPaise: { $sum: '$principalPaise' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Collection.aggregate([
        { $match: { paymentDate: { $gte: sixMonthsAgo }, status: 'CONFIRMED' } },
        {
          $group: {
            _id: {
              year: { $year: { date: '$paymentDate', timezone: TIMEZONE } },
              month: { $month: { date: '$paymentDate', timezone: TIMEZONE } },
            },
            principalCollectedPaise: { $sum: '$principalAllocationPaise' },
            interestCollectedPaise: { $sum: '$interestAllocationPaise' },
            totalCollectedPaise: { $sum: '$totalAmountPaise' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    // Build unified 6-month array
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrends = [];

    for (let i = 5; i >= 0; i--) {
      const mDate = today.minus({ months: i });
      const year = mDate.year;
      const month = mDate.month;
      const label = `${monthNames[month - 1]} ${year}`;

      const lendItem = monthlyLending.find((l) => l._id.year === year && l._id.month === month);
      const colItem = monthlyCollections.find((c) => c._id.year === year && c._id.month === month);

      monthlyTrends.push({
        month: label,
        year,
        lendingRupees: lendItem ? toRupees(lendItem.totalPrincipalPaise) : 0,
        principalCollectedRupees: colItem ? toRupees(colItem.principalCollectedPaise) : 0,
        interestCollectedRupees: colItem ? toRupees(colItem.interestCollectedPaise) : 0,
        totalCollectedRupees: colItem ? toRupees(colItem.totalCollectedPaise) : 0,
      });
    }

    // Category Distribution (Monthly, Daily, Daily Collection)
    const categoryDistribution = ['MONTHLY', 'DAILY', 'DAILY_COLLECTION'].map((type) => {
      let found;
      if (type === 'DAILY_COLLECTION') {
        const dc = categoryCounts.find((c) => c._id === 'DAILY_COLLECTION');
        const meater = categoryCounts.find((c) => c._id === 'MEATER');
        found = {
          count: (dc?.count || 0) + (meater?.count || 0),
          activeCount: (dc?.activeCount || 0) + (meater?.activeCount || 0),
          totalPrincipalPaise: (dc?.totalPrincipalPaise || 0) + (meater?.totalPrincipalPaise || 0),
          outstandingPrincipalPaise: (dc?.outstandingPrincipalPaise || 0) + (meater?.outstandingPrincipalPaise || 0),
        };
      } else {
        found = categoryCounts.find((c) => c._id === type);
      }
      return {
        financeType: type === 'DAILY_COLLECTION' ? 'DAILY COLLECTION' : type,
        vattiType: type,
        totalLoans: found ? found.count : 0,
        activeLoans: found ? found.activeCount : 0,
        totalPrincipalRupees: found ? toRupees(found.totalPrincipalPaise) : 0,
        outstandingPrincipalRupees: found ? toRupees(found.outstandingPrincipalPaise) : 0,
      };
    });

    const formatLoanItem = (l) => {
      const dueKolkata = DateTime.fromJSDate(new Date(l.dueDate), { zone: TIMEZONE }).startOf('day');
      const diffDays = Math.round(dueKolkata.diff(today, 'days').days);
      const displayType = (l.vattiType === 'MEATER' || l.vattiType === 'DAILY_COLLECTION') ? 'DAILY COLLECTION' : l.vattiType;
      return {
        id: l._id,
        loanId: l.loanId,
        customerName: l.customerName,
        customerMobile: l.customerMobile,
        financeType: displayType,
        vattiType: l.vattiType,
        principalRupees: toRupees(l.principalPaise),
        outstandingPrincipalRupees: toRupees(l.outstandingPrincipalPaise),
        outstandingInterestRupees: toRupees(l.outstandingInterestPaise),
        totalOutstandingRupees: toRupees(l.outstandingPrincipalPaise + l.outstandingInterestPaise),
        dueDate: l.dueDate,
        daysRemainingOrOverdue: diffDays,
        settledDate: l.settledDate,
      };
    };

    const responseData = {
      success: true,
      data: {
        summary: {
          totalCustomers,
          activeLoans: activeLoansCount,
          totalPrincipalLentRupees: toRupees(agg.totalPrincipalLentPaise),
          totalPrincipalCollectedRupees: toRupees(agg.totalPrincipalPaidPaise),
          totalInterestAccruedRupees: toRupees(agg.totalAccruedInterestPaise),
          totalInterestCollectedRupees: toRupees(agg.totalInterestPaidPaise),
          outstandingPrincipalRupees: toRupees(agg.totalOutstandingPrincipalPaise),
          outstandingInterestRupees: toRupees(agg.totalOutstandingInterestPaise),
          totalOutstandingRupees: toRupees(agg.totalOutstandingPrincipalPaise + agg.totalOutstandingInterestPaise),
        },
        monthlyTrends,
        categoryDistribution,
        dueCustomers: {
          todayDue: todayDueLoans.map(formatLoanItem),
          overdue: overdueLoans.map(formatLoanItem),
          upcoming: upcomingLoans.map(formatLoanItem),
          recentlySettled: recentlySettledLoans.map(formatLoanItem),
        },
      },
    };

    // Cache valid payload
    dashboardCache = {
      timestamp: Date.now(),
      payload: responseData,
    };

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardData,
  invalidateDashboardCache,
};
