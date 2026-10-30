// Verification of all 10 Workflows for Damage Mapper (CIVISCOPE)
const BASE_URL = 'http://localhost:3000';

async function runVerification() {
  console.log('====================================================');
  console.log('DAMAGE MAPPER (CIVISCOPE) — END-TO-END VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name}... `);
    try {
      await fn();
      console.log('PASSED');
      passed++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  // 1. Reset scenario
  await test('Scenario Reset to Lakshmipur Baseline', async () => {
    const res = await fetch(`${BASE_URL}/api/seed/reset`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Reset failed');
  });

  // 2. Statistics KPI Check
  await test('Test 8 — Dashboard KPI Statistics', async () => {
    const res = await fetch(`${BASE_URL}/api/statistics`);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch statistics');
    const stats = data.stats;
    if (stats.total !== 4) throw new Error(`Expected 4 distinct incidents, found ${stats.total}`);
    if (stats.totalReports !== 6) throw new Error(`Expected 6 total reports, found ${stats.totalReports}`);
    if (stats.critical !== 2) throw new Error(`Expected 2 critical incidents, found ${stats.critical}`);
    if (stats.high !== 1) throw new Error(`Expected 1 high incident, found ${stats.high}`);
    if (stats.activeResponses < 2) throw new Error(`Expected at least 2 active responses, found ${stats.activeResponses}`);
  });

  // 3. Incidents Ranked Queue & Filters
  await test('Test 8 — Ranked Incident Queue & Category Filtering', async () => {
    const res = await fetch(`${BASE_URL}/api/incidents`);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch incidents');
    const incidents = data.incidents;

    // Check sorted by priority score descending
    for (let i = 0; i < incidents.length - 1; i++) {
      if (incidents[i].priority_score < incidents[i + 1].priority_score) {
        throw new Error('Incidents are not sorted in descending priority order');
      }
    }

    // Filter by category: electrical_hazard
    const filterRes = await fetch(`${BASE_URL}/api/incidents?category=electrical_hazard`);
    const filterData = await filterRes.json();
    if (filterData.incidents.length !== 1) {
      throw new Error(`Expected 1 electrical incident, found ${filterData.incidents.length}`);
    }
  });

  // 4. Duplicate Detection Verification (Test 4)
  await test('Test 4 — Duplicate Detection & Entity Separation', async () => {
    const res = await fetch(`${BASE_URL}/api/incidents`);
    const data = await res.json();
    const incidents = data.incidents;

    // College Road Flooding should have evidence_count = 2 (two merged reports)
    const collegeRoad = incidents.find(i => i.title.includes('College Road') && i.category === 'flood');
    if (!collegeRoad) throw new Error('College Road flood incident not found');
    if (collegeRoad.evidence_count !== 2) {
      throw new Error(`Expected 2 evidence reports for College Road, got ${collegeRoad.evidence_count}`);
    }

    // Fallen Pole should remain a distinct electrical incident (not merged with flood!)
    const pole = incidents.find(i => i.category === 'electrical_hazard');
    if (!pole) throw new Error('Fallen Pole incident not found');
    if (pole.evidence_count !== 2) {
      throw new Error(`Expected 2 evidence reports for Fallen Pole, got ${pole.evidence_count}`);
    }

    // Station Road North should remain a distinct flood incident (1.4km away)
    const stationRoad = incidents.find(i => i.title.includes('Station Road North'));
    if (!stationRoad) throw new Error('Station Road North incident not found');
    if (stationRoad.id === collegeRoad.id) {
      throw new Error('Distinct street floodings must not be merged');
    }
  });

  // 5. Citizen Report Submission (Test 1 & Test 2)
  let newReportId = '';
  let newIncidentId = '';
  await test('Test 1 — Citizen Report Submission & Persistence', async () => {
    const payload = {
      imagePath: '/simulated-evidence/flood_college_road_1.svg',
      description: 'Emergency test report: High water inundating market gate.',
      incidentLatitude: 22.9460,
      incidentLongitude: 90.8290,
      sourceType: 'on_site',
      assistanceNeeded: 'Pumps and sandbags urgently needed',
      reportedPeopleAffected: 10,
      immediateDanger: 'no',
    };

    const res = await fetch(`${BASE_URL}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Report submission failed');
    if (!data.report?.id) throw new Error('Report ID not returned');
    if (!data.incident?.id) throw new Error('Incident ID not returned');

    newReportId = data.report.id;
    newIncidentId = data.incident.id;

    // Verify deterministic priority score
    if (typeof data.incident.priority_score !== 'number' || data.incident.priority_score <= 0) {
      throw new Error('Priority score not computed');
    }
  });

  // 6. Department Assignment & Response Tracking (Test 6)
  let assignmentId = '';
  await test('Test 6 — Department Assignment by Control Room', async () => {
    const deptId = '11111111-1111-1111-1111-111111111111'; // Fire & Rescue
    const res = await fetch(`${BASE_URL}/api/incidents/${newIncidentId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departmentId: deptId,
        assignedBy: 'a0000000-0000-0000-0000-000000000001',
        notes: 'Priority dispatch test for USAR unit.',
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Assignment failed');
    if (data.assignment.assignment_status !== 'pending') {
      throw new Error('Initial assignment must be pending acknowledgement');
    }
    assignmentId = data.assignment.id;
  });

  // 7. Assignment Acknowledgement by Department (Test 6)
  await test('Test 6 — Assignment Acknowledgement by Department Responder', async () => {
    const res = await fetch(`${BASE_URL}/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'acknowledge',
        userId: 'a0000000-0000-0000-0000-000000000002',
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Acknowledgement failed');
    if (data.assignment.assignment_status !== 'acknowledged') {
      throw new Error('Status not updated to acknowledged');
    }
    if (!data.assignment.acknowledged_at) {
      throw new Error('acknowledged_at timestamp not recorded');
    }
  });

  // 8. In-Field Status Update & Response Notes (Test 6)
  await test('Test 6 — Operational Status Update & Response Notes', async () => {
    const res = await fetch(`${BASE_URL}/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_status',
        status: 'in_progress',
        notes: 'Crew arrived on scene with water-rescue gear.',
        userId: 'a0000000-0000-0000-0000-000000000002',
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Status update failed');
    if (data.assignment.assignment_status !== 'in_progress') {
      throw new Error('Status not in_progress');
    }
  });

  // 9. Admin Priority Override (Test 3)
  await test('Test 3 — Mandatory Reason Priority Override', async () => {
    const res = await fetch(`${BASE_URL}/api/incidents/${newIncidentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'override_priority',
        priorityScore: 92.5,
        overrideReason: 'Eyewitness confirmed elderly care home on lower floor.',
        userId: 'a0000000-0000-0000-0000-000000000001',
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Priority override failed');
    if (data.incident.priority_score !== 92.5) {
      throw new Error('Priority score not updated to overridden value');
    }
    if (data.incident.priority_band !== 'Critical') {
      throw new Error('Priority band not updated to Critical for score 92.5');
    }
  });

  // 10. Activity Timeline Records Persistence (Test 6 & Test 9)
  await test('Test 6 & 9 — Activity Timeline Integrity & Event Logging', async () => {
    const res = await fetch(`${BASE_URL}/api/incidents/${newIncidentId}`);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch incident details');
    const logs = data.activityLogs;

    if (!logs || logs.length < 3) {
      throw new Error(`Expected at least 3 activity log records, found ${logs?.length}`);
    }

    const actions = logs.map(l => l.action);
    if (!actions.includes('report_created')) throw new Error('Missing report_created log');
    if (!actions.includes('department_assigned')) throw new Error('Missing department_assigned log');
    if (!actions.includes('assignment_acknowledged')) throw new Error('Missing assignment_acknowledged log');
    if (!actions.includes('priority_override')) throw new Error('Missing priority_override log');
  });

  console.log('\n====================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
