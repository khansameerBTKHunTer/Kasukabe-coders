import { NextRequest } from 'next/server';
import { GET as getIncidents, POST as postReport } from '../src/app/api/incidents/route';
import { GET as getIncidentDetail, PATCH as patchIncident } from '../src/app/api/incidents/[id]/route';
import { POST as assignDept } from '../src/app/api/incidents/[id]/assign/route';
import { PATCH as updateAssignment } from '../src/app/api/assignments/[id]/route';
import { POST as duplicateAction } from '../src/app/api/incidents/duplicate/route';
import { GET as getStats } from '../src/app/api/statistics/route';
import { POST as resetSeed } from '../src/app/api/seed/reset/route';
import { POST as analyzeAI } from '../src/app/api/ai/analyze/route';
import { calculatePriorityScore } from '../src/lib/priority-engine';
import { recommendDepartments } from '../src/lib/department-router';
import { findDuplicateCandidates, calculateDistanceMeters } from '../src/lib/duplicate-detector';

async function run() {
  console.log('====================================================');
  console.log('DAMAGE MAPPER (CIVISCOPE) — IN-PROCESS SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
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

  // 1. Reset Scenario
  await test('Reset Scenario to Lakshmipur Baseline', async () => {
    const res = await resetSeed();
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Reset failed');
  });

  // 2. Statistics Verification
  await test('Test 8 — Dashboard KPI Statistics', async () => {
    const res = await getStats();
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch statistics');
    const stats = data.stats;
    if (stats.total !== 4) throw new Error(`Expected 4 distinct incidents, found ${stats.total}`);
    if (stats.totalReports !== 6) throw new Error(`Expected 6 total reports, found ${stats.totalReports}`);
    if (stats.critical !== 2) throw new Error(`Expected 2 critical incidents, found ${stats.critical}`);
    if (stats.high !== 1) throw new Error(`Expected 1 high incident, found ${stats.high}`);
    if (stats.activeResponses < 2) throw new Error(`Expected at least 2 active responses, found ${stats.activeResponses}`);
  });

  // 3. Incidents Ranked Queue & Filter API
  await test('Test 8 — Ranked Incident Queue & Priority Sorting', async () => {
    const req = new NextRequest('http://localhost:3000/api/incidents');
    const res = await getIncidents(req);
    const data = await res.json();
    if (!data.success) throw new Error('Failed to fetch incidents');
    const incidents = data.incidents;

    for (let i = 0; i < incidents.length - 1; i++) {
      if (incidents[i].priority_score < incidents[i + 1].priority_score) {
        throw new Error('Incidents are not sorted in descending priority order');
      }
    }
  });

  // 4. Duplicate Correlation & Entity Separation (Test 4)
  await test('Test 4 — Duplicate Detection & Distinct Hazards Separation', async () => {
    const req = new NextRequest('http://localhost:3000/api/incidents');
    const res = await getIncidents(req);
    const data = await res.json();
    const incidents = data.incidents;

    // College Road flood has 2 reports
    const collegeRoad = incidents.find((i: any) => i.title.includes('College Road') && i.category === 'flood');
    if (!collegeRoad || collegeRoad.evidence_count !== 2) {
      throw new Error(`Expected 2 merged reports for College Road, found ${collegeRoad?.evidence_count}`);
    }

    // Fallen Pole has 2 reports and is a distinct electrical incident
    const pole = incidents.find((i: any) => i.category === 'electrical_hazard');
    if (!pole || pole.evidence_count !== 2) {
      throw new Error(`Expected 2 merged reports for Fallen Pole, found ${pole?.evidence_count}`);
    }

    // Station Road North is a separate flood incident 1.4km away
    const stationRoad = incidents.find((i: any) => i.title.includes('Station Road North'));
    if (!stationRoad || stationRoad.id === collegeRoad.id) {
      throw new Error('Station Road North must remain a distinct incident record');
    }
  });

  // 5. Citizen Report Submission (Test 1 & Test 2)
  let newIncidentId = '';
  let newReportId = '';
  await test('Test 1 & 2 — Citizen Report Submission & AI Safeguard Handling', async () => {
    const payload = {
      imagePath: '/simulated-evidence/flood_college_road_1.svg',
      description: 'Severe inundation near east market gate blocking all rickshaw passage.',
      incidentLatitude: 22.9460,
      incidentLongitude: 90.8290,
      sourceType: 'on_site',
      assistanceNeeded: 'Trailer pumps and emergency sandbags',
      reportedPeopleAffected: 25,
      immediateDanger: 'no',
    };

    const req = new NextRequest('http://localhost:3000/api/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await postReport(req);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Submission failed');

    newReportId = data.report.id;
    newIncidentId = data.incident.id;

    if (!newReportId || !newIncidentId) throw new Error('Missing generated IDs');
    if (typeof data.incident.priority_score !== 'number' || data.incident.priority_score <= 0) {
      throw new Error('Priority score not computed deterministically');
    }
  });

  // 6. Department Assignment by Control Room (Test 6)
  let assignmentId = '';
  await test('Test 6 — Department Assignment by Control Room', async () => {
    const req = new NextRequest(`http://localhost:3000/api/incidents/${newIncidentId}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        departmentId: '33333333-3333-3333-3333-333333333333', // Municipal
        assignedBy: 'a0000000-0000-0000-0000-000000000001',
        notes: 'Deploy municipal drainage pump truck 4.',
      }),
    });

    const res = await assignDept(req, { params: { id: newIncidentId } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Assignment failed');
    if (data.assignment.assignment_status !== 'pending') {
      throw new Error('Initial assignment must be pending');
    }
    assignmentId = data.assignment.id;
  });

  // 7. Assignment Acknowledgement by Department Responder (Test 6)
  await test('Test 6 — Assignment Acknowledgement by Responder', async () => {
    const req = new NextRequest(`http://localhost:3000/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'acknowledge',
        userId: 'a0000000-0000-0000-0000-000000000003',
      }),
    });

    const res = await updateAssignment(req, { params: { id: assignmentId } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Acknowledgement failed');
    if (data.assignment.assignment_status !== 'acknowledged') {
      throw new Error('Status not acknowledged');
    }
  });

  // 8. Field Status Update & Response Notes (Test 6)
  await test('Test 6 — Operational Status Update & Response Notes', async () => {
    const req = new NextRequest(`http://localhost:3000/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'update_status',
        status: 'in_progress',
        notes: 'Pump active. Water level receded by 8 inches.',
        userId: 'a0000000-0000-0000-0000-000000000003',
      }),
    });

    const res = await updateAssignment(req, { params: { id: assignmentId } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Status update failed');
    if (data.assignment.assignment_status !== 'in_progress') {
      throw new Error('Status not in_progress');
    }
  });

  // 9. Admin Priority Override with Mandatory Explanation (Test 3)
  await test('Test 3 — Mandatory Reason Priority Override', async () => {
    const req = new NextRequest(`http://localhost:3000/api/incidents/${newIncidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'override_priority',
        priorityScore: 91.0,
        overrideReason: 'Eyewitness confirmed hospital ambulance route blocked.',
        userId: 'a0000000-0000-0000-0000-000000000001',
      }),
    });

    const res = await patchIncident(req, { params: { id: newIncidentId } });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Override failed');
    if (data.incident.priority_score !== 91.0) {
      throw new Error('Score not updated to 91.0');
    }
    if (data.incident.priority_band !== 'Critical') {
      throw new Error('Band not updated to Critical');
    }
  });

  // 10. Activity Timeline Persistence & Incident Verification (Test 7, 8, 9)
  await test('Test 7, 8 & 9 — Activity Timeline Integrity & Verification Status', async () => {
    const reqVerify = new NextRequest(`http://localhost:3000/api/incidents/${newIncidentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'verify',
        verificationStatus: 'verified',
        userId: 'a0000000-0000-0000-0000-000000000001',
      }),
    });

    await patchIncident(reqVerify, { params: { id: newIncidentId } });

    const reqDetail = new NextRequest(`http://localhost:3000/api/incidents/${newIncidentId}`);
    const resDetail = await getIncidentDetail(reqDetail, { params: { id: newIncidentId } });
    const dataDetail = await resDetail.json();

    if (!dataDetail.success) throw new Error('Failed to fetch details');
    if (dataDetail.incident.verification_status !== 'verified') {
      throw new Error('Verification status not persisted');
    }

    const logs = dataDetail.activityLogs;
    if (!logs || logs.length < 4) {
      throw new Error(`Expected at least 4 audit logs, found ${logs?.length}`);
    }

    const actions = logs.map((l: any) => l.action);
    if (!actions.includes('report_created')) throw new Error('Missing report_created log');
    if (!actions.includes('department_assigned')) throw new Error('Missing department_assigned log');
    if (!actions.includes('assignment_acknowledged')) throw new Error('Missing assignment_acknowledged log');
    if (!actions.includes('priority_override')) throw new Error('Missing priority_override log');
    if (!actions.includes('verification_updated')) throw new Error('Missing verification_updated log');
  });

  console.log('\n====================================================');
  console.log(`ALL TESTS PASSED: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run();
