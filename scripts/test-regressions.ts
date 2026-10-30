import assert from 'node:assert/strict';
import { IncidentService, getStore, resetStore, SEED_DEPARTMENTS } from '../src/lib/data-store';
import { dynamic } from '../src/app/api/statistics/route';

async function run() {
  resetStore();
  try {
    assert.equal(dynamic, 'force-dynamic', 'KPIs must not be frozen during the build');
    const store = getStore();
    const existing = store.assignments[0];
    const count = store.assignments.length;
    const again = await IncidentService.assignDepartment(existing.incident_id, existing.department_id);
    assert.equal(again.id, existing.id);
    assert.equal(store.assignments.length, count, 'Repeated dispatch must not duplicate active assignments');
    const pending = await IncidentService.assignDepartment(store.incidents[3].id, SEED_DEPARTMENTS[0].id);
    await IncidentService.updateResponseStatus(pending.id, 'in_progress', 'Crew arrived');
    assert.equal((await IncidentService.getIncidentById(pending.incident_id))?.status, 'in_progress');
    await IncidentService.acknowledgeAssignment(pending.id);
    assert.equal(pending.assignment_status, 'in_progress', 'Late acknowledgement must not regress the response');

    const source = store.incidents[0];
    const target = store.incidents[1];
    const sourceReport = store.reports.find(r => r.incident_id === source.id)!;
    await IncidentService.confirmDuplicate(sourceReport.id, target.id);
    assert.ok(store.incidents.some(i => i.id === source.id), 'Merging one report must preserve other evidence and assignments');
    for (const report of store.reports) assert.ok(store.incidents.some(i => i.id === report.incident_id));
    for (const assignment of store.assignments) assert.ok(store.incidents.some(i => i.id === assignment.incident_id));

    await IncidentService.verifyIncident(target.id, 'rejected');
    assert.ok(store.reports.filter(r => r.incident_id === target.id).every(r => r.verification_status === 'rejected'));
    await IncidentService.verifyIncident(target.id, 'flagged');
    assert.ok(store.reports.filter(r => r.incident_id === target.id).every(r => r.verification_status === 'unverified'));
    console.log('Regression tests passed: live KPIs, dispatch idempotence, status progression, safe duplicate review, report verification.');
  } finally { resetStore(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
