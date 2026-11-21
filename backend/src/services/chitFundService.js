/**
 * Chit Fund Reference Schedules & Calculation Engine
 * 
 * Sources of truth:
 * - ₹10 Lakh Chit: Exact transcription from reference sheet (Total Inst: ₹8,62,750, Total Kasar: ₹1,37,250)
 * - ₹20 Lakh Chit: Exact transcription from reference sheet (Total Inst: ₹17,25,500, Total Kasar: ₹2,74,500)
 * - ₹5 Lakh Chit: Configurable proposal requiring explicit owner confirmation & approval.
 */

const { toPaise, toRupees } = require('./calculationEngine');

// 10 Lakh Reference (20 months, 20 members, base monthly 50,000 INR)
const CHIT_10_LAKH_SCHEDULE_RUPEES = [
  { month: 1,  chitAmount: 50000, instalment: 34500, kasar: 15500, payoutAmount: 650000, hasPayout: true },
  { month: 2,  chitAmount: 50000, instalment: 50000, kasar: 0,     payoutAmount: 0,      hasPayout: false },
  { month: 3,  chitAmount: 50000, instalment: 35000, kasar: 15000, payoutAmount: 660000, hasPayout: true },
  { month: 4,  chitAmount: 50000, instalment: 36000, kasar: 14000, payoutAmount: 680000, hasPayout: true },
  { month: 5,  chitAmount: 50000, instalment: 37000, kasar: 13000, payoutAmount: 700000, hasPayout: true },
  { month: 6,  chitAmount: 50000, instalment: 38000, kasar: 12000, payoutAmount: 720000, hasPayout: true },
  { month: 7,  chitAmount: 50000, instalment: 39000, kasar: 11000, payoutAmount: 740000, hasPayout: true },
  { month: 8,  chitAmount: 50000, instalment: 40000, kasar: 10000, payoutAmount: 760000, hasPayout: true },
  { month: 9,  chitAmount: 50000, instalment: 41000, kasar: 9000,  payoutAmount: 780000, hasPayout: true },
  { month: 10, chitAmount: 50000, instalment: 42000, kasar: 8000,  payoutAmount: 800000, hasPayout: true },
  { month: 11, chitAmount: 50000, instalment: 43000, kasar: 7000,  payoutAmount: 820000, hasPayout: true },
  { month: 12, chitAmount: 50000, instalment: 44000, kasar: 6000,  payoutAmount: 840000, hasPayout: true },
  { month: 13, chitAmount: 50000, instalment: 45000, kasar: 5000,  payoutAmount: 860000, hasPayout: true },
  { month: 14, chitAmount: 50000, instalment: 46000, kasar: 4000,  payoutAmount: 880000, hasPayout: true },
  { month: 15, chitAmount: 50000, instalment: 47000, kasar: 3000,  payoutAmount: 900000, hasPayout: true },
  { month: 16, chitAmount: 50000, instalment: 48000, kasar: 2000,  payoutAmount: 920000, hasPayout: true },
  { month: 17, chitAmount: 50000, instalment: 48500, kasar: 1500,  payoutAmount: 930000, hasPayout: true },
  { month: 18, chitAmount: 50000, instalment: 49000, kasar: 1000,  payoutAmount: 940000, hasPayout: true },
  { month: 19, chitAmount: 50000, instalment: 49750, kasar: 250,   payoutAmount: 955000, hasPayout: true },
  { month: 20, chitAmount: 50000, instalment: 50000, kasar: 0,     payoutAmount: 965000, hasPayout: true },
];

