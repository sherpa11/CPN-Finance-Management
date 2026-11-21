require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const CalculationConfiguration = require('../models/CalculationConfiguration');
const Customer = require('../models/Customer');
const Loan = require('../models/Loan');
const Transaction = require('../models/Transaction');
const Collection = require('../models/Collection');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const connectDB = require('../config/db');
const { calculateLoanInterest, toPaise } = require('../services/calculationEngine');
const { evaluateDueNotifications } = require('../services/notificationService');
const CONSTANTS = require('../config/constants');

async function seed() {
  await connectDB();
  console.log('[Seed] Connected to MongoDB. Seeding initial configuration & admin account...');

  // 1. Seed or Update Default Calculation Configurations
  const configs = [
    {
      configType: 'MONTHLY',
      isActive: true,
      isPendingOwnerConfirmation: true,
      description: 'Monthly simple interest with configurable partial month rule. Pending owner confirmation for partial-month treatment.',
      settings: {
        partialMonthRule: CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY,
        isSimpleInterest: true,
        leapYearAware: true,
        defaultInterestRatePercent: 2.0,
      },
    },
    {
      configType: 'DAILY',
      isActive: true,
      isPendingOwnerConfirmation: false,
      description: 'Daily simple interest with Asia/Kolkata date handling.',
      settings: {
        dateInclusionConvention: CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END,
        isSimpleInterest: true,
        defaultInterestRatePercent: 0.1,
      },
    },
    {
      configType: 'MEATER',
      isActive: true,
      isPendingOwnerConfirmation: true,
      description: 'Meater Finance category. Exact formula pending owner confirmation as per specification.',
      settings: {
        isFormulaConfirmed: false,
        status: 'PENDING_CONFIRMATION',
        formulaNote: 'The owner has not yet confirmed the exact calculation formula. Independent account management active.',
      },
    },
    {
      configType: 'BUSINESS',
      isActive: true,
      isPendingOwnerConfirmation: false,
      description: 'Global business and operational rules.',
      settings: {
        businessName: CONSTANTS.APP_NAME,
        businessOwner: CONSTANTS.BUSINESS_OWNER,
        reminderDays: CONSTANTS.DEFAULT_REMINDER_DAYS,
        timezone: CONSTANTS.DEFAULT_TIMEZONE,
        currency: 'INR',
      },
    },
  ];

  for (const cfg of configs) {
    await CalculationConfiguration.findOneAndUpdate(
      { configType: cfg.configType },
      { $set: cfg },
      { upsert: true, returnDocument: 'after' }
    );
  }
  console.log('[Seed] Calculation configurations verified.');

  // 2. Seed Default Admin User: CPN Raja
  let admin = await User.findOne({ username: 'cpnraja' });
  if (!admin) {
    admin = new User({
      username: 'cpnraja',
      fullName: 'CPN Raja',
      email: 'cpnraja@vattibusiness.com',
      passwordHash: 'cpnraja2026', // Will be hashed by pre-save hook
      role: 'admin',
      isActive: true,
    });
    await admin.save();
    console.log('[Seed] Admin user created: username="cpnraja", password="cpnraja2026"');
  } else {
    console.log('[Seed] Admin user "cpnraja" already exists.');
  }

  // 3. Trigger Due Evaluation
  await evaluateDueNotifications();
  console.log('[Seed] Evaluated due notifications.');

  console.log('[Seed] Database initialization complete! Clean production configuration active.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
