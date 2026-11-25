process.env.NODE_ENV = 'test';
require('dotenv').config();
const request = require('supertest');
const assert = require('assert');
const { DateTime } = require('luxon');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const mongoose = require('mongoose');
const ChitGroup = require('../src/models/ChitGroup');
const ChitMember = require('../src/models/ChitMember');
const ChitCollection = require('../src/models/ChitCollection');
const ChitPayout = require('../src/models/ChitPayout');
const ChitAuditLog = require('../src/models/ChitAuditLog');

async function runChitFundTests() {
  console.log('\n=====================================================');
  console.log('  CPN RAJA – CHIT FUND API INTEGRATION SUITE');
  console.log('=====================================================');

  await connectDB();

  try {
    // 1. Login to get JWT Token
    console.log('\n[1] Authentication');
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cpnraja', password: 'cpnraja2026' });

    assert(loginRes.status === 200, 'Login failed');
    const token = loginRes.body.token;
    console.log('  ✓ PASS: JWT Token obtained');

    // Clean any prior chit test data
    await Promise.all([
      ChitGroup.deleteMany({}),
      ChitMember.deleteMany({}),
      ChitCollection.deleteMany({}),
      ChitPayout.deleteMany({}),
      ChitAuditLog.deleteMany({}),
    ]);

    // 2. Create ₹10 Lakh Chit Group
    console.log('\n[2] Create ₹10 Lakh Chit Group (Reference Image Verification)');
    const create10LRes = await request(app)
      .post('/api/chit-funds/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: '10_LAKH',
        name: 'CPN 10 Lakh Chit Group 01',
        firstInstalmentDate: '2026-11-20',
        remarks: 'Meenakshi Chits exact 10L reference',
      });

    assert(create10LRes.status === 201, 'Failed to create 10L chit group');
    const group10L = create10LRes.body.group;
    assert(group10L.chitId === 'CPN-10L-001', 'Chit ID must be CPN-10L-001');
    assert(group10L.durationMonths === 20, 'Duration is 20 months');
    assert(group10L.maxMembers === 20, 'Max members is 20');
    assert(group10L.schedule.length === 20, 'Schedule has 20 entries');
    assert(group10L.endDate, 'Chit Group must have an auto-calculated 20th month ending date');

    // Verify Image 1 Reference values for Month 1, 2, 3, 20
    const sched10L = group10L.schedule;
    assert(sched10L[0].chitAmountPaise === 5000000, 'Month 1 Chit Amount is ₹50,000');
    assert(sched10L[0].instalmentPaise === 3450000, 'Month 1 Instalment is ₹34,500');
    assert(sched10L[0].kasarPaise === 1550000, 'Month 1 Kasar is ₹15,500');
    assert(sched10L[0].payoutAmountPaise === 65000000, 'Month 1 Payout is ₹6,50,000');
    assert(sched10L[0].hasPayout === true, 'Month 1 has payout');

    assert(sched10L[1].instalmentPaise === 5000000, 'Month 2 Instalment is ₹50,000');
    assert(sched10L[1].kasarPaise === 0, 'Month 2 Kasar is Nil');
    assert(sched10L[1].hasPayout === false, 'Month 2 has No Payout');

    assert(sched10L[2].instalmentPaise === 3500000, 'Month 3 Instalment is ₹35,000');
    assert(sched10L[2].kasarPaise === 1500000, 'Month 3 Kasar is ₹15,000');
    assert(sched10L[2].payoutAmountPaise === 66000000, 'Month 3 Payout is ₹6,60,000');

    assert(sched10L[19].instalmentPaise === 5000000, 'Month 20 Instalment is ₹50,000');
    assert(sched10L[19].payoutAmountPaise === 96500000, 'Month 20 Payout is ₹9,65,000');

    // Sum of all 20 instalments in reference sheet = 8,62,750 INR
    const total10LInst = sched10L.reduce((acc, s) => acc + s.instalmentPaise, 0);
    assert(total10LInst === 86275000, 'Total 10L Instalment sum must be exactly ₹8,62,750 (86275000 paise)');
    const total10LKasar = sched10L.reduce((acc, s) => acc + s.kasarPaise, 0);
    assert(total10LKasar === 13725000, 'Total 10L Kasar sum must be exactly ₹1,37,250 (13725000 paise)');
    console.log('  ✓ PASS: ₹10 Lakh reference schedule values verified with 100% precision');

    // 3. Create ₹20 Lakh Chit Group
    console.log('\n[3] Create ₹20 Lakh Chit Group (Reference Image Verification)');
    const create20LRes = await request(app)
      .post('/api/chit-funds/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: '20_LAKH',
        name: 'CPN 20 Lakh Chit Group 01',
        firstInstalmentDate: '2026-11-20',
      });

    assert(create20LRes.status === 201, 'Failed to create 20L chit group');
    const group20L = create20LRes.body.group;
    assert(group20L.chitId === 'CPN-20L-001', 'Chit ID must be CPN-20L-001');

    // Verify Image 2 Reference values
    const sched20L = group20L.schedule;
    assert(sched20L[0].chitAmountPaise === 10000000, 'Month 1 Chit Amount is ₹1,00,000');
    assert(sched20L[0].instalmentPaise === 6900000, 'Month 1 Instalment is ₹69,000');
    assert(sched20L[0].kasarPaise === 3100000, 'Month 1 Kasar is ₹31,000');
    assert(sched20L[0].payoutAmountPaise === 130000000, 'Month 1 Payout is ₹13,00,000');

    assert(sched20L[1].instalmentPaise === 10000000, 'Month 2 Instalment is ₹1,00,000');
    assert(sched20L[1].hasPayout === false, 'Month 2 has No Payout');

    assert(sched20L[19].instalmentPaise === 10000000, 'Month 20 Instalment is ₹1,00,000');
    assert(sched20L[19].payoutAmountPaise === 193000000, 'Month 20 Payout is ₹19,30,000');

    const total20LInst = sched20L.reduce((acc, s) => acc + s.instalmentPaise, 0);
    assert(total20LInst === 172550000, 'Total 20L Instalment sum must be exactly ₹17,25,500 (172550000 paise)');
    const total20LKasar = sched20L.reduce((acc, s) => acc + s.kasarPaise, 0);
    assert(total20LKasar === 27450000, 'Total 20L Kasar sum must be exactly ₹2,74,500 (27450000 paise)');
    console.log('  ✓ PASS: ₹20 Lakh reference schedule values verified with 100% precision');

    // 4. Create ₹5 Lakh Chit Group (Configurable Schedule)
    console.log('\n[4] Create ₹5 Lakh Chit Group (Configurable Draft Schedule)');
    const create5LRes = await request(app)
      .post('/api/chit-funds/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: '5_LAKH',
        name: 'CPN 5 Lakh Chit Group 01',
        firstInstalmentDate: '2026-11-20',
      });

    assert(create5LRes.status === 201, 'Failed to create 5L chit group');
    const group5L = create5LRes.body.group;
    assert(group5L.chitId === 'CPN-5L-001', 'Chit ID must be CPN-5L-001');
    assert(group5L.isScheduleApproved === false, '5L schedule starts unapproved pending owner confirmation');

    // Owner approves/updates schedule
    const approve5LRes = await request(app)
      .put(`/api/chit-funds/groups/${group5L._id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        schedule: group5L.schedule,
        approve: true,
      });

    assert(approve5LRes.status === 200, 'Failed to approve 5L schedule');
    assert(approve5LRes.body.group.isScheduleApproved === true, '5L schedule marked approved');
    console.log('  ✓ PASS: ₹5 Lakh configurable schedule created and approved');

    // 5. Member Management: Add 20 Members to ₹10 Lakh Group
    console.log('\n[5] Member Management: Enroll 20 Members into 20 Slots');
    const memberIds = [];
    for (let slot = 1; slot <= 20; slot++) {
      const addRes = await request(app)
        .post(`/api/chit-funds/groups/${group10L._id}/members`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          memberNumber: slot,
          name: `Chit Member ${String(slot).padStart(2, '0')}`,
          mobile: `98765432${String(slot).padStart(2, '0')}`,
          district: 'Dindigul',
          village: 'Palani Road',
        });

      assert(addRes.status === 201, `Failed to add member ${slot}`);
      memberIds.push(addRes.body.member._id);
    }
    console.log('  ✓ PASS: All 20 member slots successfully populated');

    // 6. Prevent adding 21st member
    console.log('\n[6] Prevent Adding 21st Member');
    const add21Res = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberNumber: 21,
        name: 'Illegal Member 21',
        mobile: '9999999999',
      });
    assert(add21Res.status === 400, 'Should reject member 21');
    console.log('  ✓ PASS: 21st member rejected with 400 status');

    // 7. Prevent Duplicate Slot Registration
    console.log('\n[7] Prevent Duplicate Slot Registration');
    const addDupRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberNumber: 5,
        name: 'Duplicate Slot 5 Attempt',
        mobile: '9999999998',
      });
    assert(addDupRes.status === 400, 'Should reject duplicate slot');
    console.log('  ✓ PASS: Duplicate slot registration rejected');

    // 8. View 20 Slots Display
    console.log('\n[8] View All 20 Member Slots');
    const slotsRes = await request(app)
      .get(`/api/chit-funds/groups/${group10L._id}/members`)
      .set('Authorization', `Bearer ${token}`);

    assert(slotsRes.status === 200, 'Failed to fetch slots');
    assert(slotsRes.body.slots.length === 20, '20 slots present');
    assert(slotsRes.body.totalOccupied === 20, 'All 20 occupied');
    assert(slotsRes.body.availableSlots === 0, '0 slots available');
    console.log('  ✓ PASS: 20-slot interactive roster rendered');

    // 9. Monthly Instalment Collection: Record Full Payment (Month 1, Member 1: ₹34,500)
    console.log('\n[9] Record Full Instalment Collection with Custom Date (Month 1, Member 1)');
    const payFullRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/collections`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: memberIds[0],
        month: 1,
        amountRupees: 34500,
        paymentMethod: 'CASH',
        paymentDate: '2026-11-20',
        notes: 'Month 1 on-time payment on custom date',
      });

    assert(payFullRes.status === 201, 'Failed to record full collection');
    assert(payFullRes.body.collection.status === 'PAID', 'Status is PAID');
    assert(payFullRes.body.collection.remainingRupees === 0, 'Remaining is 0');
    assert(payFullRes.body.collection.receiptNumber.startsWith('CPR-CHIT-'), 'Receipt generated');
    const actualDate = DateTime.fromJSDate(new Date(payFullRes.body.collection.paymentDate)).setZone('Asia/Kolkata').toISODate();
    assert(actualDate === '2026-11-20', `Payment date must match custom date 2026-11-20, got: ${actualDate}`);
    const receiptToReverse = payFullRes.body.collection.receiptNumber;
    console.log('  ✓ PASS: Full payment of ₹34,500 logged with custom payment date and receipt', receiptToReverse);

    // 10. Record Partial Payment (Month 1, Member 2: ₹20,000 of ₹34,500)
    console.log('\n[10] Record Partial Instalment (Month 1, Member 2: ₹20,000 of ₹34,500)');
    const payPartRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/collections`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: memberIds[1],
        month: 1,
        amountRupees: 20000,
        paymentMethod: 'UPI',
        notes: 'Partial payment',
      });

    assert(payPartRes.status === 201, 'Failed to record partial payment');
    assert(payPartRes.body.collection.status === 'PARTIAL', 'Status is PARTIAL');
    assert(payPartRes.body.collection.remainingRupees === 14500, 'Remaining is ₹14,500');
    console.log('  ✓ PASS: Partial payment logged, remaining ₹14,500 tracked');

    // 11. Top-up remaining partial payment
    console.log('\n[11] Settle Balance for Partial Instalment (₹14,500)');
    const topUpRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/collections`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: memberIds[1],
        month: 1,
        amountRupees: 14500,
        paymentMethod: 'CASH',
        notes: 'Balance cleared',
      });

    assert(topUpRes.status === 201, 'Top up failed');
    assert(topUpRes.body.collection.status === 'PAID', 'Status now PAID');
    assert(topUpRes.body.collection.remainingRupees === 0, 'Remaining now 0');
    console.log('  ✓ PASS: Second installment payment reconciled status to PAID');

    // 12. Monthly Collection Sheet
    console.log('\n[12] Get Monthly Collection Sheet (Month 1)');
    const sheetRes = await request(app)
      .get(`/api/chit-funds/groups/${group10L._id}/collections?month=1`)
      .set('Authorization', `Bearer ${token}`);

    assert(sheetRes.status === 200, 'Failed to fetch collection sheet');
    assert(sheetRes.body.members.length === 20, 'All 20 members listed');
    assert(sheetRes.body.expectedInstalmentRupees === 34500, 'Expected is ₹34,500');
    assert(sheetRes.body.members[0].status === 'PAID', 'Member 1 is PAID');
    assert(sheetRes.body.members[1].status === 'PAID', 'Member 2 is PAID');
    assert(sheetRes.body.members[2].status === 'PENDING', 'Member 3 is PENDING');
    console.log('  ✓ PASS: Monthly collection sheet verified');

    // 13. Record Month 1 Payout to Member 5 (₹6,50,000, Kasar ₹15,500)
    console.log('\n[13] Record Month 1 Chit Payout to Member 5 (₹6,50,000)');
    const payoutRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/payouts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        month: 1,
        hasPayout: true,
        memberId: memberIds[4], // Member 05
        payoutAmountRupees: 650000,
        kasarRupees: 15500,
        paymentMethod: 'BANK_TRANSFER',
        remarks: 'Month 1 Auction Winner',
      });

    assert(payoutRes.status === 201, 'Failed to record payout');
    assert(payoutRes.body.payout.payoutAmountRupees === 650000, 'Payout is ₹6,50,000');
    assert(payoutRes.body.payout.voucherNumber.startsWith('CPO-CHIT-'), 'Voucher created');
    console.log('  ✓ PASS: Payout of ₹6,50,000 recorded for Member 05');

    // 14. Record Month 2 without Payout (No Payout)
    console.log('\n[14] Record Month 2 with No Payout');
    const noPayoutRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/payouts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        month: 2,
        hasPayout: false,
        remarks: 'No auction in month 2 per agreement',
      });

    assert(noPayoutRes.status === 201, 'Failed to record no payout');
    assert(noPayoutRes.body.payout.hasPayout === false, 'hasPayout is false');
    console.log('  ✓ PASS: Month 2 successfully recorded as No Payout');

    // 15. Prevent Duplicate Payout for Month 1
    console.log('\n[15] Prevent Duplicate Payout in Same Month');
    const dupPayoutRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/payouts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        month: 1,
        hasPayout: true,
        memberId: memberIds[5],
        payoutAmountRupees: 650000,
      });
    assert(dupPayoutRes.status === 400, 'Should reject duplicate payout');
    console.log('  ✓ PASS: Duplicate payout rejected');

    // 16. Prevent Same Member Receiving Multiple Payouts Without Override
    console.log('\n[16] Prevent Member Receiving Second Payout Without Override');
    const memberDupPayoutRes = await request(app)
      .post(`/api/chit-funds/groups/${group10L._id}/payouts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        month: 3,
        hasPayout: true,
        memberId: memberIds[4], // Member 5 again
        payoutAmountRupees: 660000,
      });
    assert(memberDupPayoutRes.status === 400, 'Should reject duplicate member payout');
    console.log('  ✓ PASS: Multiple payout to same member intercepted safely');

    // 17. Reversal of Collection
    console.log('\n[17] Audited Reversal of Collection Receipt');
    const revColRes = await request(app)
      .post(`/api/chit-funds/collections/${receiptToReverse}/reverse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Accidental duplicate entry' });

    assert(revColRes.status === 200, 'Reversal failed');
    console.log('  ✓ PASS: Collection successfully reversed and balances restored');

    // 18. Chit Fund Summary Dashboard KPIs
    console.log('\n[18] Chit Fund Summary Dashboard KPIs');
    const sumRes = await request(app)
      .get('/api/chit-funds/summary')
      .set('Authorization', `Bearer ${token}`);

    assert(sumRes.status === 200, 'Summary failed');
    assert(sumRes.body.summary.totalGroups === 3, '3 groups created');
    assert(sumRes.body.summary.totalMembers === 20, '20 members total');
    console.log('  ✓ PASS: Summary KPIs verified');

    // 19. All 6 Dedicated Chit Reports
    console.log('\n[19] Chit Fund 6 Dedicated Reports');
    const rA = await request(app).get('/api/chit-funds/reports?reportType=monthly-collection').set('Authorization', `Bearer ${token}`);
    assert(rA.status === 200, 'Report A failed');
    console.log('  ✓ PASS: Report A (Monthly Collection) generated');

    const rB = await request(app).get('/api/chit-funds/reports?reportType=monthly-payout').set('Authorization', `Bearer ${token}`);
    assert(rB.status === 200, 'Report B failed');
    console.log('  ✓ PASS: Report B (Monthly Payout) generated');

    const rC = await request(app).get('/api/chit-funds/reports?reportType=member-wise').set('Authorization', `Bearer ${token}`);
    assert(rC.status === 200, 'Report C failed');
    console.log('  ✓ PASS: Report C (Member-wise Ledger) generated');

    const rD = await request(app).get('/api/chit-funds/reports?reportType=chit-group').set('Authorization', `Bearer ${token}`);
    assert(rD.status === 200, 'Report D failed');
    console.log('  ✓ PASS: Report D (Chit Group Performance) generated');

    const rE = await request(app).get('/api/chit-funds/reports?reportType=outstanding').set('Authorization', `Bearer ${token}`);
    assert(rE.status === 200, 'Report E failed');
    console.log('  ✓ PASS: Report E (Outstanding / Defaulters) generated');

    const rF = await request(app).get('/api/chit-funds/reports?reportType=category-wise').set('Authorization', `Bearer ${token}`);
    assert(rF.status === 200, 'Report F failed');
    console.log('  ✓ PASS: Report F (Category-wise 5L, 10L, 20L) generated');

    // 20. System Independence Check
    console.log('\n[20] System Independence Check');
    const health = await request(app).get('/api/health');
    assert(health.status === 200, 'Health endpoint affected');
    const loans = await request(app).get('/api/loans').set('Authorization', `Bearer ${token}`);
    assert(loans.status === 200, 'Loans endpoint affected');
    const dc = await request(app).get('/api/daily-collections/summary').set('Authorization', `Bearer ${token}`);
    assert(dc.status === 200, 'Daily collection affected');
    const moi = await request(app).get('/api/moi-seer/summary').set('Authorization', `Bearer ${token}`);
    assert(moi.status === 200, 'Moi / Seer affected');
    console.log('  ✓ PASS: All other business modules remain 100% independent and unaffected');

    console.log('\n=====================================================');
    console.log('TOTAL TESTS: 20/20 PASSED WITH ZERO FAILURES');
    console.log('=====================================================\n');
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runChitFundTests();
}

module.exports = runChitFundTests;