// 20 Lakh Reference (20 months, 20 members, base monthly 1,00,000 INR)
const CHIT_20_LAKH_SCHEDULE_RUPEES = [
  { month: 1,  chitAmount: 100000, instalment: 69000,  kasar: 31000, payoutAmount: 1300000, hasPayout: true },
  { month: 2,  chitAmount: 100000, instalment: 100000, kasar: 0,     payoutAmount: 0,       hasPayout: false },
  { month: 3,  chitAmount: 100000, instalment: 70000,  kasar: 30000, payoutAmount: 1320000, hasPayout: true },
  { month: 4,  chitAmount: 100000, instalment: 72000,  kasar: 28000, payoutAmount: 1360000, hasPayout: true },
  { month: 5,  chitAmount: 100000, instalment: 74000,  kasar: 26000, payoutAmount: 1400000, hasPayout: true },
  { month: 6,  chitAmount: 100000, instalment: 76000,  kasar: 24000, payoutAmount: 1440000, hasPayout: true },
  { month: 7,  chitAmount: 100000, instalment: 78000,  kasar: 22000, payoutAmount: 1480000, hasPayout: true },
  { month: 8,  chitAmount: 100000, instalment: 80000,  kasar: 20000, payoutAmount: 1520000, hasPayout: true },
  { month: 9,  chitAmount: 100000, instalment: 82000,  kasar: 18000, payoutAmount: 1560000, hasPayout: true },
  { month: 10, chitAmount: 100000, instalment: 84000,  kasar: 16000, payoutAmount: 1600000, hasPayout: true },
  { month: 11, chitAmount: 100000, instalment: 86000,  kasar: 14000, payoutAmount: 1640000, hasPayout: true },
  { month: 12, chitAmount: 100000, instalment: 88000,  kasar: 12000, payoutAmount: 1680000, hasPayout: true },
  { month: 13, chitAmount: 100000, instalment: 90000,  kasar: 10000, payoutAmount: 1720000, hasPayout: true },
  { month: 14, chitAmount: 100000, instalment: 92000,  kasar: 8000,  payoutAmount: 1760000, hasPayout: true },
  { month: 15, chitAmount: 100000, instalment: 94000,  kasar: 6000,  payoutAmount: 1800000, hasPayout: true },
  { month: 16, chitAmount: 100000, instalment: 96000,  kasar: 4000,  payoutAmount: 1840000, hasPayout: true },
  { month: 17, chitAmount: 100000, instalment: 97000,  kasar: 3000,  payoutAmount: 1860000, hasPayout: true },
  { month: 18, chitAmount: 100000, instalment: 98000,  kasar: 2000,  payoutAmount: 1880000, hasPayout: true },
  { month: 19, chitAmount: 100000, instalment: 99500,  kasar: 500,   payoutAmount: 1910000, hasPayout: true },
  { month: 20, chitAmount: 100000, instalment: 100000, kasar: 0,     payoutAmount: 1930000, hasPayout: true },
];

// 5 Lakh Default Configurable Template (Draft proposal pending owner approval)
const CHIT_5_LAKH_DRAFT_SCHEDULE_RUPEES = [
  { month: 1,  chitAmount: 25000, instalment: 17250, kasar: 7750, payoutAmount: 325000, hasPayout: true },
  { month: 2,  chitAmount: 25000, instalment: 25000, kasar: 0,    payoutAmount: 0,      hasPayout: false },
  { month: 3,  chitAmount: 25000, instalment: 17500, kasar: 7500, payoutAmount: 330000, hasPayout: true },
  { month: 4,  chitAmount: 25000, instalment: 18000, kasar: 7000, payoutAmount: 340000, hasPayout: true },
  { month: 5,  chitAmount: 25000, instalment: 18500, kasar: 6500, payoutAmount: 350000, hasPayout: true },
  { month: 6,  chitAmount: 25000, instalment: 19000, kasar: 6000, payoutAmount: 360000, hasPayout: true },
  { month: 7,  chitAmount: 25000, instalment: 19500, kasar: 5500, payoutAmount: 370000, hasPayout: true },
  { month: 8,  chitAmount: 25000, instalment: 20000, kasar: 5000, payoutAmount: 380000, hasPayout: true },
  { month: 9,  chitAmount: 25000, instalment: 20500, kasar: 4500, payoutAmount: 390000, hasPayout: true },
  { month: 10, chitAmount: 25000, instalment: 21000, kasar: 4000, payoutAmount: 400000, hasPayout: true },
  { month: 11, chitAmount: 25000, instalment: 21500, kasar: 3500, payoutAmount: 410000, hasPayout: true },
  { month: 12, chitAmount: 25000, instalment: 22000, kasar: 3000, payoutAmount: 420000, hasPayout: true },
  { month: 13, chitAmount: 25000, instalment: 22500, kasar: 2500, payoutAmount: 430000, hasPayout: true },
  { month: 14, chitAmount: 25000, instalment: 23000, kasar: 2000, payoutAmount: 440000, hasPayout: true },
  { month: 15, chitAmount: 25000, instalment: 23500, kasar: 1500, payoutAmount: 450000, hasPayout: true },
  { month: 16, chitAmount: 25000, instalment: 24000, kasar: 1000, payoutAmount: 460000, hasPayout: true },
  { month: 17, chitAmount: 25000, instalment: 24250, kasar: 750,  payoutAmount: 465000, hasPayout: true },
  { month: 18, chitAmount: 25000, instalment: 24500, kasar: 500,  payoutAmount: 470000, hasPayout: true },
  { month: 19, chitAmount: 25000, instalment: 24875, kasar: 125,  payoutAmount: 477500, hasPayout: true },
  { month: 20, chitAmount: 25000, instalment: 25000, kasar: 0,    payoutAmount: 482500, hasPayout: true },
];

