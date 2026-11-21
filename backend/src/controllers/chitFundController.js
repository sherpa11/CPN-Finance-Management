const mongoose = require('mongoose');
const ChitGroup = require('../models/ChitGroup');
const ChitMember = require('../models/ChitMember');
const ChitCollection = require('../models/ChitCollection');
const ChitPayout = require('../models/ChitPayout');
const ChitAuditLog = require('../models/ChitAuditLog');
const Customer = require('../models/Customer');
const {
  getInitialScheduleForCategory,
  getCategoryMeta,
  CHIT_10_LAKH_SCHEDULE_RUPEES,
  CHIT_20_LAKH_SCHEDULE_RUPEES,
  CHIT_5_LAKH_DRAFT_SCHEDULE_RUPEES,
} = require('../services/chitFundService');
const { toPaise, toRupees, formatINR } = require('../services/calculationEngine');
const { escapeRegex } = require('../utils/sanitize');

/**
 * Helper to run code within MongoDB session if available
 */
async function runInTransaction(callback) {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Ignore abort error
      }
    }
    // Fallback if standalone mongo doesn't support replica set transactions
    if (err.message && (err.message.includes('Transaction numbers') || err.message.includes('replica set'))) {
      return await callback(null);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

/**
 * Generate Sequential Chit ID based on category:
 * e.g. CPN-10L-001, CPN-20L-001, CPN-5L-001
 */
async function generateChitId(category) {
  const meta = getCategoryMeta(category);
  const prefix = meta.prefix;
  const count = await ChitGroup.countDocuments({ category });
  const nextNumber = count + 1;
  let chitId = `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  
  // Collision check
  let exists = await ChitGroup.findOne({ chitId });
  let seq = nextNumber;
  while (exists) {
    seq++;
    chitId = `${prefix}-${String(seq).padStart(3, '0')}`;
    exists = await ChitGroup.findOne({ chitId });
  }
  return chitId;
}

/**
 * Generate Chit Receipt Number
 * e.g. CPR-CHIT-2026-0001
 */
async function generateChitReceiptNumber() {
  const year = new Date().getFullYear();
  const count = await ChitCollection.countDocuments();
  return `CPR-CHIT-${year}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Generate Chit Payout Voucher Number
 * e.g. CPO-CHIT-2026-0001
 */
async function generateChitPayoutVoucher() {
  const year = new Date().getFullYear();
  const count = await ChitPayout.countDocuments();
  return `CPO-CHIT-${year}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * 1. GET CHIT SUMMARY (Dashboard KPIs)
 */
const getChitSummary = async (req, res, next) => {
  try {
    const [
      totalGroups,
      activeGroups,
      formingGroups,
      completedGroups,
      totalMembers,
      groups,
    ] = await Promise.all([
      ChitGroup.countDocuments(),
      ChitGroup.countDocuments({ status: 'ACTIVE' }),
      ChitGroup.countDocuments({ status: 'FORMING' }),
      ChitGroup.countDocuments({ status: 'COMPLETED' }),
      ChitMember.countDocuments({ status: 'ACTIVE' }),
      ChitGroup.find()
        .select('totalValuePaise totalInstalmentExpectedPaise totalCollectedPaise totalPayoutsPaise')
        .lean(),
    ]);

    let totalChitValuePaise = 0;
    let totalInstalmentExpectedPaise = 0;
    let totalCollectedPaise = 0;
    let totalPayoutsPaise = 0;

    groups.forEach((g) => {
      totalChitValuePaise += g.totalValuePaise || 0;
      totalInstalmentExpectedPaise += g.totalInstalmentExpectedPaise || 0;
      totalCollectedPaise += g.totalCollectedPaise || 0;
      totalPayoutsPaise += g.totalPayoutsPaise || 0;
    });

    const totalOutstandingPaise = Math.max(0, totalInstalmentExpectedPaise - totalCollectedPaise);

    res.json({
      success: true,
      summary: {
        totalGroups,
        activeGroups,
        formingGroups,
        completedGroups,
        totalMembers,
        totalChitValueRupees: toRupees(totalChitValuePaise),
        totalInstalmentExpectedRupees: toRupees(totalInstalmentExpectedPaise),
        totalCollectedRupees: toRupees(totalCollectedPaise),
        totalPayoutsRupees: toRupees(totalPayoutsPaise),
        totalOutstandingRupees: toRupees(totalOutstandingPaise),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. GET CHIT GROUPS LIST
 */
const getChitGroups = async (req, res, next) => {
  try {
    const { category, status, search } = req.query;
    const query = {};

    if (category && category !== 'ALL') {
      query.category = category;
    }
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (search && search.trim()) {
      const s = escapeRegex(search.trim());
      query.$or = [
        { chitId: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
      ];
    }

    const groups = await ChitGroup.find(query).sort({ createdAt: -1 }).lean();

    const formatted = groups.map((g) => ({
      _id: g._id,
      chitId: g.chitId,
      name: g.name,
      category: g.category,
      totalValueRupees: toRupees(g.totalValuePaise),
      monthlyChitAmountRupees: toRupees(g.monthlyChitAmountPaise),
      maxMembers: g.maxMembers,
      durationMonths: g.durationMonths,
      memberCount: g.memberCount,
      currentMonth: g.currentMonth,
      status: g.status,
      isScheduleApproved: g.isScheduleApproved,
      startDate: g.startDate,
      firstInstalmentDate: g.firstInstalmentDate,
      totalCollectedRupees: toRupees(g.totalCollectedPaise),
      totalPayoutsRupees: toRupees(g.totalPayoutsPaise),
      totalExpectedRupees: toRupees(g.totalInstalmentExpectedPaise),
      outstandingRupees: toRupees(Math.max(0, g.totalInstalmentExpectedPaise - g.totalCollectedPaise)),
      remarks: g.remarks,
    }));

    res.json({
      success: true,
      groups: formatted,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. GET CHIT GROUP BY ID (Detailed view with full schedule)
 */
const getChitGroupById = async (req, res, next) => {
  try {
    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const members = await ChitMember.find({ chitGroupId: group._id }).sort({ memberNumber: 1 });

    const formattedSchedule = group.schedule.map((s) => ({
      month: s.month,
      chitAmountRupees: toRupees(s.chitAmountPaise),
      instalmentRupees: toRupees(s.instalmentPaise),
      kasarRupees: toRupees(s.kasarPaise),
      payoutAmountRupees: toRupees(s.payoutAmountPaise),
      hasPayout: s.hasPayout,
      payoutRecipientMemberId: s.payoutRecipientMemberId,
      payoutRecipientMemberNumber: s.payoutRecipientMemberNumber,
      payoutRecipientName: s.payoutRecipientName,
      payoutDate: s.payoutDate,
      payoutStatus: s.payoutStatus,
      collectionStatus: s.collectionStatus,
      totalCollectedForMonthRupees: toRupees(s.totalCollectedForMonthPaise),
      totalExpectedForMonthRupees: toRupees(s.instalmentPaise * 20),
      dueDate: s.dueDate,
    }));

    res.json({
      success: true,
      group: {
        _id: group._id,
        chitId: group.chitId,
        name: group.name,
        category: group.category,
        totalValueRupees: toRupees(group.totalValuePaise),
        monthlyChitAmountRupees: toRupees(group.monthlyChitAmountPaise),
        maxMembers: group.maxMembers,
        durationMonths: group.durationMonths,
        memberCount: group.memberCount,
        currentMonth: group.currentMonth,
        status: group.status,
        isScheduleApproved: group.isScheduleApproved,
        startDate: group.startDate,
        firstInstalmentDate: group.firstInstalmentDate,
        totalCollectedRupees: toRupees(group.totalCollectedPaise),
        totalPayoutsRupees: toRupees(group.totalPayoutsPaise),
        totalExpectedRupees: toRupees(group.totalInstalmentExpectedPaise),
        outstandingRupees: toRupees(Math.max(0, group.totalInstalmentExpectedPaise - group.totalCollectedPaise)),
        remarks: group.remarks,
        schedule: formattedSchedule,
        membersCount: members.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. CREATE CHIT GROUP
 */
const createChitGroup = async (req, res, next) => {
  try {
    const {
      category,
      name,
      startDate = new Date(),
      firstInstalmentDate = new Date(),
      remarks = '',
      customSchedule,
    } = req.body;

    if (!category || !['5_LAKH', '10_LAKH', '20_LAKH'].includes(category)) {
      return res.status(400).json({ success: false, message: 'Valid chit category is required (5_LAKH, 10_LAKH, 20_LAKH).' });
    }

    const meta = getCategoryMeta(category);
    const chitId = await generateChitId(category);

    const groupName = name && name.trim() ? name.trim() : `${meta.label.split('–')[1].trim()} ${chitId.split('-')[2]}`;

    let scheduleData;
    let isScheduleApproved;

    if (customSchedule && Array.isArray(customSchedule) && customSchedule.length === 20) {
      scheduleData = customSchedule.map((row) => ({
        month: Number(row.month),
        chitAmountPaise: toPaise(row.chitAmount || row.chitAmountRupees || meta.monthlyChitAmountPaise / 100),
        instalmentPaise: toPaise(row.instalment || row.instalmentRupees || 0),
        kasarPaise: toPaise(row.kasar || row.kasarRupees || 0),
        payoutAmountPaise: toPaise(row.payoutAmount || row.payoutAmountRupees || 0),
        hasPayout: row.hasPayout !== false,
        payoutRecipientMemberId: null,
        payoutRecipientMemberNumber: null,
        payoutRecipientName: '',
        payoutDate: null,
        payoutStatus: row.hasPayout !== false ? 'PENDING' : 'NO_PAYOUT',
        collectionStatus: 'PENDING',
        totalCollectedForMonthPaise: 0,
        dueDate: new Date(row.dueDate || firstInstalmentDate),
      }));
      isScheduleApproved = true;
    } else {
      const init = getInitialScheduleForCategory(category, firstInstalmentDate);
      scheduleData = init.schedule;
      isScheduleApproved = init.isScheduleApproved;
    }

    // Calculate total expected instalments (sum of all 20 instalments * 20 members)
    const perMemberTotalInstalmentPaise = scheduleData.reduce((acc, s) => acc + s.instalmentPaise, 0);
    const totalInstalmentExpectedPaise = perMemberTotalInstalmentPaise * 20;

    const group = new ChitGroup({
      chitId,
      name: groupName,
      category,
      totalValuePaise: meta.totalValuePaise,
      monthlyChitAmountPaise: meta.monthlyChitAmountPaise,
      maxMembers: 20,
      durationMonths: 20,
      startDate: new Date(startDate),
      firstInstalmentDate: new Date(firstInstalmentDate),
      currentMonth: 1,
      status: 'FORMING',
      isScheduleApproved,
      memberCount: 0,
      totalInstalmentExpectedPaise,
      totalCollectedPaise: 0,
      totalPayoutsPaise: 0,
      remarks: remarks.trim(),
      schedule: scheduleData,
    });

    await group.save();

    await ChitAuditLog.create({
      chitGroupId: group._id,
      chitId: group.chitId,
      action: 'CHIT_GROUP_CREATED',
      details: {
        category,
        totalValueRupees: toRupees(meta.totalValuePaise),
        isScheduleApproved,
      },
    });

    res.status(201).json({
      success: true,
      message: `Chit group ${chitId} created successfully.`,
      group,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. UPDATE CHIT SCHEDULE / APPROVE (Crucial for 5 Lakh & Customization)
 */
const updateChitSchedule = async (req, res, next) => {
  try {
    const { schedule, approve = true } = req.body;
    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    if (!Array.isArray(schedule) || schedule.length !== 20) {
      return res.status(400).json({ success: false, message: 'A complete 20-month schedule array is required.' });
    }

    // Preserve existing payouts and collections while updating scheduled targets
    const updatedSchedule = schedule.map((row, idx) => {
      const existing = group.schedule[idx] || {};
      const instalmentPaise = toPaise(row.instalmentRupees || row.instalment || 0);
      const kasarPaise = toPaise(row.kasarRupees || row.kasar || 0);
      const payoutAmountPaise = toPaise(row.payoutAmountRupees || row.payoutAmount || 0);
      const chitAmountPaise = toPaise(row.chitAmountRupees || row.chitAmount || group.monthlyChitAmountPaise / 100);

      return {
        month: row.month || idx + 1,
        chitAmountPaise,
        instalmentPaise,
        kasarPaise,
        payoutAmountPaise,
        hasPayout: row.hasPayout !== false,
        payoutRecipientMemberId: existing.payoutRecipientMemberId || null,
        payoutRecipientMemberNumber: existing.payoutRecipientMemberNumber || null,
        payoutRecipientName: existing.payoutRecipientName || '',
        payoutDate: existing.payoutDate || null,
        payoutStatus: existing.payoutStatus || (row.hasPayout !== false ? 'PENDING' : 'NO_PAYOUT'),
        collectionStatus: existing.collectionStatus || 'PENDING',
        totalCollectedForMonthPaise: existing.totalCollectedForMonthPaise || 0,
        dueDate: row.dueDate ? new Date(row.dueDate) : existing.dueDate,
      };
    });

    const perMemberTotalInstalmentPaise = updatedSchedule.reduce((acc, s) => acc + s.instalmentPaise, 0);
    group.totalInstalmentExpectedPaise = perMemberTotalInstalmentPaise * 20;
    group.schedule = updatedSchedule;

    if (approve) {
      group.isScheduleApproved = true;
    }

    await group.save();

    await ChitAuditLog.create({
      chitGroupId: group._id,
      chitId: group.chitId,
      action: approve ? 'CHIT_SCHEDULE_APPROVED' : 'CHIT_SCHEDULE_UPDATED',
      details: { perMemberTotalRupees: toRupees(perMemberTotalInstalmentPaise) },
    });

    res.json({
      success: true,
      message: 'Schedule updated and approved successfully.',
      group,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. GET CHIT MEMBERS (20 Slots Display)
 */
const getChitMembers = async (req, res, next) => {
  try {
    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const registeredMembers = await ChitMember.find({ chitGroupId: group._id }).sort({ memberNumber: 1 });

    // Calculate per-member expected total based on schedule
    const perMemberExpectedPaise = group.schedule.reduce((acc, s) => acc + s.instalmentPaise, 0);

    // Build complete 20 slots array (01 to 20)
    const slots = [];
    for (let slot = 1; slot <= 20; slot++) {
      const found = registeredMembers.find((m) => m.memberNumber === slot);
      if (found) {
        const totalPaid = found.totalPaidPaise || 0;
        const totalPending = Math.max(0, perMemberExpectedPaise - totalPaid);

        slots.push({
          memberNumber: slot,
          isOccupied: true,
          memberId: found._id,
          name: found.name,
          mobile: found.mobile,
          address: found.address,
          district: found.district,
          village: found.village,
          status: found.status,
          hasReceivedPayout: found.hasReceivedPayout,
          payoutMonth: found.payoutMonth,
          payoutAmountRupees: toRupees(found.payoutAmountPaise),
          totalPaidRupees: toRupees(totalPaid),
          totalExpectedRupees: toRupees(perMemberExpectedPaise),
          totalPendingRupees: toRupees(totalPending),
          joiningDate: found.joiningDate,
          remarks: found.remarks,
        });
      } else {
        slots.push({
          memberNumber: slot,
          isOccupied: false,
          memberId: null,
          name: 'Available (காலியாக உள்ளது)',
          mobile: '',
          status: 'AVAILABLE',
          hasReceivedPayout: false,
          totalPaidRupees: 0,
          totalExpectedRupees: toRupees(perMemberExpectedPaise),
          totalPendingRupees: 0,
        });
      }
    }

    res.json({
      success: true,
      slots,
      totalOccupied: registeredMembers.length,
      availableSlots: 20 - registeredMembers.length,
      perMemberExpectedRupees: toRupees(perMemberExpectedPaise),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 7. ADD CHIT MEMBER
 */
const addChitMember = async (req, res, next) => {
  try {
    const {
      memberNumber,
      name,
      mobile,
      address,
      district,
      village,
      joiningDate = new Date(),
      remarks = '',
      customerId,
    } = req.body;

    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const slotNum = Number(memberNumber);
    if (!slotNum || slotNum < 1 || slotNum > 20) {
      return res.status(400).json({ success: false, message: 'Member slot number must be between 1 and 20.' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Member name is required.' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required.' });
    }

    // Check if slot already occupied
    const existing = await ChitMember.findOne({ chitGroupId: group._id, memberNumber: slotNum });
    if (existing) {
      return res.status(400).json({ success: false, message: `Slot ${String(slotNum).padStart(2, '0')} is already occupied by ${existing.name}.` });
    }

    // Check max 20 active members
    const activeCount = await ChitMember.countDocuments({ chitGroupId: group._id, status: 'ACTIVE' });
    if (activeCount >= 20) {
      return res.status(400).json({ success: false, message: 'Cannot add more than 20 active members to this chit group.' });
    }

    const member = new ChitMember({
      chitGroupId: group._id,
      chitId: group.chitId,
      memberNumber: slotNum,
      customerId: customerId || null,
      name: name.trim(),
      mobile: mobile.trim(),
      address: (address || '').trim(),
      district: (district || '').trim(),
      village: (village || '').trim(),
      joiningDate: new Date(joiningDate),
      status: 'ACTIVE',
      remarks: (remarks || '').trim(),
    });

    await member.save();

    // Update group member count
    const totalCount = await ChitMember.countDocuments({ chitGroupId: group._id, status: 'ACTIVE' });
    group.memberCount = totalCount;
    if (totalCount === 20 && group.status === 'FORMING') {
      group.status = 'ACTIVE'; // Automatically activate when all 20 members joined
    }
    await group.save();

    await ChitAuditLog.create({
      chitGroupId: group._id,
      chitId: group.chitId,
      action: 'MEMBER_ADDED',
      details: {
        memberNumber: slotNum,
        name: member.name,
        mobile: member.mobile,
      },
    });

    res.status(201).json({
      success: true,
      message: `Member ${member.name} registered in slot ${String(slotNum).padStart(2, '0')}.`,
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 8. UPDATE CHIT MEMBER
 */
const updateChitMember = async (req, res, next) => {
  try {
    const { name, mobile, address, district, village, remarks, status } = req.body;
    const member = await ChitMember.findById(req.params.memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Chit member not found.' });
    }

    if (name) member.name = name.trim();
    if (mobile) member.mobile = mobile.trim();
    if (address !== undefined) member.address = address.trim();
    if (district !== undefined) member.district = district.trim();
    if (village !== undefined) member.village = village.trim();
    if (remarks !== undefined) member.remarks = remarks.trim();
    if (status && ['ACTIVE', 'INACTIVE', 'REPLACED'].includes(status)) member.status = status;

    await member.save();

    await ChitAuditLog.create({
      chitGroupId: member.chitGroupId,
      chitId: member.chitId,
      action: 'MEMBER_UPDATED',
      details: { memberNumber: member.memberNumber, name: member.name },
    });

    res.json({
      success: true,
      message: 'Member details updated successfully.',
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 9. GET CHIT MEMBER BY ID (Individual 20-Month Ledger Profile)
 */
const getChitMemberById = async (req, res, next) => {
  try {
    const member = await ChitMember.findById(req.params.memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: 'Chit member not found.' });
    }

    const group = await ChitGroup.findById(member.chitGroupId);
    const collections = await ChitCollection.find({
      memberId: member._id,
      isReversed: false,
    }).sort({ month: 1, paymentDate: 1 });

    const payout = await ChitPayout.findOne({
      memberId: member._id,
      isReversed: false,
      hasPayout: true,
    });

    // Generate month-wise ledger for all 20 months
    const monthlyLedger = group.schedule.map((s) => {
      const monthCols = collections.filter((c) => c.month === s.month);
      const paidPaise = monthCols.reduce((acc, c) => acc + c.amountPaidPaise, 0);
      const expectedPaise = s.instalmentPaise;
      const pendingPaise = Math.max(0, expectedPaise - paidPaise);

      let status = 'PENDING';
      if (paidPaise >= expectedPaise) status = 'PAID';
      else if (paidPaise > 0) status = 'PARTIAL';

      return {
        month: s.month,
        expectedRupees: toRupees(expectedPaise),
        paidRupees: toRupees(paidPaise),
        pendingRupees: toRupees(pendingPaise),
        status,
        collections: monthCols.map((c) => ({
          receiptNumber: c.receiptNumber,
          amountPaidRupees: toRupees(c.amountPaidPaise),
          paymentDate: c.paymentDate,
          paymentMethod: c.paymentMethod,
        })),
      };
    });

    const totalExpectedPaise = group.schedule.reduce((acc, s) => acc + s.instalmentPaise, 0);
    const totalPaidPaise = collections.reduce((acc, c) => acc + c.amountPaidPaise, 0);
    const totalPendingPaise = Math.max(0, totalExpectedPaise - totalPaidPaise);

    res.json({
      success: true,
      member: {
        _id: member._id,
        chitGroupId: member.chitGroupId,
        chitId: member.chitId,
        memberNumber: member.memberNumber,
        name: member.name,
        mobile: member.mobile,
        address: member.address,
        district: member.district,
        village: member.village,
        status: member.status,
        joiningDate: member.joiningDate,
        hasReceivedPayout: member.hasReceivedPayout,
        payoutMonth: member.payoutMonth,
        payoutAmountRupees: toRupees(member.payoutAmountPaise),
        payoutDetails: payout ? {
          voucherNumber: payout.payoutVoucherNumber,
          amountRupees: toRupees(payout.payoutAmountPaise),
          kasarRupees: toRupees(payout.kasarPaise),
          date: payout.payoutDate,
          method: payout.paymentMethod,
        } : null,
        totalExpectedRupees: toRupees(totalExpectedPaise),
        totalPaidRupees: toRupees(totalPaidPaise),
        totalPendingRupees: toRupees(totalPendingPaise),
        monthlyLedger,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 10. GET MONTHLY COLLECTION SHEET (For all 20 members for a given month)
 */
const getMonthlyCollectionSheet = async (req, res, next) => {
  try {
    const { month } = req.query;
    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const monthNum = Number(month || group.currentMonth || 1);
    const scheduleEntry = group.schedule.find((s) => s.month === monthNum);
    if (!scheduleEntry) {
      return res.status(400).json({ success: false, message: 'Invalid month requested.' });
    }

    const members = await ChitMember.find({ chitGroupId: group._id }).sort({ memberNumber: 1 });
    const collections = await ChitCollection.find({
      chitGroupId: group._id,
      month: monthNum,
      isReversed: false,
    });

    const expectedInstalmentPaise = scheduleEntry.instalmentPaise;

    let totalMonthExpectedPaise = 0;
    let totalMonthCollectedPaise = 0;

    const memberRows = [];
    for (let slot = 1; slot <= 20; slot++) {
      const member = members.find((m) => m.memberNumber === slot);
      if (member) {
        totalMonthExpectedPaise += expectedInstalmentPaise;
        const memberCols = collections.filter((c) => String(c.memberId) === String(member._id));
        const paidPaise = memberCols.reduce((acc, c) => acc + c.amountPaidPaise, 0);
        totalMonthCollectedPaise += paidPaise;

        const remainingPaise = Math.max(0, expectedInstalmentPaise - paidPaise);
        let status = 'PENDING';
        if (paidPaise >= expectedInstalmentPaise) status = 'PAID';
        else if (paidPaise > 0) status = 'PARTIAL';

        memberRows.push({
          memberNumber: slot,
          memberId: member._id,
          name: member.name,
          mobile: member.mobile,
          isOccupied: true,
          expectedRupees: toRupees(expectedInstalmentPaise),
          paidRupees: toRupees(paidPaise),
          remainingRupees: toRupees(remainingPaise),
          status,
          paymentCount: memberCols.length,
          lastPaymentDate: memberCols.length > 0 ? memberCols[memberCols.length - 1].paymentDate : null,
          hasReceivedPayout: member.hasReceivedPayout,
        });
      } else {
        memberRows.push({
          memberNumber: slot,
          memberId: null,
          name: 'Available (காலியாக உள்ளது)',
          mobile: '',
          isOccupied: false,
          expectedRupees: toRupees(expectedInstalmentPaise),
          paidRupees: 0,
          remainingRupees: toRupees(expectedInstalmentPaise),
          status: 'UNENROLLED',
          paymentCount: 0,
          lastPaymentDate: null,
          hasReceivedPayout: false,
        });
      }
    }

    res.json({
      success: true,
      month: monthNum,
      chitId: group.chitId,
      chitAmountRupees: toRupees(scheduleEntry.chitAmountPaise),
      expectedInstalmentRupees: toRupees(expectedInstalmentPaise),
      kasarRupees: toRupees(scheduleEntry.kasarPaise),
      payoutAmountRupees: toRupees(scheduleEntry.payoutAmountPaise),
      totalMonthExpectedRupees: toRupees(totalMonthExpectedPaise),
      totalMonthCollectedRupees: toRupees(totalMonthCollectedPaise),
      totalMonthPendingRupees: toRupees(Math.max(0, totalMonthExpectedPaise - totalMonthCollectedPaise)),
      members: memberRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 11. RECORD MEMBER INSTALMENT COLLECTION
 */
const recordMemberCollection = async (req, res, next) => {
  try {
    const {
      memberId,
      month,
      amountRupees,
      paymentMethod = 'CASH',
      paymentDate = new Date(),
      notes = '',
    } = req.body;

    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const member = await ChitMember.findOne({ _id: memberId, chitGroupId: group._id });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Chit member not found in this group.' });
    }

    const monthNum = Number(month);
    const scheduleEntry = group.schedule.find((s) => s.month === monthNum);
    if (!scheduleEntry) {
      return res.status(400).json({ success: false, message: 'Invalid month specified.' });
    }

    const paidPaise = toPaise(amountRupees);
    if (paidPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than zero.' });
    }

    const expectedInstalmentPaise = scheduleEntry.instalmentPaise;

    // Check how much is already paid for this month
    const existingCols = await ChitCollection.find({
      memberId: member._id,
      month: monthNum,
      isReversed: false,
    });
    const alreadyPaidPaise = existingCols.reduce((acc, c) => acc + c.amountPaidPaise, 0);

    const newTotalPaidForMonth = alreadyPaidPaise + paidPaise;
    const remainingPaise = Math.max(0, expectedInstalmentPaise - newTotalPaidForMonth);
    const status = newTotalPaidForMonth >= expectedInstalmentPaise ? 'PAID' : 'PARTIAL';

    const receiptNumber = await generateChitReceiptNumber();

    const collection = new ChitCollection({
      receiptNumber,
      chitGroupId: group._id,
      chitId: group.chitId,
      memberId: member._id,
      memberNumber: member.memberNumber,
      memberName: member.name,
      month: monthNum,
      expectedAmountPaise: expectedInstalmentPaise,
      amountPaidPaise: paidPaise,
      paymentDate: new Date(paymentDate),
      paymentMethod,
      status,
      notes: notes.trim(),
      recordedBy: req.user?.username || 'cpnraja',
    });

    await collection.save();

    // Update Member total paid
    member.totalPaidPaise = (member.totalPaidPaise || 0) + paidPaise;
    await member.save();

    // Update Group total collected & schedule entry
    group.totalCollectedPaise = (group.totalCollectedPaise || 0) + paidPaise;
    scheduleEntry.totalCollectedForMonthPaise = (scheduleEntry.totalCollectedForMonthPaise || 0) + paidPaise;

    // Check if month collection is fully completed
    const monthCols = await ChitCollection.find({ chitGroupId: group._id, month: monthNum, isReversed: false });
    const allPaidForMonth = monthCols.reduce((acc, c) => acc + c.amountPaidPaise, 0);
    const fullExpectedForMonth = expectedInstalmentPaise * 20;

    if (allPaidForMonth >= fullExpectedForMonth) {
      scheduleEntry.collectionStatus = 'COMPLETED';
    } else if (allPaidForMonth > 0) {
      scheduleEntry.collectionStatus = 'PARTIAL';
    }

    await group.save();

    await ChitAuditLog.create({
      chitGroupId: group._id,
      chitId: group.chitId,
      action: 'COLLECTION_RECORDED',
      details: {
        receiptNumber,
        memberNumber: member.memberNumber,
        memberName: member.name,
        month: monthNum,
        amountRupees: toRupees(paidPaise),
      },
      performedBy: req.user?.username || 'cpnraja',
    });

    res.status(201).json({
      success: true,
      message: `Payment of ${formatINR(toRupees(paidPaise))} recorded for ${member.name} (Month ${monthNum}).`,
      collection: {
        receiptNumber,
        memberNumber: member.memberNumber,
        memberName: member.name,
        month: monthNum,
        amountPaidRupees: toRupees(paidPaise),
        remainingRupees: toRupees(remainingPaise),
        status,
        paymentDate: collection.paymentDate,
        paymentMethod: collection.paymentMethod,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 12. REVERSE MEMBER COLLECTION
 */
const reverseMemberCollection = async (req, res, next) => {
  try {
    const { receiptNumber } = req.params;
    const { reason = 'Correction' } = req.body;

    const collection = await ChitCollection.findOne({ receiptNumber, isReversed: false });
    if (!collection) {
      return res.status(404).json({ success: false, message: 'Active collection receipt not found.' });
    }

    const group = await ChitGroup.findById(collection.chitGroupId);
    const member = await ChitMember.findById(collection.memberId);

    collection.isReversed = true;
    collection.reversedAt = new Date();
    collection.reversedReason = reason;
    await collection.save();

    if (member) {
      member.totalPaidPaise = Math.max(0, (member.totalPaidPaise || 0) - collection.amountPaidPaise);
      await member.save();
    }

    if (group) {
      group.totalCollectedPaise = Math.max(0, (group.totalCollectedPaise || 0) - collection.amountPaidPaise);
      const scheduleEntry = group.schedule.find((s) => s.month === collection.month);
      if (scheduleEntry) {
        scheduleEntry.totalCollectedForMonthPaise = Math.max(
          0,
          (scheduleEntry.totalCollectedForMonthPaise || 0) - collection.amountPaidPaise
        );
        if (scheduleEntry.totalCollectedForMonthPaise === 0) {
          scheduleEntry.collectionStatus = 'PENDING';
        } else {
          scheduleEntry.collectionStatus = 'PARTIAL';
        }
      }
      await group.save();
    }

    await ChitAuditLog.create({
      chitGroupId: collection.chitGroupId,
      chitId: collection.chitId,
      action: 'COLLECTION_REVERSED',
      details: { receiptNumber, amountRupees: toRupees(collection.amountPaidPaise), reason },
      performedBy: req.user?.username || 'cpnraja',
    });

    res.json({
      success: true,
      message: `Collection receipt ${receiptNumber} reversed successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 13. RECORD MONTHLY CHIT PAYOUT (பட்டுவாடா)
 */
const recordMonthlyPayout = async (req, res, next) => {
  try {
    const {
      month,
      hasPayout = true,
      memberId,
      payoutAmountRupees,
      kasarRupees,
      payoutDate = new Date(),
      paymentMethod = 'CASH',
      remarks = '',
      overrideDuplicate = false,
    } = req.body;

    const group = await ChitGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Chit group not found.' });
    }

    const monthNum = Number(month);
    const scheduleEntry = group.schedule.find((s) => s.month === monthNum);
    if (!scheduleEntry) {
      return res.status(400).json({ success: false, message: 'Invalid month specified.' });
    }

    // Check if payout already recorded for this month
    const existingPayout = await ChitPayout.findOne({
      chitGroupId: group._id,
      month: monthNum,
      isReversed: false,
    });
    if (existingPayout) {
      return res.status(400).json({
        success: false,
        message: `Month ${monthNum} already has a confirmed payout record (${existingPayout.payoutVoucherNumber}).`,
      });
    }

    const voucherNumber = await generateChitPayoutVoucher();

    // Case 1: NO PAYOUT (e.g. Month 2 in reference or auction skipped)
    if (!hasPayout) {
      const payout = new ChitPayout({
        payoutVoucherNumber: voucherNumber,
        chitGroupId: group._id,
        chitId: group.chitId,
        month: monthNum,
        hasPayout: false,
        memberId: null,
        memberNumber: null,
        memberName: 'No Payout',
        payoutAmountPaise: 0,
        kasarPaise: 0,
        payoutDate: new Date(payoutDate),
        paymentMethod: 'NO_PAYOUT',
        remarks: remarks || 'No member took the chit for this month.',
        recordedBy: req.user?.username || 'cpnraja',
      });

      await payout.save();

      scheduleEntry.payoutStatus = 'NO_PAYOUT';
      scheduleEntry.payoutRecipientName = 'No Payout';
      scheduleEntry.hasPayout = false;
      await group.save();

      await ChitAuditLog.create({
        chitGroupId: group._id,
        chitId: group.chitId,
        action: 'PAYOUT_RECORDED',
        details: { voucherNumber, month: monthNum, hasPayout: false },
        performedBy: req.user?.username || 'cpnraja',
      });

      return res.status(201).json({
        success: true,
        message: `Month ${monthNum} recorded as No Payout successfully.`,
        payout,
      });
    }

    // Case 2: PAYOUT TO A MEMBER
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'Recipient member is required for a payout.' });
    }

    const member = await ChitMember.findOne({ _id: memberId, chitGroupId: group._id });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Recipient member not found in this chit group.' });
    }

    // Check if member already received a payout in this group
    if (member.hasReceivedPayout && !overrideDuplicate) {
      return res.status(400).json({
        success: false,
        message: `Member ${member.name} (Slot ${member.memberNumber}) already received payout in Month ${member.payoutMonth}. Chit fund rules permit only 1 payout per member unless authorized override is selected.`,
      });
    }

    const finalPayoutPaise = payoutAmountRupees !== undefined
      ? toPaise(payoutAmountRupees)
      : scheduleEntry.payoutAmountPaise;

    const finalKasarPaise = kasarRupees !== undefined
      ? toPaise(kasarRupees)
      : scheduleEntry.kasarPaise;

    const payout = new ChitPayout({
      payoutVoucherNumber: voucherNumber,
      chitGroupId: group._id,
      chitId: group.chitId,
      month: monthNum,
      hasPayout: true,
      memberId: member._id,
      memberNumber: member.memberNumber,
      memberName: member.name,
      payoutAmountPaise: finalPayoutPaise,
      kasarPaise: finalKasarPaise,
      payoutDate: new Date(payoutDate),
      paymentMethod,
      remarks: remarks.trim(),
      recordedBy: req.user?.username || 'cpnraja',
    });

    await payout.save();

    // Update Member payout flags
    member.hasReceivedPayout = true;
    member.payoutMonth = monthNum;
    member.payoutAmountPaise = finalPayoutPaise;
    await member.save();

    // Update Group schedule entry & totals
    scheduleEntry.hasPayout = true;
    scheduleEntry.payoutStatus = 'PAID';
    scheduleEntry.payoutRecipientMemberId = member._id;
    scheduleEntry.payoutRecipientMemberNumber = member.memberNumber;
    scheduleEntry.payoutRecipientName = member.name;
    scheduleEntry.payoutDate = new Date(payoutDate);
    scheduleEntry.payoutAmountPaise = finalPayoutPaise;
    scheduleEntry.kasarPaise = finalKasarPaise;

    group.totalPayoutsPaise = (group.totalPayoutsPaise || 0) + finalPayoutPaise;
    await group.save();

    await ChitAuditLog.create({
      chitGroupId: group._id,
      chitId: group.chitId,
      action: 'PAYOUT_RECORDED',
      details: {
        voucherNumber,
        month: monthNum,
        recipient: member.name,
        payoutAmountRupees: toRupees(finalPayoutPaise),
        kasarRupees: toRupees(finalKasarPaise),
      },
      performedBy: req.user?.username || 'cpnraja',
    });

    res.status(201).json({
      success: true,
      message: `Payout of ${formatINR(toRupees(finalPayoutPaise))} handed to ${member.name} for Month ${monthNum}.`,
      payout: {
        voucherNumber,
        month: monthNum,
        recipient: member.name,
        payoutAmountRupees: toRupees(finalPayoutPaise),
        kasarRupees: toRupees(finalKasarPaise),
        payoutDate: payout.payoutDate,
        paymentMethod: payout.paymentMethod,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 14. REVERSE MONTHLY PAYOUT
 */
const reverseMonthlyPayout = async (req, res, next) => {
  try {
    const { voucherNumber } = req.params;
    const { reason = 'Correction' } = req.body;

    const payout = await ChitPayout.findOne({ payoutVoucherNumber: voucherNumber, isReversed: false });
    if (!payout) {
      return res.status(404).json({ success: false, message: 'Active payout voucher not found.' });
    }

    const group = await ChitGroup.findById(payout.chitGroupId);
    const member = payout.memberId ? await ChitMember.findById(payout.memberId) : null;

    payout.isReversed = true;
    payout.reversedAt = new Date();
    payout.reversedReason = reason;
    await payout.save();

    if (member) {
      member.hasReceivedPayout = false;
      member.payoutMonth = null;
      member.payoutAmountPaise = 0;
      await member.save();
    }

    if (group) {
      group.totalPayoutsPaise = Math.max(0, (group.totalPayoutsPaise || 0) - payout.payoutAmountPaise);
      const scheduleEntry = group.schedule.find((s) => s.month === payout.month);
      if (scheduleEntry) {
        scheduleEntry.payoutStatus = 'PENDING';
        scheduleEntry.payoutRecipientMemberId = null;
        scheduleEntry.payoutRecipientMemberNumber = null;
        scheduleEntry.payoutRecipientName = '';
        scheduleEntry.payoutDate = null;
      }
      await group.save();
    }

    await ChitAuditLog.create({
      chitGroupId: payout.chitGroupId,
      chitId: payout.chitId,
      action: 'PAYOUT_REVERSED',
      details: { voucherNumber, amountRupees: toRupees(payout.payoutAmountPaise), reason },
      performedBy: req.user?.username || 'cpnraja',
    });

    res.json({
      success: true,
      message: `Payout voucher ${voucherNumber} reversed successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 15. GET CHIT REPORTS (6 Dedicated Chit Fund Reports)
 */
const getChitReports = async (req, res, next) => {
  try {
    const { reportType, chitId, month, category, startDate, endDate } = req.query;

    let group = null;
    if (chitId) {
      group = await ChitGroup.findOne({ chitId });
    }

    switch (reportType) {
      // Report A: Monthly Collection Report
      case 'monthly-collection': {
        const query = { isReversed: false };
        if (chitId) query.chitId = chitId;
        if (month) query.month = Number(month);
        if (startDate || endDate) {
          query.paymentDate = {};
          if (startDate) query.paymentDate.$gte = new Date(startDate);
          if (endDate) query.paymentDate.$lte = new Date(endDate);
        }

        const collections = await ChitCollection.find(query).sort({ month: 1, paymentDate: -1 });
        const rows = collections.map((c) => ({
          receiptNumber: c.receiptNumber,
          chitId: c.chitId,
          month: c.month,
          memberNumber: c.memberNumber,
          memberName: c.memberName,
          expectedRupees: toRupees(c.expectedAmountPaise),
          paidRupees: toRupees(c.amountPaidPaise),
          paymentDate: c.paymentDate,
          paymentMethod: c.paymentMethod,
          status: c.status,
          notes: c.notes,
        }));

        const totalCollectedRupees = rows.reduce((acc, r) => acc + r.paidRupees, 0);

        return res.json({
          success: true,
          reportType,
          totalCollectedRupees,
          recordsCount: rows.length,
          data: rows,
        });
      }

      // Report B: Monthly Payout Report
      case 'monthly-payout': {
        const query = { isReversed: false };
        if (chitId) query.chitId = chitId;
        if (month) query.month = Number(month);

        const payouts = await ChitPayout.find(query).sort({ month: 1, payoutDate: -1 });
        const rows = payouts.map((p) => ({
          voucherNumber: p.payoutVoucherNumber,
          chitId: p.chitId,
          month: p.month,
          hasPayout: p.hasPayout,
          memberNumber: p.memberNumber,
          memberName: p.memberName || (p.hasPayout ? '' : 'No Payout'),
          payoutAmountRupees: toRupees(p.payoutAmountPaise),
          kasarRupees: toRupees(p.kasarPaise),
          payoutDate: p.payoutDate,
          paymentMethod: p.paymentMethod,
          remarks: p.remarks,
        }));

        const totalPayoutsRupees = rows.reduce((acc, r) => acc + r.payoutAmountRupees, 0);

        return res.json({
          success: true,
          reportType,
          totalPayoutsRupees,
          recordsCount: rows.length,
          data: rows,
        });
      }

      // Report C: Member-wise Report
      case 'member-wise': {
        const query = {};
        if (chitId) query.chitId = chitId;

        const members = await ChitMember.find(query).sort({ chitId: 1, memberNumber: 1 });
        const allGroups = await ChitGroup.find();
        const groupMap = new Map(allGroups.map((g) => [g.chitId, g]));

        const rows = members.map((m) => {
          const g = groupMap.get(m.chitId);
          const perMemberExpected = g ? g.schedule.reduce((acc, s) => acc + s.instalmentPaise, 0) : 0;
          const totalPaid = m.totalPaidPaise || 0;
          const pending = Math.max(0, perMemberExpected - totalPaid);

          return {
            memberId: m._id,
            chitId: m.chitId,
            memberNumber: m.memberNumber,
            name: m.name,
            mobile: m.mobile,
            district: m.district,
            village: m.village,
            status: m.status,
            expectedRupees: toRupees(perMemberExpected),
            paidRupees: toRupees(totalPaid),
            pendingRupees: toRupees(pending),
            hasReceivedPayout: m.hasReceivedPayout,
            payoutMonth: m.payoutMonth,
            payoutAmountRupees: toRupees(m.payoutAmountPaise),
          };
        });

        return res.json({
          success: true,
          reportType,
          recordsCount: rows.length,
          data: rows,
        });
      }

      // Report D: Chit Group Report
      case 'chit-group': {
        const query = {};
        if (category && category !== 'ALL') query.category = category;

        const groups = await ChitGroup.find(query).sort({ chitId: 1 });
        const rows = groups.map((g) => ({
          chitId: g.chitId,
          name: g.name,
          category: g.category,
          status: g.status,
          totalValueRupees: toRupees(g.totalValuePaise),
          memberCount: g.memberCount,
          currentMonth: g.currentMonth,
          expectedRupees: toRupees(g.totalInstalmentExpectedPaise),
          collectedRupees: toRupees(g.totalCollectedPaise),
          payoutsRupees: toRupees(g.totalPayoutsPaise),
          outstandingRupees: toRupees(Math.max(0, g.totalInstalmentExpectedPaise - g.totalCollectedPaise)),
          progressPercent: g.totalInstalmentExpectedPaise > 0
            ? Math.round((g.totalCollectedPaise / g.totalInstalmentExpectedPaise) * 100)
            : 0,
        }));

        return res.json({
          success: true,
          reportType,
          data: rows,
        });
      }

      // Report E: Outstanding / Defaulters Report
      case 'outstanding': {
        const query = {};
        if (chitId) query.chitId = chitId;

        const members = await ChitMember.find(query).sort({ memberNumber: 1 });
        const allGroups = await ChitGroup.find();
        const groupMap = new Map(allGroups.map((g) => [g.chitId, g]));

        const rows = [];
        for (const m of members) {
          const g = groupMap.get(m.chitId);
          if (!g) continue;

          // Check against current month expected
          const currentMonthSchedule = g.schedule.filter((s) => s.month <= (g.currentMonth || 1));
          const expectedToCurrentMonth = currentMonthSchedule.reduce((acc, s) => acc + s.instalmentPaise, 0);
          const totalPaid = m.totalPaidPaise || 0;
          const pending = Math.max(0, expectedToCurrentMonth - totalPaid);

          if (pending > 0) {
            rows.push({
              chitId: m.chitId,
              memberNumber: m.memberNumber,
              name: m.name,
              mobile: m.mobile,
              currentMonth: g.currentMonth,
              expectedToCurrentMonthRupees: toRupees(expectedToCurrentMonth),
              paidRupees: toRupees(totalPaid),
              overdueRupees: toRupees(pending),
              hasReceivedPayout: m.hasReceivedPayout,
            });
          }
        }

        return res.json({
          success: true,
          reportType,
          totalOverdueRupees: rows.reduce((acc, r) => acc + r.overdueRupees, 0),
          defaultersCount: rows.length,
          data: rows,
        });
      }

      // Report F: Category-wise Report
      case 'category-wise': {
        const groups = await ChitGroup.find();
        const categories = ['5_LAKH', '10_LAKH', '20_LAKH'];

        const summary = categories.map((cat) => {
          const catGroups = groups.filter((g) => g.category === cat);
          const totalGroups = catGroups.length;
          const activeGroups = catGroups.filter((g) => g.status === 'ACTIVE').length;
          const totalChitValue = catGroups.reduce((acc, g) => acc + g.totalValuePaise, 0);
          const totalCollected = catGroups.reduce((acc, g) => acc + g.totalCollectedPaise, 0);
          const totalPayouts = catGroups.reduce((acc, g) => acc + g.totalPayoutsPaise, 0);
          const totalExpected = catGroups.reduce((acc, g) => acc + g.totalInstalmentExpectedPaise, 0);

          return {
            category: cat,
            label: cat.replace('_', ' ') + ' Chit',
            totalGroups,
            activeGroups,
            totalChitValueRupees: toRupees(totalChitValue),
            totalExpectedRupees: toRupees(totalExpected),
            totalCollectedRupees: toRupees(totalCollected),
            totalPayoutsRupees: toRupees(totalPayouts),
            outstandingRupees: toRupees(Math.max(0, totalExpected - totalCollected)),
          };
        });

        return res.json({
          success: true,
          reportType,
          data: summary,
        });
      }

      default:
        return res.status(400).json({ success: false, message: 'Invalid reportType requested.' });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChitSummary,
  getChitGroups,
  getChitGroupById,
  createChitGroup,
  updateChitSchedule,
  getChitMembers,
  addChitMember,
  updateChitMember,
  getChitMemberById,
  getMonthlyCollectionSheet,
  recordMemberCollection,
  reverseMemberCollection,
  recordMonthlyPayout,
  reverseMonthlyPayout,
  getChitReports,
};
