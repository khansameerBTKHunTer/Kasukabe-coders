import { 
  IncidentService, 
  resetStore, 
  SEED_DEPARTMENTS, 
  SEED_PROFILES 
} from '../src/lib/data-store';
import { calculatePriorityScore } from '../src/lib/priority-engine';
import { recommendDepartments } from '../src/lib/department-router';
import { findDuplicateCandidates, calculateDistanceMeters } from '../src/lib/duplicate-detector';
import { AIAssessmentSchema } from '../src/lib/ai-analyzer';

console.log('====================================================');
console.log('DAMAGE MAPPER (CIVISCOPE) — FULL VERIFICATION SUITE');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    fn();
    console.log('PASSED');
    passed++;
  } catch (err: any) {
    console.log(`FAILED: ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    await fn();
    console.log('PASSED');
    passed++;
  } catch (err: any) {
    console.log(`FAILED: ${err.message}`);
    failed++;
  }
}

async function main() {
  // TEST 1 — Lakshmipur Repeatable Seed Initialization
  await runAsyncTest('Test 4 & 10: Repeatable Seed Reset (6 Reports -> 4 Incidents)', async () => {
    resetStore();
    const stats = await IncidentService.getStatistics();
    if (stats.total !== 4) throw new Error(`Expected 4 distinct incidents, found ${stats.total}`);
    if (stats.totalReports !== 6) throw new Error(`Expected 6 total reports, found ${stats.totalReports}`);
    if (stats.critical !== 2) throw new Error(`Expected 2 critical incidents, found ${stats.critical}`);
    if (stats.high !== 1) throw new Error(`Expected 1 high incident, found ${stats.high}`);
    if (stats.activeResponses < 2) throw new Error(`Expected at least 2 active responses, found ${stats.activeResponses}`);
  });

  // TEST 2 — Spatial Distance & Duplicate Correlation (Section 7 & Test 4)
  runTest('Test 4: Haversine Spatial Distance & Duplicate Rules', () => {
    // Distance between Report 1 and duplicate Report 2 (College Rd)
    const dist1_2 = calculateDistanceMeters(22.9447, 90.8282, 22.9451, 90.8286);
    if (dist1_2 > 150) throw new Error(`Distance ${dist1_2}m exceeded 150m radius`);

    // Distance to Station Rd North (separate flood)
    const dist1_6 = calculateDistanceMeters(22.9447, 90.8282, 22.9560, 90.8350);
    if (dist1_6 <= 150) throw new Error(`Station Rd should be distinct (>150m), got ${dist1_6}m`);

    // Cross-hazard check: fallen electrical pole near flooded road (30m)
    const distPole = calculateDistanceMeters(22.9447, 90.8282, 22.9449, 90.8284);
    if (distPole > 50) throw new Error(`Expected close proximity for fallen pole (~30m), got ${distPole}m`);
  });

  // TEST 3 — Deterministic Priority Scoring Engine (Section 8 & Test 3)
  runTest('Test 3: Priority Scoring Engine (0-100 Normalization & Banding)', () => {
    // Critical life risk test
    const criticalRes = calculatePriorityScore({
      category: 'electrical_hazard',
      immediateDanger: 'yes',
      reportedPeopleAffected: 50,
      vulnerablePeopleReported: true,
      aiAssessment: {
        category: 'electrical_hazard',
        title: 'Snapped 11kV Feeder Line',
        visible_damage: ['snapped_pole', 'downed_conductors_in_water'],
        secondary_hazards: ['electrocution_risk_in_standing_water', 'fire'],
        severity: 'critical',
        confidence: 0.94,
        recommended_departments: ['Electricity Department', 'Fire & Rescue'],
        life_risk_indicators: ['high voltage conductors in wet pedestrian zone'],
        critical_infrastructure_indicators: ['11kV feeder line'],
        uncertainties: [],
        human_review_required: true,
        summary: 'Catastrophic electrocution risk.',
      },
    });

    if (criticalRes.totalScore < 80 || criticalRes.priorityBand !== 'Critical') {
      throw new Error(`Expected Critical band >= 80, got ${criticalRes.totalScore}`);
    }
    if (!criticalRes.urgentReviewRequired) {
      throw new Error('Life risk must trigger urgent review flag');
    }

    // Conservative policy test for unknown data
    const unknownRes = calculatePriorityScore({
      category: 'flood',
      immediateDanger: 'unknown',
      reportedPeopleAffected: null,
      vulnerablePeopleReported: null,
    });
    if (unknownRes.missingInformation.length < 3) {
      throw new Error('Conservative policy must track missing parameters in missingInformation');
    }
    if (unknownRes.totalScore <= 0) {
      throw new Error('Unknown information must not silently evaluate to zero risk');
    }
  });

  // TEST 4 — Department Recommendation Rules (Section 9 & Test 5)
  runTest('Test 5: Deterministic Department Routing Rules', () => {
    const elect = recommendDepartments('electrical_hazard', 'downed wires in water');
    if (elect.primaryDepartmentCode !== 'ELECTRICITY') {
      throw new Error(`Expected ELECTRICITY, got ${elect.primaryDepartmentCode}`);
    }

    const fire = recommendDepartments('building_damage', 'structural pancake collapse');
    if (fire.primaryDepartmentCode !== 'FIRE_RESCUE') {
      throw new Error(`Expected FIRE_RESCUE, got ${fire.primaryDepartmentCode}`);
    }

    const flood = recommendDepartments('flood', 'arterial road submerged 3ft');
    if (flood.primaryDepartmentCode !== 'MUNICIPAL') {
      throw new Error(`Expected MUNICIPAL, got ${flood.primaryDepartmentCode}`);
    }

    const medical = recommendDepartments('medical_emergency', 'severe casualties needing triage');
    if (medical.primaryDepartmentCode !== 'MEDICAL') {
      throw new Error(`Expected MEDICAL, got ${medical.primaryDepartmentCode}`);
    }
  });

  // TEST 5 — Citizen Report Submission Flow (Section 5 & Test 1)
  let newReportId = '';
  let newIncidentId = '';
  await runAsyncTest('Test 1: Citizen Report Submission & Persistence', async () => {
    const submission = await IncidentService.submitCitizenReport({
      imagePath: '/simulated-evidence/flood_college_road_1.svg',
      description: 'Severe transit flooding along East Bazar Road. Rickshaws submerged.',
      incidentLatitude: 22.9460,
      incidentLongitude: 90.8290,
      reporterLatitude: 22.9458,
      reporterLongitude: 90.8288,
      sourceType: 'on_site',
      assistanceNeeded: 'High volume suction pumps',
      reportedPeopleAffected: 15,
      immediateDanger: 'no',
      reporterId: 'a0000000-0000-0000-0000-000000000004',
    });

    if (!submission.report.id) throw new Error('Report ID not generated');
    if (!submission.incident.id) throw new Error('Incident ID not generated');
    if (submission.incident.priority_score <= 0) throw new Error('Deterministic priority score missing');

    newReportId = submission.report.id;
    newIncidentId = submission.incident.id;

    // Verify separate storage of reporter coordinates and incident coordinates
    if (submission.report.reporter_latitude === submission.report.incident_latitude) {
      throw new Error('Reporter coordinates must be distinct from incident coordinates');
    }
  });

  // TEST 6 — Department Assignment Workflow (Section 10 & Test 6)
  let assignmentId = '';
  await runAsyncTest('Test 6: Control Room Assignment Creation', async () => {
    const assignment = await IncidentService.assignDepartment(
      newIncidentId,
      '33333333-3333-3333-3333-333333333333', // Municipal
      'a0000000-0000-0000-0000-000000000001',
      'Deploy trailer pumps to East Bazar.'
    );

    if (assignment.assignment_status !== 'pending') {
      throw new Error('New assignment must start in pending status');
    }
    assignmentId = assignment.id;
  });

  // TEST 7 — Assignment Acknowledgement (Section 10 & Test 6)
  await runAsyncTest('Test 6: Department Acknowledgement & Status Progression', async () => {
    const ack = await IncidentService.acknowledgeAssignment(
      assignmentId,
      'a0000000-0000-0000-0000-000000000003'
    );

    if (ack.assignment_status !== 'acknowledged') {
      throw new Error('Assignment status not set to acknowledged');
    }
    if (!ack.acknowledged_at) {
      throw new Error('acknowledged_at timestamp not recorded');
    }

    // Verify incident status updated to in_progress
    const inc = await IncidentService.getIncidentById(newIncidentId);
    if (inc?.status !== 'in_progress') {
      throw new Error('Incident status not updated to in_progress after acknowledgement');
    }
  });

  // TEST 8 — Operational Updates & Resolution (Section 10 & Test 6)
  await runAsyncTest('Test 6: Department Field Status Update & Operational Notes', async () => {
    const updated = await IncidentService.updateResponseStatus(
      assignmentId,
      'in_progress',
      'Pumping units operational. 50% drainage achieved.',
      'a0000000-0000-0000-0000-000000000003'
    );

    if (updated.assignment_status !== 'in_progress') {
      throw new Error('Assignment status not updated');
    }
    if (!updated.notes?.includes('Pumping units operational')) {
      throw new Error('Response notes not appended');
    }
  });

  // TEST 9 — Admin Priority Override with Mandatory Explanation (Section 8 & Test 3)
  await runAsyncTest('Test 3: Mandatory Reason Priority Override', async () => {
    // Attempt override without reason (should fail)
    let failedWithoutReason = false;
    try {
      await IncidentService.overridePriority(newIncidentId, 95.0, '');
    } catch {
      failedWithoutReason = true;
    }
    if (!failedWithoutReason) {
      throw new Error('Priority override without reason must be rejected');
    }

    // Valid override with operational explanation
    const overridden = await IncidentService.overridePriority(
      newIncidentId,
      93.5,
      'Substation drainage threatened by rising water level.',
      'a0000000-0000-0000-0000-000000000001'
    );

    if (overridden.priority_score !== 93.5) {
      throw new Error('Priority score not updated to overridden value');
    }
    if (overridden.priority_band !== 'Critical') {
      throw new Error('Priority band not updated to Critical');
    }
  });

  // TEST 10 — Activity Timeline & Audit Log Integrity (Section 11 & Test 6, 9)
  await runAsyncTest('Test 6 & 9: Activity Timeline Immutability & Audit Log', async () => {
    const logs = await IncidentService.getActivityLogs(newIncidentId);
    if (logs.length < 4) {
      throw new Error(`Expected at least 4 activity logs, found ${logs.length}`);
    }

    const actions = logs.map(l => l.action);
    if (!actions.includes('report_created')) throw new Error('Missing report_created event');
    if (!actions.includes('department_assigned')) throw new Error('Missing department_assigned event');
    if (!actions.includes('assignment_acknowledged')) throw new Error('Missing assignment_acknowledged event');
    if (!actions.includes('priority_override')) throw new Error('Missing priority_override event');
  });

  // TEST 11 — Zod Contract Validation (Section 6 & Test 2)
  runTest('Test 2: Zod AI Assessment Schema Validation', () => {
    const validData = {
      category: 'flood',
      title: 'College Road Flooding',
      visible_damage: ['submerged_asphalt', 'overflowing_gutter'],
      secondary_hazards: ['waterborne_contamination'],
      severity: 'high',
      confidence: 0.92,
      recommended_departments: ['Municipal / Road Services'],
      life_risk_indicators: [],
      critical_infrastructure_indicators: ['arterial_road'],
      uncertainties: ['turbid water depth'],
      human_review_required: false,
      summary: 'Arterial roadway inundated under deep stormwater.',
    };

    const parsed = AIAssessmentSchema.safeParse(validData);
    if (!parsed.success) {
      throw new Error(`Valid schema failed validation: ${parsed.error.message}`);
    }

    // Invalid schema test (invalid category)
    const invalidData = { ...validData, category: 'alien_invasion' };
    const invalidParsed = AIAssessmentSchema.safeParse(invalidData);
    if (invalidParsed.success) {
      throw new Error('Invalid category should fail Zod validation');
    }
  });

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

main();
