const MoiSeerPerson = require('../models/MoiSeerPerson');
const MoiSeerContribution = require('../models/MoiSeerContribution');
const AuditLog = require('../models/AuditLog');
const { toPaise, toRupees } = require('../services/calculationEngine');
const { DateTime } = require('luxon');
const { escapeRegex } = require('../utils/sanitize');

// Generate Next Sequential Person ID (e.g. MSP-0001)
async function getNextPersonId() {
  const lastPerson = await MoiSeerPerson.findOne({}, { personId: 1 })
    .sort({ createdAt: -1 })
    .lean();

  if (!lastPerson || !lastPerson.personId) {
    return 'MSP-0001';
  }

  const match = lastPerson.personId.match(/\d+$/);
  const nextNum = match ? parseInt(match[0], 10) + 1 : 1;
  return `MSP-${String(nextNum).padStart(4, '0')}`;
}

// Generate Next Sequential Contribution ID (e.g. MSC-0001)
async function getNextContributionId() {
  const lastContrib = await MoiSeerContribution.findOne({}, { contributionId: 1 })
    .sort({ createdAt: -1 })
    .lean();

  if (!lastContrib || !lastContrib.contributionId) {
    return 'MSC-0001';
  }

  const match = lastContrib.contributionId.match(/\d+$/);
  const nextNum = match ? parseInt(match[0], 10) + 1 : 1;
  return `MSC-${String(nextNum).padStart(4, '0')}`;
}

