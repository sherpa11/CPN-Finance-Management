const CalculationConfiguration = require('../models/CalculationConfiguration');
const AuditLog = require('../models/AuditLog');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Collection = require('../models/Collection');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const User = require('../models/User');
const DailyCollectionAccount = require('../models/DailyCollectionAccount');
const DailyCollectionPayment = require('../models/DailyCollectionPayment');
const ChitGroup = require('../models/ChitGroup');
const ChitMember = require('../models/ChitMember');
const ChitCollection = require('../models/ChitCollection');
const ChitPayout = require('../models/ChitPayout');
const ChitAuditLog = require('../models/ChitAuditLog');
const MoiSeerPerson = require('../models/MoiSeerPerson');
const MoiSeerContribution = require('../models/MoiSeerContribution');
const { invalidateDashboardCache } = require('./dashboardController');
const { logAuditEvent } = require('../services/auditService');
const CONSTANTS = require('../config/constants');

/**
 * Get all current configurations
 */
const getSettings = async (req, res, next) => {
  try {
    const configs = await CalculationConfiguration.find();

    const configMap = {};
    configs.forEach((c) => {
      configMap[c.configType] = {
        id: c._id,
        configType: c.configType,
        isActive: c.isActive,
        settings: c.settings,
        isPendingOwnerConfirmation: c.isPendingOwnerConfirmation,
        description: c.description,
        version: c.version,
        updatedAt: c.updatedAt,
        updatedBy: c.updatedBy,
      };
    });

    res.json({
      success: true,
      businessDetails: {
        appName: CONSTANTS.APP_NAME,
        businessOwner: CONSTANTS.BUSINESS_OWNER,
        timezone: CONSTANTS.DEFAULT_TIMEZONE,
        currency: 'INR',
        currencySymbol: '₹',
      },
      configurations: configMap,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a specific calculation or business configuration
 * Requirement: Changes to future settings must NOT silently modify historical transactions.
 */
const updateConfiguration = async (req, res, next) => {
  try {
    const { configType, settings, isPendingOwnerConfirmation, description } = req.body;

    if (!configType || !settings) {
      return res.status(400).json({ success: false, message: 'configType and settings are required' });
    }

    let configDoc = await CalculationConfiguration.findOne({ configType });
    const previousState = configDoc ? configDoc.toObject() : null;

    if (!configDoc) {
      configDoc = new CalculationConfiguration({
        configType,
        settings,
        isPendingOwnerConfirmation: !!isPendingOwnerConfirmation,
        description: description || '',
        updatedBy: req.user.username,
        version: 1,
      });
    } else {
      configDoc.settings = { ...configDoc.settings, ...settings };
      if (isPendingOwnerConfirmation !== undefined) {
        configDoc.isPendingOwnerConfirmation = isPendingOwnerConfirmation;
      }
      if (description !== undefined) {
        configDoc.description = description;
      }
      configDoc.version = (configDoc.version || 1) + 1;
      configDoc.updatedBy = req.user.username;
    }

    await configDoc.save();

    await logAuditEvent({
      action: 'UPDATE_CONFIG',
      entityType: 'SETTINGS',
      entityId: configDoc._id,
      performedBy: req.user.username,
      ipAddress: req.ip,
      previousState,
      newState: configDoc.toObject(),
      details: `Updated configuration for ${configType} to version ${configDoc.version}. Historical transactions preserved.`,
    });

    res.json({
      success: true,
      message: `Configuration for ${configType} updated successfully`,
      configuration: configDoc,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Audit Logs with pagination & filters
 */
const getAuditLogs = async (req, res, next) => {
  try {
    const { action, entityType, page = 1, limit = 50 } = req.query;
    const query = {};

    if (action && action !== 'ALL') query.action = action;
    if (entityType && entityType !== 'ALL') query.entityType = entityType;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      logs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Export Complete Database Backup for Recovery
 * Requirement 15: Database backups, export and recovery procedures.
 */
const exportDatabaseBackup = async (req, res, next) => {
  try {
    const [
      customers,
      loans,
      collections,
      transactions,
      notifications,
      configurations,
      auditLogs,
      users,
    ] = await Promise.all([
      Customer.find().lean(),
      Loan.find().lean(),
      Collection.find().lean(),
      Transaction.find().lean(),
      Notification.find().lean(),
      CalculationConfiguration.find().lean(),
      AuditLog.find().sort({ timestamp: -1 }).limit(1000).lean(),
      User.find().select('-passwordHash').lean(),
    ]);

    const backupData = {
      meta: {
        application: CONSTANTS.APP_NAME,
        businessOwner: CONSTANTS.BUSINESS_OWNER,
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.username,
        counts: {
          customers: customers.length,
          loans: loans.length,
          collections: collections.length,
          transactions: transactions.length,
          notifications: notifications.length,
        },
      },
      data: {
        customers,
        loans,
        collections,
        transactions,
        notifications,
        configurations,
        auditLogs,
        users,
      },
    };

    await logAuditEvent({
      action: 'EXPORT_DATABASE_BACKUP',
      entityType: 'SETTINGS',
      entityId: 'SYSTEM',
      performedBy: req.user.username,
      ipAddress: req.ip,
      details: 'Full database snapshot exported',
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=CPN_RAJA_BACKUP_${Date.now()}.json`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    next(error);
  }
};

/**
 * Reset and remove all demo/test data from the database
 * Strictly requires admin authorization and explicit confirmation { confirm: 'CLEAR_DEMO_DATA' }
 */
const resetDemoData = async (req, res, next) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'CLEAR_DEMO_DATA') {
      return res.status(400).json({
        success: false,
        message: 'Explicit confirmation required. Send { confirm: "CLEAR_DEMO_DATA" } to remove all demo data.',
      });
    }

    const [
      customersDeleted,
      loansDeleted,
      collectionsDeleted,
      transactionsDeleted,
      notificationsDeleted,
      dcAccountsDeleted,
      dcPaymentsDeleted,
      chitGroupsDeleted,
      chitMembersDeleted,
      chitCollectionsDeleted,
      chitPayoutsDeleted,
      chitAuditLogsDeleted,
      moiPersonsDeleted,
      moiContributionsDeleted,
      auditLogsDeleted,
    ] = await Promise.all([
      Customer.deleteMany({}),
      Loan.deleteMany({}),
      Collection.deleteMany({}),
      Transaction.deleteMany({}),
      Notification.deleteMany({}),
      DailyCollectionAccount.deleteMany({}),
      DailyCollectionPayment.deleteMany({}),
      ChitGroup.deleteMany({}),
      ChitMember.deleteMany({}),
      ChitCollection.deleteMany({}),
      ChitPayout.deleteMany({}),
      ChitAuditLog.deleteMany({}),
      MoiSeerPerson.deleteMany({}),
      MoiSeerContribution.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // Invalidate dashboard caching
    invalidateDashboardCache();

    // Log the reset event in AuditLog as the initial clean baseline entry
    await logAuditEvent({
      action: 'SYSTEM_RESET',
      entityType: 'SETTINGS',
      entityId: 'SYSTEM',
      performedBy: req.user.username,
      ipAddress: req.ip,
      details: 'All demo and test data removed by admin. System initialized for clean production use.',
    });

    res.json({
      success: true,
      message: 'All demo and test data has been successfully removed. System is clean and ready for live production transactions.',
      summary: {
        customers: customersDeleted.deletedCount,
        loans: loansDeleted.deletedCount,
        collections: collectionsDeleted.deletedCount,
        transactions: transactionsDeleted.deletedCount,
        notifications: notificationsDeleted.deletedCount,
        dailyCollectionAccounts: dcAccountsDeleted.deletedCount,
        dailyCollectionPayments: dcPaymentsDeleted.deletedCount,
        chitGroups: chitGroupsDeleted.deletedCount,
        chitMembers: chitMembersDeleted.deletedCount,
        chitCollections: chitCollectionsDeleted.deletedCount,
        chitPayouts: chitPayoutsDeleted.deletedCount,
        moiPersons: moiPersonsDeleted.deletedCount,
        moiContributions: moiContributionsDeleted.deletedCount,
        auditLogs: auditLogsDeleted.deletedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateConfiguration,
  getAuditLogs,
  exportDatabaseBackup,
  resetDemoData,
};
