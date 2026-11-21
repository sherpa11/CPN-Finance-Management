/**
 * CPN RAJA – மொய் / சீர் (MOI / SEER) API Integration Test Suite
 */
process.env.NODE_ENV = 'test';
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const MoiSeerPerson = require('../src/models/MoiSeerPerson');
const MoiSeerContribution = require('../src/models/MoiSeerContribution');
const AuditLog = require('../src/models/AuditLog');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function run() {
  console.log('=====================================================');
  console.log('  CPN RAJA – மொய் / சீர் (MOI / SEER) TEST SUITE');
  console.log('=====================================================');

  await connectDB();

  // 1. Admin Authentication
  console.log('\n[1] Authentication');
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'cpnraja', password: 'cpnraja2026' });

  assert(loginRes.status === 200, 'Admin login returns 200');
  const token = loginRes.body.token;

  // Clean test collection first
  await MoiSeerContribution.deleteMany({});
  await MoiSeerPerson.deleteMany({});

  // 2. Person Registration
  console.log('\n[2] Person Registration');
  const p1Res = await request(app)
    .post('/api/moi-seer/persons')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'கந்தசாமி கவுண்டர் (Kandasamy Gounder)',
      district: 'Salem',
      village: 'Omalur',
      notes: 'Relative / Periyappa family',
    });

  assert(p1Res.status === 201, 'POST /api/moi-seer/persons returns 201');
  assert(p1Res.body.person.personId === 'MSP-0001', 'Sequential Person ID generated: MSP-0001');
  assert(p1Res.body.person.village === 'Omalur', 'Village preserved correctly');
  const person1 = p1Res.body.person;

  // Person 2
  const p2Res = await request(app)
    .post('/api/moi-seer/persons')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'செல்வம் பிள்ளை (Selvam Pillai)',
      district: 'Namakkal',
      village: 'Rasipuram',
      notes: 'Friend from textile market',
    });
  assert(p2Res.body.person.personId === 'MSP-0002', 'Sequential Person ID incremented: MSP-0002');
  const person2 = p2Res.body.person;

  // 3. Edit Person Details
  console.log('\n[3] Edit Person Details');
  const editPRes = await request(app)
    .put(`/api/moi-seer/persons/${person1._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      notes: 'Relative / Periyappa family (Salem North)',
    });
  assert(editPRes.status === 200, 'PUT /api/moi-seer/persons/:id returns 200');
  assert(editPRes.body.person.notes.includes('Salem North'), 'Updated notes preserved');

  // 4. Record Single Money Contribution
  console.log('\n[4] Record Money Contribution');
  const c1Res = await request(app)
    .post('/api/moi-seer/contributions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      personId: person1._id,
      contributionDate: '2026-11-20',
      contributionType: 'MONEY',
      amount: 5000,
      description: 'Marriage reception gift',
    });

  assert(c1Res.status === 201, 'POST /api/moi-seer/contributions returns 201 for Money');
  assert(c1Res.body.contributions[0].contributionId === 'MSC-0001', 'Generated MSC-0001');
  assert(c1Res.body.contributions[0].amountPaise === 500000, 'Integer paise accurate (500000)');
  assert(c1Res.body.contributions[0].amountRupees === 5000, 'Amount rupees accurate (5000)');
  const contrib1 = c1Res.body.contributions[0];

  // 5. Record Single Material Contribution
  console.log('\n[5] Record Material Contribution');
  const c2Res = await request(app)
    .post('/api/moi-seer/contributions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      personId: person1._id,
      contributionDate: '2026-11-20',
      contributionType: 'MATERIAL',
      materialName: 'Silver Plate',
      quantity: '2 Plates',
      description: 'Engraved with family initials',
    });

  assert(c2Res.status === 201, 'POST /api/moi-seer/contributions returns 201 for Material');
  assert(c2Res.body.contributions[0].contributionId === 'MSC-0002', 'Generated MSC-0002');
  assert(c2Res.body.contributions[0].materialName === 'Silver Plate', 'Material name preserved');
  assert(c2Res.body.contributions[0].amountPaise === 0, 'No artificial money value assigned to material');

  // 6. Record Multiple Contributions on Same Date (Money + Multiple Materials)
  console.log('\n[6] Record Multi-Item Batch (Money + Materials)');
  const batchRes = await request(app)
    .post('/api/moi-seer/contributions')
    .set('Authorization', `Bearer ${token}`)
    .send({
      personId: person2._id,
      contributionDate: '2026-11-20',
      items: [
        { contributionType: 'MONEY', amount: 2000, description: 'Seer money' },
        { contributionType: 'MATERIAL', materialName: 'Cooker', quantity: '1 (5 Litres)', description: 'Prestige pressure cooker' },
        { contributionType: 'MATERIAL', materialName: 'Silk Saree', quantity: '1 Saree', description: 'Kanchipuram Pattu' },
      ],
    });

  assert(batchRes.status === 201, 'Batch items submission returns 201');
  assert(batchRes.body.contributions.length === 3, 'Recorded 3 separate contribution records');

  // 7. Summary Metrics
  console.log('\n[7] Summary Metrics');
  const sumRes = await request(app)
    .get('/api/moi-seer/summary')
    .set('Authorization', `Bearer ${token}`);

  assert(sumRes.status === 200, 'GET /api/moi-seer/summary returns 200');
  assert(sumRes.body.summary.totalContributors === 2, 'Total Contributors = 2');
  assert(sumRes.body.summary.totalMoneyRupees === 7000, 'Total Money = ₹7,000 (5000 + 2000)');
  assert(sumRes.body.summary.totalMaterialEntries === 3, 'Total Material entries = 3 (1 Silver Plate + 1 Cooker + 1 Saree)');
  assert(sumRes.body.summary.totalContributionRecords === 5, 'Total contribution records = 5');

  // 8. Search & Filters
  console.log('\n[8] Search and Filters');
  const searchNameRes = await request(app)
    .get('/api/moi-seer/contributions?search=Kandasamy')
    .set('Authorization', `Bearer ${token}`);
  assert(searchNameRes.body.contributions.length === 2, 'Search by person name returns 2 records');

  const searchMatRes = await request(app)
    .get('/api/moi-seer/contributions?search=Cooker')
    .set('Authorization', `Bearer ${token}`);
  assert(searchMatRes.body.contributions.length === 1, 'Search by material name returns Cooker');

  const filterDistRes = await request(app)
    .get('/api/moi-seer/contributions?district=Namakkal')
    .set('Authorization', `Bearer ${token}`);
  assert(filterDistRes.body.contributions.length === 3, 'Filter by district Namakkal returns 3 records');

  const filterTypeRes = await request(app)
    .get('/api/moi-seer/contributions?type=MONEY')
    .set('Authorization', `Bearer ${token}`);
  assert(filterTypeRes.body.contributions.length === 2, 'Filter by MONEY returns 2 records');

  // 9. Update Contribution
  console.log('\n[9] Update Contribution');
  const updateRes = await request(app)
    .put(`/api/moi-seer/contributions/${contrib1._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      amount: 6000,
      description: 'Updated marriage gift to ₹6,000',
    });
  assert(updateRes.status === 200, 'PUT /api/moi-seer/contributions/:id returns 200');
  assert(updateRes.body.contribution.amountRupees === 6000, 'Amount updated to 6000');

  // Check Audit Log
  const auditRes = await AuditLog.findOne({
    action: 'MOI_SEER_CONTRIBUTION_UPDATED',
    entityId: contrib1.contributionId,
  });
  assert(!!auditRes, 'AuditLog entry created for contribution edit');

  // 10. Reports Testing
  console.log('\n[10] Reports Generation');
  // Report A: Daily
  const repDaily = await request(app)
    .get('/api/moi-seer/reports?reportType=daily&date=2026-11-20')
    .set('Authorization', `Bearer ${token}`);
  assert(repDaily.status === 200, 'Daily report generated');
  assert(repDaily.body.summary.moneyReceivedRupees === 8000, 'Daily money = ₹8,000 (6000 + 2000)');

  // Report B: Date-wise
  const repDateWise = await request(app)
    .get('/api/moi-seer/reports?reportType=date-wise&startDate=2026-11-01&endDate=2026-11-30')
    .set('Authorization', `Bearer ${token}`);
  assert(repDateWise.status === 200, 'Date-wise report generated');
  assert(repDateWise.body.summary.materialWiseSummary.length >= 3, 'Material breakdown list present');

  // Report C: District-wise
  const repDist = await request(app)
    .get('/api/moi-seer/reports?reportType=district-wise')
    .set('Authorization', `Bearer ${token}`);
  assert(repDist.status === 200, 'District-wise report generated');
  assert(repDist.body.districts.length === 2, 'Grouped by 2 districts (Salem, Namakkal)');

  // Report D: Village-wise
  const repVill = await request(app)
    .get('/api/moi-seer/reports?reportType=village-wise')
    .set('Authorization', `Bearer ${token}`);
  assert(repVill.status === 200, 'Village-wise report generated');
  assert(repVill.body.villages.length === 2, 'Grouped by 2 villages (Omalur, Rasipuram)');

  // Report E: Material-wise
  const repMat = await request(app)
    .get('/api/moi-seer/reports?reportType=material-wise')
    .set('Authorization', `Bearer ${token}`);
  assert(repMat.status === 200, 'Material-wise report generated');
  assert(repMat.body.materials.length === 3, '3 distinct materials listed');

  // Report F: Person-wise
  const repPerson = await request(app)
    .get('/api/moi-seer/reports?reportType=person-wise')
    .set('Authorization', `Bearer ${token}`);
  assert(repPerson.status === 200, 'Person-wise report generated');
  assert(repPerson.body.persons.length === 2, 'Both contributors profiled');

  // 11. Delete Contribution
  console.log('\n[11] Delete Contribution & Audit');
  const toDelete = batchRes.body.contributions[2]; // Saree
  const delRes = await request(app)
    .delete(`/api/moi-seer/contributions/${toDelete._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Accidental duplicate entry test' });

  assert(delRes.status === 200, 'DELETE /api/moi-seer/contributions/:id returns 200');
  const postDelCheck = await MoiSeerContribution.findById(toDelete._id);
  assert(!postDelCheck, 'Contribution successfully removed');

  const delAudit = await AuditLog.findOne({
    action: 'MOI_SEER_CONTRIBUTION_DELETED',
    entityId: toDelete.contributionId,
  });
  assert(!!delAudit, 'AuditLog entry created for deletion');

  // 12. System Independence Verification
  console.log('\n[12] System Independence Check');
  const healthRes = await request(app).get('/api/health');
  assert(healthRes.status === 200, 'Health endpoint unaffected');

  const loansRes = await request(app)
    .get('/api/loans')
    .set('Authorization', `Bearer ${token}`);
  assert(loansRes.status === 200, 'Finance loans module completely unaffected');

  const custsRes = await request(app)
    .get('/api/customers')
    .set('Authorization', `Bearer ${token}`);
  assert(custsRes.status === 200, 'Finance customers module completely unaffected');

  console.log('=====================================================');
  console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('=====================================================');

  // Cleanup test data
  await MoiSeerContribution.deleteMany({});
  await MoiSeerPerson.deleteMany({});
  await AuditLog.deleteMany({ entityType: { $in: ['MOI_SEER_PERSON', 'MOI_SEER_CONTRIBUTION'] } });

  process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
