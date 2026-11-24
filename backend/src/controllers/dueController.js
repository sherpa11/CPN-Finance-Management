const { DateTime } = require('luxon');
const Loan = require('../models/Loan');
const { toRupees, calculateDailyPenalty } = require('../services/calculationEngine');
const CONSTANTS = require('../config/constants');
const { escapeRegex } = require('../utils/sanitize');

const TIMEZONE = CONSTANTS.DEFAULT_TIMEZONE;

const getDuesList = async (req, res, next) => {
  try {
    const vattiType = req.query.financeType || req.query.vattiType;
    const {
      filter = 'ALL',
      search,
      sortBy = 'dueDate',
      sortOrder = 'asc',
      customStartDate,
      customEndDate,
      page = 1,
      limit = 50,
    } = req.query;

    const today = DateTime.now().setZone(TIMEZONE).startOf('day');
    const query = {
      status: { $in: [CONSTANTS.LOAN_STATUS.ACTIVE, CONSTANTS.LOAN_STATUS.OVERDUE] },
    };

    if (vattiType && vattiType !== 'ALL') {
      if (vattiType === 'DAILY_COLLECTION' || vattiType === 'MEATER') {
        query.vattiType = { $in: ['DAILY_COLLECTION', 'MEATER'] };
      } else {
        query.vattiType = vattiType;
      }
    }

    if (filter === 'TODAY') {
      const startOfDay = today.toJSDate();
      const endOfDay = today.endOf('day').toJSDate();
      query.dueDate = { $gte: startOfDay, $lte: endOfDay };
    } else if (filter === 'TOMORROW') {
      const tomorrow = today.plus({ days: 1 });
      query.dueDate = { $gte: tomorrow.toJSDate(), $lte: tomorrow.endOf('day').toJSDate() };
    } else if (filter === 'NEXT_7_DAYS') {
      const start = today.toJSDate();
      const end = today.plus({ days: 7 }).endOf('day').toJSDate();
      query.dueDate = { $gte: start, $lte: end };
    } else if (filter === 'OVERDUE') {
      query.dueDate = { $lt: today.toJSDate() };
      query.status = { $ne: CONSTANTS.LOAN_STATUS.SETTLED };
    } else if (filter === 'COMPLETED') {
      query.status = CONSTANTS.LOAN_STATUS.SETTLED;
    } else if (filter === 'CUSTOM' && (customStartDate || customEndDate)) {
      query.dueDate = {};
      if (customStartDate) query.dueDate.$gte = new Date(customStartDate);
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        query.dueDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [
        { customerName: searchRegex },
        { customerMobile: searchRegex },
        { customerCode: searchRegex },
        { loanId: searchRegex },
      ];
    }

    // Sorting
    const sort = {};
    const orderDirection = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'outstandingAmount') {
      sort.outstandingPrincipalPaise = orderDirection;
    } else if (sortBy === 'customerName') {
      sort.customerName = orderDirection;
    } else if (sortBy === 'vattiType' || sortBy === 'financeType') {
      sort.vattiType = orderDirection;
    } else {
      sort.dueDate = orderDirection;
    }

    const total = await Loan.countDocuments(query);
    const loans = await Loan.find(query)
      .select('loanId customerId customerCode customerName customerMobile vattiType principalPaise interestRatePercent accruedInterestPaise outstandingPrincipalPaise outstandingInterestPaise dailyInstalmentPaise totalDurationDays penaltyPaidPaise penaltyRatePercent settledDate startDate dueDate status')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const formatted = loans.map((l) => {
      const dueKolkata = DateTime.fromJSDate(l.dueDate, { zone: TIMEZONE }).startOf('day');
      const diffDays = Math.round(dueKolkata.diff(today, 'days').days);
      // Confirmed Business Rule:
      // Monthly Finance strictly has NO penalty under any circumstances.
      // Only Due Management (maturity schedule, days overdue, tracking) and Notifications apply to Monthly Finance.
      // Daily Finance & Daily Collection apply 2% daily repayment penalty starting on Day D+1.
      const isDailyOrDc = l.vattiType === 'DAILY' || l.vattiType === 'DAILY_COLLECTION' || l.vattiType === 'MEATER';

      let penaltyCalc = null;
      if (isDailyOrDc && l.vattiType !== 'MONTHLY') {
        const dailyInstalmentPaise = l.dailyInstalmentPaise || (l.totalDurationDays ? Math.floor((l.principalPaise || 0) / l.totalDurationDays) : Math.floor((l.principalPaise || 0) / 10));
        penaltyCalc = calculateDailyPenalty({
          dailyRepaymentAmountPaise: dailyInstalmentPaise,
          dueDate: l.dueDate,
          asOfDate: today.toJSDate(),
          isFullyRepaid: l.outstandingPrincipalPaise === 0,
          fullRepaymentDate: l.settledDate || null,
          penaltyPaidPaise: l.penaltyPaidPaise || 0,
          penaltyRatePercent: l.penaltyRatePercent || 2.0,
        });
      }

      const penaltyOutstandingRupees = penaltyCalc ? toRupees(penaltyCalc.penaltyOutstandingPaise) : 0;
      const totalAmountToCloseRupees = toRupees(l.outstandingPrincipalPaise + l.outstandingInterestPaise + (penaltyCalc ? penaltyCalc.penaltyOutstandingPaise : 0));

      return {
        id: l._id,
        loanId: l.loanId,
        customerId: l.customerId,
        customerCode: l.customerCode,
        customerName: l.customerName,
        customerMobile: l.customerMobile,
        financeType: (l.vattiType === 'MEATER' || l.vattiType === 'DAILY_COLLECTION') ? 'DAILY COLLECTION' : l.vattiType,
        vattiType: (l.vattiType === 'MEATER' || l.vattiType === 'DAILY_COLLECTION') ? 'DAILY_COLLECTION' : l.vattiType,
        principalRupees: toRupees(l.principalPaise),
        interestRatePercent: l.interestRatePercent,
        accruedInterestRupees: toRupees(l.accruedInterestPaise),
        outstandingPrincipalRupees: toRupees(l.outstandingPrincipalPaise),
        outstandingInterestRupees: toRupees(l.outstandingInterestPaise),
        totalOutstandingRupees: toRupees(l.outstandingPrincipalPaise + l.outstandingInterestPaise),
        penaltyOutstandingRupees,
        totalAmountToCloseRupees,
        penaltyBreakdown: isDailyOrDc && penaltyCalc ? {
          isPenaltyApplicable: true,
          penaltyRatePercent: penaltyCalc.penaltyRatePercent,
          overdueDays: penaltyCalc.overdueDays,
          dailyRepaymentAmountRupees: toRupees(penaltyCalc.dailyRepaymentAmountPaise),
          dailyPenaltyRupees: toRupees(penaltyCalc.dailyPenaltyPaise),
          cumulativePenaltyRupees: toRupees(penaltyCalc.cumulativePenaltyPaise),
          penaltyPaidRupees: toRupees(penaltyCalc.penaltyPaidPaise),
          penaltyOutstandingRupees,
          totalAmountToCloseRupees,
        } : {
          isPenaltyApplicable: false,
          penaltyRatePercent: 0,
          overdueDays: 0,
          dailyRepaymentAmountRupees: 0,
          dailyPenaltyRupees: 0,
          cumulativePenaltyRupees: 0,
          penaltyPaidRupees: 0,
          penaltyOutstandingRupees: 0,
          totalAmountToCloseRupees: toRupees(l.outstandingPrincipalPaise + l.outstandingInterestPaise),
        },
        startDate: l.startDate,
        dueDate: l.dueDate,
        daysRemainingOrOverdue: diffDays,
        dueStatus: diffDays < 0 ? 'OVERDUE' : diffDays === 0 ? 'DUE_TODAY' : 'UPCOMING',
        status: l.status,
      };
    });

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      dues: formatted,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDuesList,
};
