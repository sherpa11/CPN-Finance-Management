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
      description: 'Meater Vatti category. Exact formula pending owner confirmation as per specification.',
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

  // 3. Check if sample customers exist. If none, seed initial customers and loans for demonstration
  const custCount = await Customer.countDocuments();
  if (custCount === 0) {
    console.log('[Seed] Populating realistic sample business data...');

    const sampleCustomers = [
      {
        customerId: 'CPN-CUST-0001',
        name: 'Murugan Sundaram',
        mobileNumber: '9840123456',
        address: 'No. 14, Bazaar Street, Salem',
        notes: 'Regular monthly borrower, prompt payer',
      },
      {
        customerId: 'CPN-CUST-0002',
        name: 'Kavitha Ramachandran',
        mobileNumber: '9840234567',
        address: 'No. 88, Gandhi Road, Namakkal',
        notes: 'Daily market vendor',
      },
      {
        customerId: 'CPN-CUST-0003',
        name: 'Senthil Velan',
        mobileNumber: '9840345678',
        address: 'No. 22, Railway Feeder Road, Erode',
        notes: 'Meater vatti borrower',
      },
    ];

    const createdCustomers = await Customer.insertMany(sampleCustomers);

    // Create 1 Monthly loan (Murugan)
    const startDateM = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
    const dueDateM = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days later
    const principalM = toPaise(50000); // ₹50,000
    const rateM = 2.0; // 2% per month

    const calcM = calculateLoanInterest({
      vattiType: 'MONTHLY',
      principalPaise: principalM,
      ratePercent: rateM,
      startDate: startDateM,
      asOfDate: new Date(),
      config: { partialMonthRule: 'PRO_RATA_DAILY' },
    });

    const loanM = new Loan({
      loanId: 'CPN-LN-0001',
      customerId: createdCustomers[0]._id,
      customerCode: createdCustomers[0].customerId,
      customerName: createdCustomers[0].name,
      customerMobile: createdCustomers[0].mobileNumber,
      vattiType: 'MONTHLY',
      principalPaise: principalM,
      interestRatePercent: rateM,
      startDate: startDateM,
      dueDate: dueDateM,
      status: 'ACTIVE',
      calculationConfigSnapshot: { partialMonthRule: 'PRO_RATA_DAILY' },
      outstandingPrincipalPaise: principalM,
      accruedInterestPaise: calcM.interestPaise,
      outstandingInterestPaise: calcM.interestPaise,
      remarks: 'Initial monthly business loan',
    });
    await loanM.save();

    await new Transaction({
      transactionId: 'CPN-TXN-00001',
      customerId: createdCustomers[0]._id,
      loanId: loanM._id,
      date: startDateM,
      type: 'LOAN_DISBURSEMENT',
      principalDebitPaise: principalM,
      balancePrincipalPaise: principalM,
      balanceInterestPaise: 0,
      balanceTotalPaise: principalM,
      remarks: 'Disbursed Monthly loan CPN-LN-0001',
      referenceId: loanM.loanId,
    }).save();

    createdCustomers[0].totalLentPaise = principalM;
    createdCustomers[0].outstandingPrincipalPaise = principalM;
    createdCustomers[0].outstandingInterestPaise = calcM.interestPaise;
    createdCustomers[0].activeLoanCount = 1;
    createdCustomers[0].totalLoanCount = 1;
    await createdCustomers[0].save();

    // Create 1 Daily loan (Kavitha) - Due today
    const startDateD = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const dueDateD = new Date(); // Due today!
    const principalD = toPaise(20000); // ₹20,000
    const rateD = 0.1; // 0.1% per day

    const calcD = calculateLoanInterest({
      vattiType: 'DAILY',
      principalPaise: principalD,
      ratePercent: rateD,
      startDate: startDateD,
      asOfDate: new Date(),
      config: { dateInclusionConvention: 'INCLUDE_START_EXCLUDE_END' },
    });

    const loanD = new Loan({
      loanId: 'CPN-LN-0002',
      customerId: createdCustomers[1]._id,
      customerCode: createdCustomers[1].customerId,
      customerName: createdCustomers[1].name,
      customerMobile: createdCustomers[1].mobileNumber,
      vattiType: 'DAILY',
      principalPaise: principalD,
      interestRatePercent: rateD,
      startDate: startDateD,
      dueDate: dueDateD,
      status: 'ACTIVE',
      calculationConfigSnapshot: { dateInclusionConvention: 'INCLUDE_START_EXCLUDE_END' },
      outstandingPrincipalPaise: principalD,
      accruedInterestPaise: calcD.interestPaise,
      outstandingInterestPaise: calcD.interestPaise,
      remarks: 'Daily market loan due today',
    });
    await loanD.save();

    await new Transaction({
      transactionId: 'CPN-TXN-00002',
      customerId: createdCustomers[1]._id,
      loanId: loanD._id,
      date: startDateD,
      type: 'LOAN_DISBURSEMENT',
      principalDebitPaise: principalD,
      balancePrincipalPaise: principalD,
      balanceInterestPaise: 0,
      balanceTotalPaise: principalD,
      remarks: 'Disbursed Daily loan CPN-LN-0002',
      referenceId: loanD.loanId,
    }).save();

    createdCustomers[1].totalLentPaise = principalD;
    createdCustomers[1].outstandingPrincipalPaise = principalD;
    createdCustomers[1].outstandingInterestPaise = calcD.interestPaise;
    createdCustomers[1].activeLoanCount = 1;
    createdCustomers[1].totalLoanCount = 1;
    await createdCustomers[1].save();

    // Create 1 Meater loan (Senthil)
    const startDateMeater = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const dueDateMeater = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);
    const principalMeater = toPaise(30000);

    const loanMeater = new Loan({
      loanId: 'CPN-LN-0003',
      customerId: createdCustomers[2]._id,
      customerCode: createdCustomers[2].customerId,
      customerName: createdCustomers[2].name,
      customerMobile: createdCustomers[2].mobileNumber,
      vattiType: 'MEATER',
      principalPaise: principalMeater,
      interestRatePercent: 1.5,
      startDate: startDateMeater,
      dueDate: dueDateMeater,
      status: 'ACTIVE',
      calculationConfigSnapshot: { isFormulaConfirmed: false },
      outstandingPrincipalPaise: principalMeater,
      accruedInterestPaise: 0,
      outstandingInterestPaise: 0,
      remarks: 'Meater loan - calculation pending owner confirmation',
      meaterConfig: {
        status: 'PENDING_CONFIRMATION',
        note: 'Formula pending owner confirmation as per business specification',
      },
    });
    await loanMeater.save();

    await new Transaction({
      transactionId: 'CPN-TXN-00003',
      customerId: createdCustomers[2]._id,
      loanId: loanMeater._id,
      date: startDateMeater,
      type: 'LOAN_DISBURSEMENT',
      principalDebitPaise: principalMeater,
      balancePrincipalPaise: principalMeater,
      balanceInterestPaise: 0,
      balanceTotalPaise: principalMeater,
      remarks: 'Disbursed Meater loan CPN-LN-0003',
      referenceId: loanMeater.loanId,
    }).save();

    createdCustomers[2].totalLentPaise = principalMeater;
    createdCustomers[2].outstandingPrincipalPaise = principalMeater;
    createdCustomers[2].activeLoanCount = 1;
    createdCustomers[2].totalLoanCount = 1;
    await createdCustomers[2].save();

    console.log('[Seed] Sample customers and loans seeded successfully.');
  }

  // 4. Trigger Due Evaluation
  await evaluateDueNotifications();
  console.log('[Seed] Evaluated due notifications.');

  console.log('[Seed] Database initialization complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