/**
 * Generate initial schedule in integer paise for a chit category
 */
function getInitialScheduleForCategory(category, firstInstalmentDate) {
  let sourceArray;
  let isScheduleApproved = true;

  if (category === '10_LAKH') {
    sourceArray = CHIT_10_LAKH_SCHEDULE_RUPEES;
  } else if (category === '20_LAKH') {
    sourceArray = CHIT_20_LAKH_SCHEDULE_RUPEES;
  } else {
    sourceArray = CHIT_5_LAKH_DRAFT_SCHEDULE_RUPEES;
    isScheduleApproved = false; // Owner must configure & approve 5L
  }

  const baseDate = new Date(firstInstalmentDate || Date.now());

  const schedule = sourceArray.map((row, idx) => {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + idx);

    return {
      month: row.month,
      chitAmountPaise: toPaise(row.chitAmount),
      instalmentPaise: toPaise(row.instalment),
      kasarPaise: toPaise(row.kasar),
      payoutAmountPaise: toPaise(row.payoutAmount),
      hasPayout: row.hasPayout,
      payoutRecipientMemberId: null,
      payoutRecipientMemberNumber: null,
      payoutRecipientName: '',
      payoutDate: null,
      payoutStatus: row.hasPayout ? 'PENDING' : 'NO_PAYOUT',
      collectionStatus: 'PENDING',
      totalCollectedForMonthPaise: 0,
      dueDate,
    };
  });

  return {
    schedule,
    isScheduleApproved,
  };
}

/**
 * Get category metadata
 */
function getCategoryMeta(category) {
  switch (category) {
    case '5_LAKH':
      return {
        label: '₹5,00,000 – 5 Lakh Chit',
        totalValuePaise: toPaise(500000),
        monthlyChitAmountPaise: toPaise(25000),
        maxMembers: 20,
        durationMonths: 20,
        prefix: 'CPN-5L',
      };
    case '10_LAKH':
      return {
        label: '₹10,00,000 – 10 Lakh Chit',
        totalValuePaise: toPaise(1000000),
        monthlyChitAmountPaise: toPaise(50000),
        maxMembers: 20,
        durationMonths: 20,
        prefix: 'CPN-10L',
      };
    case '20_LAKH':
      return {
        label: '₹20,00,000 – 20 Lakh Chit',
        totalValuePaise: toPaise(2000000),
        monthlyChitAmountPaise: toPaise(100000),
        maxMembers: 20,
        durationMonths: 20,
        prefix: 'CPN-20L',
      };
    default:
      throw new Error(`Invalid chit category: ${category}`);
  }
}

module.exports = {
  CHIT_10_LAKH_SCHEDULE_RUPEES,
  CHIT_20_LAKH_SCHEDULE_RUPEES,
  CHIT_5_LAKH_DRAFT_SCHEDULE_RUPEES,
  getInitialScheduleForCategory,
  getCategoryMeta,
};
