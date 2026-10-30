import { jsPDF } from 'jspdf';
import type { ActivityLog, Incident } from '../types';

export interface SitRepSnapshot {
  generatedAt: string;
  incidents: Incident[];
  activityLogs: ActivityLog[];
  stats: {
    total: number;
    critical: number;
    high: number;
    awaitingAssignment: number;
    activeResponses: number;
    totalReports: number;
  };
}

// All dates are explicitly UTC so reports can be shared between response teams.
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export function generateSitRep(snapshot: SitRepSnapshot): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'CIVISCOPE Disaster Situation Report', author: 'CIVISCOPE Control Room' });
  const width = 174;
  let y = 30;
  const pageHeader = () => {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(25, 55, 80);
    doc.text('CIVISCOPE | CONTROL ROOM', 18, 16);
    doc.setDrawColor(180, 195, 205).line(18, 21, 192, 21);
    y = 30;
  };
  pageHeader();

  // Wrap and paginate line by line, including notes longer than an entire page.
  const text = (value: string, bold = false, size = 10) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(30, 40, 50);
    // Built-in PDF fonts use WinAnsi; mark unsupported characters visibly.
    const printable = value.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');
    const lines: string[] = doc.splitTextToSize(printable, width);
    for (const line of lines) {
      if (y > 272) {
        doc.addPage();
        pageHeader();
        doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(30, 40, 50);
      }
      doc.text(line, 18, y);
      y += size * 0.45 + 1;
    }
    y += 2;
  };
  const section = (title: string) => {
    if (y > 250) { doc.addPage(); pageHeader(); }
    y += 3;
    text(title, true, 13);
  };

  text('DISASTER SITUATION REPORT', true, 18);
  text(`Report reference: SITREP-${snapshot.generatedAt.replace(/[^0-9]/g, '')}`);
  text(`Issued: ${timestamp(snapshot.generatedAt)}`);
  text('Scope: All incidents in the current repository; dashboard filters do not apply.');
  if (snapshot.incidents.some(i => i.title.includes('[Simulated]'))) {
    text('EXERCISE DATA: This report includes simulated incidents.', true);
  }
  text('Operational snapshot generated automatically. AI observations are provisional; verification status is listed per incident.');

  section('1. Situation overview');
  const s = snapshot.stats;
  text(`Total incidents: ${s.total} | Citizen reports: ${s.totalReports}`);
  text(`Critical priority: ${s.critical} | High priority: ${s.high}`);
  text(`Awaiting assignment: ${s.awaitingAssignment} | Active responses: ${s.activeResponses}`);
  const active = snapshot.incidents.filter(i => !['resolved', 'closed'].includes(i.status));
  text(`Active incidents: ${active.length} | Resolved / closed: ${s.total - active.length}`);
  text('KPI definitions: Critical/High include all incident statuses. Awaiting assignment means open incidents. Active responses count acknowledged, en-route, on-site, or in-progress department assignments.');

  section('2. Active high-priority incident breakdown');
  const urgent = active.filter(i => i.priority_band === 'Critical' || i.priority_band === 'High')
    .sort((a, b) => b.priority_score - a.priority_score || a.id.localeCompare(b.id));
  if (!urgent.length) text('No active Critical or High priority incidents.');
  for (let index = 0; index < urgent.length; index++) {
    const incident = urgent[index];
    text(`${index + 1}. ${incident.title}`, true, 11);
    text(`Incident ID: ${incident.id}`);
    text(`Priority: ${incident.priority_band} (${incident.priority_score}/100) | Category: ${incident.category}`);
    text(`Status: ${incident.status} | Verification: ${incident.verification_status} | Human review: ${incident.review_required ? 'Required' : 'Not flagged'}`);
    text(`Location: ${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)} | Evidence reports: ${incident.evidence_count ?? incident.reports?.length ?? 0}`);
    text(`Summary: ${incident.description || 'Not recorded'}`);
    text(`Priority rationale: ${incident.priority_reasons.join('; ') || 'Not recorded'}`);
    text(`Secondary hazards: ${incident.secondary_hazards.join(', ') || 'None recorded'}`);
    text(`Assigned departments: ${incident.assignments?.map(a => `${a.department?.name ?? a.department_id} (${a.assignment_status})`).join('; ') || 'No assignments recorded'}`);
    text(`Last updated: ${timestamp(incident.updated_at)}`);
  }

  section('3. Departmental response logs');
  let assignmentCount = 0;
  for (const incident of snapshot.incidents) {
    for (const assignment of incident.assignments ?? []) {
      assignmentCount++;
      text(`${assignment.department?.name ?? assignment.department_id} | ${incident.title}`, true);
      text(`Incident ID: ${incident.id} | Assignment ID: ${assignment.id}`);
      text(`Response status: ${assignment.assignment_status} | Assigned: ${timestamp(assignment.assigned_at)}`);
      text(`Acknowledged: ${assignment.acknowledged_at ? timestamp(assignment.acknowledged_at) : 'Not recorded'} | Completed: ${assignment.completed_at ? timestamp(assignment.completed_at) : 'Not recorded'}`);
      text(`Response notes: ${assignment.notes || 'No response notes recorded.'}`);
      text(`Assignment source: ${assignment.assignment_source ?? 'manual'} | Work verification: ${assignment.completion_verification ?? 'not_submitted'}`);
      if (assignment.review_notes) text(`Admin work review: ${assignment.review_notes}`);
    }
  }
  if (!assignmentCount) text('No departmental assignments recorded.');

  section('4. Response activity history');
  const responseActions = new Set(['department_assigned', 'assignment_acknowledged', 'status_updated', 'incident_resolved', 'response_auto_assigned', 'routing_review_required', 'routing_review_completed', 'response_completion_submitted', 'response_work_verified', 'response_rework_requested']);
  const logs = snapshot.activityLogs.filter(log => responseActions.has(log.action))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const incidentsById = new Map(snapshot.incidents.map(i => [i.id, i]));
  if (!logs.length) text('No response activity recorded.');
  for (const log of logs) {
    text(`${timestamp(log.created_at)} | ${log.action}`, true);
    text(`Incident: ${incidentsById.get(log.incident_id)?.title ?? log.incident_id}`);
    text(`Actor: ${log.actor_profile?.display_name ?? log.actor_id ?? 'Not recorded'}`);
    text(`Details: ${log.reason || 'No details recorded'}`);
    if (log.old_value?.status || log.new_value?.status) {
      text(`Status transition: ${log.old_value?.status ?? 'Not recorded'} -> ${log.new_value?.status ?? 'Not recorded'}`);
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 100, 110);
    doc.text(`CIVISCOPE | Situation Report | ${timestamp(snapshot.generatedAt)}`, 18, 286);
    doc.text(`Page ${page} of ${pages}`, 192, 286, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