// ---------------------------------------------------------
// 1. DASHBOARD SUMMARY INSIDE MOI / SEER MODULE
// ---------------------------------------------------------
exports.getSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, district, village } = req.query;

    const query = {};
    if (district && district !== 'ALL') {
      query.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
    }
    if (village && village !== 'ALL') {
      query.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');
    }
    if (startDate || endDate) {
      query.contributionDate = {};
      if (startDate) {
        query.contributionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.contributionDate.$lte = eDate;
      }
    }

    // Run aggregation for metrics
    const [stats] = await MoiSeerContribution.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalContributionRecords: { $sum: 1 },
          totalMoneyPaise: {
            $sum: {
              $cond: [{ $eq: ['$contributionType', 'MONEY'] }, '$amountPaise', 0],
            },
          },
          totalMaterialEntries: {
            $sum: {
              $cond: [{ $eq: ['$contributionType', 'MATERIAL'] }, 1, 0],
            },
          },
          uniqueContributors: { $addToSet: '$personId' },
        },
      },
    ]);

    // If query is empty, total contributors is total registered persons
    let totalContributors = stats ? stats.uniqueContributors.length : 0;
    if (!startDate && !endDate && (!district || district === 'ALL') && (!village || village === 'ALL')) {
      totalContributors = await MoiSeerPerson.countDocuments();
    }

    return res.json({
      success: true,
      summary: {
        totalContributors,
        totalMoneyPaise: stats ? stats.totalMoneyPaise : 0,
        totalMoneyRupees: stats ? toRupees(stats.totalMoneyPaise) : 0,
        totalMaterialEntries: stats ? stats.totalMaterialEntries : 0,
        totalContributionRecords: stats ? stats.totalContributionRecords : 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------
// 2. PERSON MANAGEMENT
// ---------------------------------------------------------
exports.getPersons = async (req, res, next) => {
  try {
    const { search, district, village, page = 1, limit = 50 } = req.query;

    const query = {};
    if (search && search.trim()) {
      const s = escapeRegex(search.trim());
      query.$or = [
        { name: new RegExp(s, 'i') },
        { personId: new RegExp(s, 'i') },
        { village: new RegExp(s, 'i') },
        { district: new RegExp(s, 'i') },
      ];
    }
    if (district && district !== 'ALL') {
      query.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
    }
    if (village && village !== 'ALL') {
      query.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [persons, total] = await Promise.all([
      MoiSeerPerson.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      MoiSeerPerson.countDocuments(query),
    ]);

    const formatted = persons.map((p) => ({
      ...p,
      totalMoneyRupees: toRupees(p.totalMoneyPaise || 0),
    }));

    return res.json({
      success: true,
      persons: formatted,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    next(err);
  }
};

exports.getPersonById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const person = await MoiSeerPerson.findById(id).lean();
    if (!person) {
      return res.status(404).json({ success: false, message: 'Person not found' });
    }

    const contributions = await MoiSeerContribution.find({ personId: person._id })
      .sort({ contributionDate: -1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      person: {
        ...person,
        totalMoneyRupees: toRupees(person.totalMoneyPaise || 0),
      },
      contributions,
    });
  } catch (err) {
    next(err);
  }
};

exports.createPerson = async (req, res, next) => {
  try {
    const { name, district, village, date, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Person name is required' });
    }
    if (!district || !district.trim()) {
      return res.status(400).json({ success: false, message: 'District is required' });
    }
    if (!village || !village.trim()) {
      return res.status(400).json({ success: false, message: 'Village is required' });
    }

    // Check for potential existing duplicates to help administrator
    const existing = await MoiSeerPerson.findOne({
      name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i'),
      village: new RegExp(`^${escapeRegex(village.trim())}$`, 'i'),
      district: new RegExp(`^${escapeRegex(district.trim())}$`, 'i'),
    }).lean();

    const personId = await getNextPersonId();

    const newPerson = await MoiSeerPerson.create({
      personId,
      name: name.trim(),
      district: district.trim(),
      village: village.trim(),
      date: date ? new Date(date) : new Date(),
      notes: notes ? notes.trim() : '',
    });

    await AuditLog.create({
      logId: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: 'MOI_SEER_PERSON_CREATED',
      entityType: 'MOI_SEER_PERSON',
      entityId: newPerson.personId,
      performedBy: req.user?.username || 'cpnraja',
      ipAddress: req.ip || '',
      newState: newPerson.toObject(),
      details: `Registered person ${newPerson.name} (${newPerson.personId}) from ${newPerson.village}, ${newPerson.district}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Person registered successfully',
      person: {
        ...newPerson.toObject(),
        totalMoneyRupees: 0,
      },
      warning: existing ? `Note: A person named "${existing.name}" already exists in ${existing.village}.` : null,
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePerson = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, district, village, notes } = req.body;

    const person = await MoiSeerPerson.findById(id);
    if (!person) {
      return res.status(404).json({ success: false, message: 'Person not found' });
    }

    const previousState = person.toObject();

    if (name) person.name = name.trim();
    if (district) person.district = district.trim();
    if (village) person.village = village.trim();
    if (notes !== undefined) person.notes = notes.trim();

    await person.save();

    // Cascade name, village, district update to existing contribution records for this person
    await MoiSeerContribution.updateMany(
      { personId: person._id },
      {
        $set: {
          personName: person.name,
          district: person.district,
          village: person.village,
        },
      }
    );

    await AuditLog.create({
      logId: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: 'MOI_SEER_PERSON_UPDATED',
      entityType: 'MOI_SEER_PERSON',
      entityId: person.personId,
      performedBy: req.user?.username || 'cpnraja',
      ipAddress: req.ip || '',
      previousState,
      newState: person.toObject(),
      details: `Updated details for ${person.name} (${person.personId})`,
    });

    return res.json({
      success: true,
      message: 'Person details updated successfully',
      person: {
        ...person.toObject(),
        totalMoneyRupees: toRupees(person.totalMoneyPaise || 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------
// 3. CONTRIBUTIONS RECORDING & MANAGEMENT
// ---------------------------------------------------------
exports.getContributions = async (req, res, next) => {
  try {
    const {
      search,
      type,
      district,
      village,
      startDate,
      endDate,
      personId,
      materialName,
      page = 1,
      limit = 50,
      sortBy = 'contributionDate',
      sortOrder = 'desc',
    } = req.query;

    const query = {};

    if (personId) {
      query.personId = personId;
    }

    if (type && type !== 'ALL') {
      query.contributionType = type.toUpperCase();
    }

    if (district && district !== 'ALL') {
      query.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
    }

    if (village && village !== 'ALL') {
      query.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');
    }

    if (materialName && materialName.trim()) {
      query.materialName = new RegExp(escapeRegex(materialName.trim()), 'i');
    }

    if (startDate || endDate) {
      query.contributionDate = {};
      if (startDate) {
        query.contributionDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        query.contributionDate.$lte = eDate;
      }
    }

    if (search && search.trim()) {
      const s = escapeRegex(search.trim());
      query.$or = [
        { personName: new RegExp(s, 'i') },
        { personCode: new RegExp(s, 'i') },
        { materialName: new RegExp(s, 'i') },
        { village: new RegExp(s, 'i') },
        { district: new RegExp(s, 'i') },
        { description: new RegExp(s, 'i') },
        { contributionId: new RegExp(s, 'i') },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
    if (sortBy !== 'createdAt') {
      sortObj.createdAt = -1;
    }

    const [contributions, total] = await Promise.all([
      MoiSeerContribution.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      MoiSeerContribution.countDocuments(query),
    ]);

    return res.json({
      success: true,
      contributions,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    next(err);
  }
};

exports.createContribution = async (req, res, next) => {
  try {
    const { personId, contributionDate, district, village, items } = req.body;

    if (!personId) {
      return res.status(400).json({ success: false, message: 'Person selection is required' });
    }

    const person = await MoiSeerPerson.findById(personId);
    if (!person) {
      return res.status(404).json({ success: false, message: 'Selected person not found' });
    }

    const dateToUse = contributionDate ? new Date(contributionDate) : new Date();
    const distToUse = (district && district.trim()) || person.district;
    const villToUse = (village && village.trim()) || person.village;

    // Items array support: allows submitting multiple items (e.g. money + multiple materials) together
    let itemsList = items;
    if (!itemsList || !Array.isArray(itemsList) || itemsList.length === 0) {
      // Fallback to single item payload
      const { contributionType, amount, materialName, quantity, description } = req.body;
      itemsList = [{ contributionType, amount, materialName, quantity, description }];
    }

    const createdRecords = [];
    let addedMoneyPaise = 0;
    let addedMaterialCount = 0;

    for (const item of itemsList) {
      const type = (item.contributionType || 'MONEY').toUpperCase();
      if (type !== 'MONEY' && type !== 'MATERIAL') {
        return res.status(400).json({
          success: false,
          message: 'Invalid contribution type. Must be MONEY or MATERIAL.',
        });
      }

      const contribId = await getNextContributionId();
      let amountPaise = 0;
      let amountRupees = 0;
      let matName = '';
      let qty = '';

      if (type === 'MONEY') {
        const numAmount = Number(item.amount);
        if (isNaN(numAmount) || numAmount <= 0) {
          return res.status(400).json({
            success: false,
            message: 'Valid money amount in ₹ is required for money contributions.',
          });
        }
        amountPaise = toPaise(numAmount);
        amountRupees = toRupees(amountPaise);
        addedMoneyPaise += amountPaise;
      } else {
        if (!item.materialName || !item.materialName.trim()) {
          return res.status(400).json({
            success: false,
            message: 'Material name is required for material contributions.',
          });
        }
        if (!item.quantity || !String(item.quantity).trim()) {
          return res.status(400).json({
            success: false,
            message: 'Quantity is required for material contributions.',
          });
        }
        matName = item.materialName.trim();
        qty = String(item.quantity).trim();
        addedMaterialCount += 1;
      }

      const record = await MoiSeerContribution.create({
        contributionId: contribId,
        personId: person._id,
        personCode: person.personId,
        personName: person.name,
        contributionDate: dateToUse,
        district: distToUse,
        village: villToUse,
        contributionType: type,
        amountPaise,
        amountRupees,
        materialName: matName,
        quantity: qty,
        description: item.description ? item.description.trim() : '',
        createdBy: req.user?.username || 'cpnraja',
      });

      createdRecords.push(record);
    }

    // Update person aggregate counters
    person.totalMoneyPaise = (person.totalMoneyPaise || 0) + addedMoneyPaise;
    person.totalMaterialCount = (person.totalMaterialCount || 0) + addedMaterialCount;
    person.totalContributionsCount = (person.totalContributionsCount || 0) + createdRecords.length;
    await person.save();

    // Create Audit Log
    await AuditLog.create({
      logId: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: 'MOI_SEER_CONTRIBUTION_RECORDED',
      entityType: 'MOI_SEER_CONTRIBUTION',
      entityId: createdRecords.map((r) => r.contributionId).join(', '),
      performedBy: req.user?.username || 'cpnraja',
      ipAddress: req.ip || '',
      newState: createdRecords.map((r) => r.toObject()),
      details: `Recorded ${createdRecords.length} Moi/Seer entry for ${person.name} (${person.personId}) on ${DateTime.fromJSDate(dateToUse).toISODate()}`,
    });

    return res.status(201).json({
      success: true,
      message: `${createdRecords.length} contribution record(s) saved successfully.`,
      contributions: createdRecords,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateContribution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contributionDate, district, village, contributionType, amount, materialName, quantity, description } = req.body;

    const contribution = await MoiSeerContribution.findById(id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution record not found' });
    }

    const previousState = contribution.toObject();
    const person = await MoiSeerPerson.findById(contribution.personId);

    // Track delta for person totals
    let prevAmountPaise = contribution.contributionType === 'MONEY' ? contribution.amountPaise : 0;
    let prevMaterialCount = contribution.contributionType === 'MATERIAL' ? 1 : 0;

    if (contributionDate) contribution.contributionDate = new Date(contributionDate);
    if (district) contribution.district = district.trim();
    if (village) contribution.village = village.trim();
    if (description !== undefined) contribution.description = description.trim();

    if (contributionType) {
      const newType = contributionType.toUpperCase();
      if (newType !== 'MONEY' && newType !== 'MATERIAL') {
        return res.status(400).json({ success: false, message: 'Type must be MONEY or MATERIAL' });
      }
      contribution.contributionType = newType;
    }

    let newAmountPaise = 0;
    let newMaterialCount = 0;

    if (contribution.contributionType === 'MONEY') {
      const numAmount = Number(amount !== undefined ? amount : contribution.amountRupees);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid positive amount in ₹ is required' });
      }
      contribution.amountPaise = toPaise(numAmount);
      contribution.amountRupees = toRupees(contribution.amountPaise);
      contribution.materialName = '';
      contribution.quantity = '';
      newAmountPaise = contribution.amountPaise;
    } else {
      if (materialName) contribution.materialName = materialName.trim();
      if (quantity) contribution.quantity = String(quantity).trim();
      contribution.amountPaise = 0;
      contribution.amountRupees = 0;
      newMaterialCount = 1;
    }

    await contribution.save();

    // Adjust person running counters
    if (person) {
      person.totalMoneyPaise = Math.max(0, (person.totalMoneyPaise || 0) - prevAmountPaise + newAmountPaise);
      person.totalMaterialCount = Math.max(0, (person.totalMaterialCount || 0) - prevMaterialCount + newMaterialCount);
      await person.save();
    }

    await AuditLog.create({
      logId: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: 'MOI_SEER_CONTRIBUTION_UPDATED',
      entityType: 'MOI_SEER_CONTRIBUTION',
      entityId: contribution.contributionId,
      performedBy: req.user?.username || 'cpnraja',
      ipAddress: req.ip || '',
      previousState,
      newState: contribution.toObject(),
      details: `Edited contribution ${contribution.contributionId} for ${contribution.personName}`,
    });

    return res.json({
      success: true,
      message: 'Contribution record updated successfully',
      contribution,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteContribution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const contribution = await MoiSeerContribution.findById(id);
    if (!contribution) {
      return res.status(404).json({ success: false, message: 'Contribution record not found' });
    }

    const previousState = contribution.toObject();
    const person = await MoiSeerPerson.findById(contribution.personId);

    // Subtract from person counters
    if (person) {
      if (contribution.contributionType === 'MONEY') {
        person.totalMoneyPaise = Math.max(0, (person.totalMoneyPaise || 0) - (contribution.amountPaise || 0));
      } else {
        person.totalMaterialCount = Math.max(0, (person.totalMaterialCount || 0) - 1);
      }
      person.totalContributionsCount = Math.max(0, (person.totalContributionsCount || 0) - 1);
      await person.save();
    }

    await MoiSeerContribution.findByIdAndDelete(id);

    await AuditLog.create({
      logId: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      action: 'MOI_SEER_CONTRIBUTION_DELETED',
      entityType: 'MOI_SEER_CONTRIBUTION',
      entityId: contribution.contributionId,
      performedBy: req.user?.username || 'cpnraja',
      ipAddress: req.ip || '',
      previousState,
      details: `Deleted contribution ${contribution.contributionId} (${contribution.personName} - ${contribution.contributionType}). Reason: ${reason || 'Administrator deletion'}`,
    });

    return res.json({
      success: true,
      message: 'Contribution record deleted successfully with audit trail preserved',
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------
// 4. REPORTS – INSIDE THE SAME MENU (6 COMPREHENSIVE REPORTS)
// ---------------------------------------------------------
exports.getReports = async (req, res, next) => {
  try {
    const { reportType = 'daily', date, startDate, endDate, district, village, personId } = req.query;

    // -----------------------------------------------------
    // REPORT A: DAILY REPORT
    // -----------------------------------------------------
    if (reportType === 'daily') {
      const selectedDate = date
        ? DateTime.fromISO(date, { zone: 'Asia/Kolkata' })
        : DateTime.now().setZone('Asia/Kolkata');

      const startOfDay = selectedDate.startOf('day').toJSDate();
      const endOfDay = selectedDate.endOf('day').toJSDate();

      const query = {
        contributionDate: { $gte: startOfDay, $lte: endOfDay },
      };
      if (district && district !== 'ALL') query.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
      if (village && village !== 'ALL') query.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');

      const contributions = await MoiSeerContribution.find(query)
        .sort({ createdAt: -1 })
        .lean();

      let moneyTotalPaise = 0;
      let materialEntriesCount = 0;
      const uniquePersons = new Set();
      const materialsSummary = {};

      for (const c of contributions) {
        uniquePersons.add(c.personCode);
        if (c.contributionType === 'MONEY') {
          moneyTotalPaise += c.amountPaise || 0;
        } else {
          materialEntriesCount += 1;
          const key = c.materialName || 'Unspecified';
          materialsSummary[key] = (materialsSummary[key] || 0) + 1;
        }
      }

      return res.json({
        success: true,
        reportType: 'daily',
        reportDate: selectedDate.toISODate(),
        summary: {
          peopleRecordedToday: uniquePersons.size,
          moneyReceivedPaise: moneyTotalPaise,
          moneyReceivedRupees: toRupees(moneyTotalPaise),
          materialsReceivedCount: materialEntriesCount,
          totalRecordsToday: contributions.length,
          materialsBreakdown: Object.entries(materialsSummary).map(([mat, count]) => ({
            materialName: mat,
            count,
          })),
        },
        contributions,
      });
    }

    // -----------------------------------------------------
    // REPORT B: DATE-WISE REPORT
    // -----------------------------------------------------
    if (reportType === 'date-wise') {
      const query = {};
      if (startDate || endDate) {
        query.contributionDate = {};
        if (startDate) query.contributionDate.$gte = new Date(startDate);
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          query.contributionDate.$lte = e;
        }
      }
      if (district && district !== 'ALL') query.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
      if (village && village !== 'ALL') query.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');

      const contributions = await MoiSeerContribution.find(query)
        .sort({ contributionDate: -1, createdAt: -1 })
        .lean();

      let totalMoneyPaise = 0;
      let totalMaterialCount = 0;
      const materialMap = {};

      for (const c of contributions) {
        if (c.contributionType === 'MONEY') {
          totalMoneyPaise += c.amountPaise || 0;
        } else {
          totalMaterialCount += 1;
          const mat = c.materialName || 'Unspecified';
          if (!materialMap[mat]) {
            materialMap[mat] = {
              materialName: mat,
              count: 0,
              quantities: [],
              contributors: new Set(),
            };
          }
          materialMap[mat].count += 1;
          materialMap[mat].quantities.push(c.quantity);
          materialMap[mat].contributors.add(c.personName);
        }
      }

      const materialWiseSummary = Object.values(materialMap).map((m) => ({
        materialName: m.materialName,
        totalEntries: m.count,
        quantitiesRecorded: m.quantities.join(', '),
        contributorCount: m.contributors.size,
      }));

      return res.json({
        success: true,
        reportType: 'date-wise',
        startDate: startDate || null,
        endDate: endDate || null,
        summary: {
          totalMoneyPaise,
          totalMoneyRupees: toRupees(totalMoneyPaise),
          totalMaterialEntries: totalMaterialCount,
          totalRecords: contributions.length,
          materialWiseSummary,
        },
        contributions,
      });
    }

    // -----------------------------------------------------
    // REPORT C: DISTRICT-WISE REPORT
    // -----------------------------------------------------
    if (reportType === 'district-wise') {
      const matchQuery = {};
      if (startDate || endDate) {
        matchQuery.contributionDate = {};
        if (startDate) matchQuery.contributionDate.$gte = new Date(startDate);
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          matchQuery.contributionDate.$lte = e;
        }
      }

      const districts = await MoiSeerContribution.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$district',
            totalMoneyPaise: {
              $sum: { $cond: [{ $eq: ['$contributionType', 'MONEY'] }, '$amountPaise', 0] },
            },
            materialEntriesCount: {
              $sum: { $cond: [{ $eq: ['$contributionType', 'MATERIAL'] }, 1, 0] },
            },
            uniquePersons: { $addToSet: '$personId' },
            materials: {
              $push: {
                $cond: [
                  { $eq: ['$contributionType', 'MATERIAL'] },
                  { name: '$materialName', qty: '$quantity' },
                  '$$REMOVE',
                ],
              },
            },
          },
        },
        { $sort: { totalMoneyPaise: -1, _id: 1 } },
      ]);

      const formatted = districts.map((d) => ({
        district: d._id || 'Unspecified',
        totalContributors: d.uniquePersons.length,
        totalMoneyPaise: d.totalMoneyPaise,
        totalMoneyRupees: toRupees(d.totalMoneyPaise),
        materialEntriesCount: d.materialEntriesCount,
        materialsList: d.materials,
      }));

      return res.json({
        success: true,
        reportType: 'district-wise',
        districts: formatted,
      });
    }

    // -----------------------------------------------------
    // REPORT D: VILLAGE-WISE REPORT
    // -----------------------------------------------------
    if (reportType === 'village-wise') {
      const matchQuery = {};
      if (district && district !== 'ALL') matchQuery.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
      if (startDate || endDate) {
        matchQuery.contributionDate = {};
        if (startDate) matchQuery.contributionDate.$gte = new Date(startDate);
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          matchQuery.contributionDate.$lte = e;
        }
      }

      const villages = await MoiSeerContribution.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: { village: '$village', district: '$district' },
            totalMoneyPaise: {
              $sum: { $cond: [{ $eq: ['$contributionType', 'MONEY'] }, '$amountPaise', 0] },
            },
            materialEntriesCount: {
              $sum: { $cond: [{ $eq: ['$contributionType', 'MATERIAL'] }, 1, 0] },
            },
            uniquePersons: { $addToSet: '$personId' },
            materials: {
              $push: {
                $cond: [
                  { $eq: ['$contributionType', 'MATERIAL'] },
                  { name: '$materialName', qty: '$quantity' },
                  '$$REMOVE',
                ],
              },
            },
          },
        },
        { $sort: { totalMoneyPaise: -1, '_id.village': 1 } },
      ]);

      const formatted = villages.map((v) => ({
        village: v._id.village || 'Unspecified',
        district: v._id.district || 'Unspecified',
        totalContributors: v.uniquePersons.length,
        totalMoneyPaise: v.totalMoneyPaise,
        totalMoneyRupees: toRupees(v.totalMoneyPaise),
        materialEntriesCount: v.materialEntriesCount,
        materialsList: v.materials,
      }));

      return res.json({
        success: true,
        reportType: 'village-wise',
        villages: formatted,
      });
    }

    // -----------------------------------------------------
    // REPORT E: MATERIAL-WISE REPORT
    // -----------------------------------------------------
    if (reportType === 'material-wise') {
      const matchQuery = { contributionType: 'MATERIAL' };
      if (startDate || endDate) {
        matchQuery.contributionDate = {};
        if (startDate) matchQuery.contributionDate.$gte = new Date(startDate);
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(23, 59, 59, 999);
          matchQuery.contributionDate.$lte = e;
        }
      }

      const materials = await MoiSeerContribution.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$materialName',
            totalEntries: { $sum: 1 },
            contributors: { $addToSet: '$personName' },
            entries: {
              $push: {
                personName: '$personName',
                village: '$village',
                district: '$district',
                quantity: '$quantity',
                date: '$contributionDate',
              },
            },
          },
        },
        { $sort: { totalEntries: -1, _id: 1 } },
      ]);

      const formatted = materials.map((m) => ({
        materialName: m._id || 'Unspecified',
        totalEntries: m.totalEntries,
        uniqueContributorsCount: m.contributors.length,
        contributorNames: m.contributors,
        detailedEntries: m.entries,
      }));

      return res.json({
        success: true,
        reportType: 'material-wise',
        materials: formatted,
      });
    }

    // -----------------------------------------------------
    // REPORT F: PERSON-WISE REPORT
    // -----------------------------------------------------
    if (reportType === 'person-wise') {
      const personQuery = {};
      if (personId) {
        personQuery._id = personId;
      }
      if (district && district !== 'ALL') personQuery.district = new RegExp(`^${escapeRegex(district.trim())}$`, 'i');
      if (village && village !== 'ALL') personQuery.village = new RegExp(`^${escapeRegex(village.trim())}$`, 'i');

      const persons = await MoiSeerPerson.find(personQuery).sort({ name: 1 }).lean();

      // Retrieve contributions for these persons
      const personIds = persons.map((p) => p._id);
      const contributions = await MoiSeerContribution.find({ personId: { $in: personIds } })
        .sort({ contributionDate: -1 })
        .lean();

      const groupedByPerson = {};
      for (const p of persons) {
        groupedByPerson[p._id.toString()] = {
          personId: p.personId,
          name: p.name,
          district: p.district,
          village: p.village,
          notes: p.notes,
          totalMoneyPaise: 0,
          moneyContributions: [],
          materialContributions: [],
          contributionDates: new Set(),
        };
      }

      for (const c of contributions) {
        const pKey = c.personId.toString();
        if (groupedByPerson[pKey]) {
          groupedByPerson[pKey].contributionDates.add(
            DateTime.fromJSDate(c.contributionDate).toISODate()
          );
          if (c.contributionType === 'MONEY') {
            groupedByPerson[pKey].totalMoneyPaise += c.amountPaise || 0;
            groupedByPerson[pKey].moneyContributions.push({
              date: c.contributionDate,
              amountRupees: c.amountRupees,
              description: c.description,
              contributionId: c.contributionId,
            });
          } else {
            groupedByPerson[pKey].materialContributions.push({
              date: c.contributionDate,
              materialName: c.materialName,
              quantity: c.quantity,
              description: c.description,
              contributionId: c.contributionId,
            });
          }
        }
      }

      const reportData = Object.values(groupedByPerson).map((p) => ({
        ...p,
        totalMoneyRupees: toRupees(p.totalMoneyPaise),
        contributionDates: Array.from(p.contributionDates),
      }));

      return res.json({
        success: true,
        reportType: 'person-wise',
        persons: reportData,
      });
    }

    return res.status(400).json({
      success: false,
      message: `Unknown reportType: ${reportType}. Valid options: daily, date-wise, district-wise, village-wise, material-wise, person-wise`,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------
// 5. HELPER AUTOCOMPLETE / LOOKUPS
// ---------------------------------------------------------
exports.getLocations = async (req, res, next) => {
  try {
    const [personDistricts, contribDistricts, personVillages, contribVillages] = await Promise.all([
      MoiSeerPerson.distinct('district'),
      MoiSeerContribution.distinct('district'),
      MoiSeerPerson.distinct('village'),
      MoiSeerContribution.distinct('village'),
    ]);

    const districts = Array.from(
      new Set([...personDistricts, ...contribDistricts].filter(Boolean).map((d) => d.trim()))
    ).sort();

    const villages = Array.from(
      new Set([...personVillages, ...contribVillages].filter(Boolean).map((v) => v.trim()))
    ).sort();

    return res.json({
      success: true,
      districts,
      villages,
    });
  } catch (err) {
    next(err);
  }
};

exports.getMaterials = async (req, res, next) => {
  try {
    const materials = await MoiSeerContribution.distinct('materialName', {
      contributionType: 'MATERIAL',
    });

    const cleanList = Array.from(
      new Set(materials.filter(Boolean).map((m) => m.trim()))
    ).sort();

    return res.json({
      success: true,
      materials: cleanList,
    });
  } catch (err) {
    next(err);
  }
};
