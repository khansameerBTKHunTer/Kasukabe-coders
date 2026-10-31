import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Incident, Report, AIAssessment, AssignmentStatus } from "@/types";
import { IncidentService, getStore, SEED_DEPARTMENTS } from "@/lib/data-store";
import { ApiError, requireActor, type Actor } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePriorityScore } from "@/lib/priority-engine";
import { recommendDepartments, reportCategory } from "@/lib/department-router";
import { findDuplicateCandidates } from "@/lib/duplicate-detector";
import { planResponse, responseStatus } from "@/lib/response-routing";
import { validatePhotoBytes } from "@/lib/photo-validation";

export const EVIDENCE_BUCKET = "incident-evidence";
const uploadValidation = globalThis as typeof globalThis & { civiscopeVerifiedPhotos?: Map<string, number> };
export type SubmitReport = Parameters<
  typeof IncidentService.submitCitizenReport
>[0];
const activeStatuses = ["acknowledged", "en_route", "on_site", "in_progress"];
function failure(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "22P02") throw new ApiError(400, "Invalid record identifier.");
  if (error.code === "42501")
    throw new ApiError(
      403,
      "Your account does not have permission for this action.",
    );
  if (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.code === "42P01"
  )
    throw new ApiError(
      503,
      "Database setup is incomplete. Apply the portal integration and India relief routing migrations first.",
    );
  if (error.code === "P0001" || error.code === "22023")
    throw new ApiError(409, error.message);
  throw new ApiError(
    503,
    "The database operation failed. Check the project connection and retry.",
  );
}
export async function signedPhoto(path: string) {
  if (!path?.startsWith("supabase://")) return path;
  const key = path.slice(`supabase://${EVIDENCE_BUCKET}/`.length);
  const { data, error } = await createAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(key, 900);
  return error ? "" : data.signedUrl;
}
export async function validatePhoto(actor: Actor, path: string) {
  if (actor.demo) {
    if (!/^\/api\/uploads\/[a-f0-9-]{36}$/.test(path))
      throw new ApiError(
        400,
        "Upload an incident photograph before submitting.",
      );
    const { readDemoUpload } = await import("@/lib/uploads");
    const upload = await readDemoUpload(path.split("/").pop()!);
    if (upload.owner !== actor.profile.id)
      throw new ApiError(403, "This photograph belongs to another account.");
  } else {
    const prefix = `supabase://${EVIDENCE_BUCKET}/${actor.profile.id}/`;
    if (
      !path.startsWith(prefix) ||
      !/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path.slice(prefix.length))
    )
      throw new ApiError(400, "Use a photograph uploaded by your account.");
    const { data, error } = await createAdminClient()
      .storage.from(EVIDENCE_BUCKET)
      .list(actor.profile.id, { search: path.slice(prefix.length) });
    if (error || !data?.some((file) => file.name === path.slice(prefix.length)))
      throw new ApiError(
        400,
        "The uploaded photograph could not be found. Upload it again.",
      );
    // Signed uploads bypass this app's multipart handler. Validate the actual
    // stored bytes before accepting evidence, not just its client MIME label.
    const verified = (uploadValidation.civiscopeVerifiedPhotos ??= new Map());
    const validationKey = `${process.env.NEXT_PUBLIC_SUPABASE_URL}:${path}`;
    if ((verified.get(validationKey) ?? 0) <= Date.now()) {
      const downloaded = await createAdminClient().storage.from(EVIDENCE_BUCKET)
        .download(path.slice(`supabase://${EVIDENCE_BUCKET}/`.length));
      if (downloaded.error || !downloaded.data)
        throw new ApiError(503, "The uploaded photograph could not be verified. Retry shortly.");
      validatePhotoBytes(Buffer.from(await downloaded.data.arrayBuffer()), downloaded.data.type);
      if (verified.size >= 128) verified.delete(verified.keys().next().value!);
      verified.set(validationKey, Date.now() + 5 * 60_000);
    }
  }
}
export function statistics(incidents: Incident[], totalReports?: number) {
  return {
    total: incidents.length,
    critical: incidents.filter((i) => i.priority_band === "Critical").length,
    high: incidents.filter((i) => i.priority_band === "High").length,
    awaitingAssignment: incidents.filter((i) => i.status === "open").length,
    activeResponses: incidents
      .flatMap((i) => i.assignments ?? [])
      .filter((a) => activeStatuses.includes(a.assignment_status)).length,
    totalReports:
      totalReports ??
      incidents.reduce((n, i) => n + (i.reports?.length ?? 0), 0),
  };
}
export class Backend {
  constructor(public actor: Actor) {}
  private get admin() {
    return createAdminClient();
  }
  private async hydrate(incident: Incident) {
    return {
      ...incident,
      evidence_count: incident.reports?.length ?? 0,
      reports: await Promise.all(
        (incident.reports ?? []).map(async (report) => ({
          ...report,
          image_path: await signedPhoto(report.image_path),
        })),
      ),
    };
  }
  async getIncidents(): Promise<Incident[]> {
    if (this.actor.profile.role === "citizen")
      throw new ApiError(403, "Use My reports to view your own submissions.");
    if (this.actor.demo) {
      const all = await IncidentService.getIncidents();
      return this.actor.profile.role === "admin"
        ? all
        : all
            .filter((i) =>
              i.assignments?.some(
                (a) => a.department_id === this.actor.profile.department_id,
              ),
            )
            .map((i) => ({
              ...i,
              assignments: i.assignments?.filter(
                (a) => a.department_id === this.actor.profile.department_id,
              ),
            }));
    }
    const { data, error } = await this.actor
      .client!.from("incidents")
      .select(
        "*, reports(*), assignments(*, department:departments(*)), primary_department:departments!incidents_primary_department_id_fkey(*)",
      )
      .order("priority_score", { ascending: false });
    failure(error);
    return Promise.all((data ?? []).map((i) => this.hydrate(i as Incident)));
  }
  async getIncidentById(id: string) {
    return (await this.getIncidents()).find((i) => i.id === id) ?? null;
  }
  async getActivityLogs(incidentId?: string) {
    if (this.actor.profile.role === "citizen")
      throw new ApiError(
        403,
        "Operational activity is restricted to assigned responders.",
      );
    if (this.actor.demo) {
      const visible = new Set((await this.getIncidents()).map((i) => i.id));
      return (await IncidentService.getActivityLogs(incidentId)).filter((l) =>
        visible.has(l.incident_id),
      );
    }
    let query = this.actor
      .client!.from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false });
    if (incidentId) query = query.eq("incident_id", incidentId);
    const { data, error } = await query;
    failure(error);
    return data ?? [];
  }
  async getReports() {
    const id = this.actor.profile.id;
    if (this.actor.demo) {
      return (await IncidentService.getReports())
        .filter((r) => r.reporter_id === id)
        .map((r) => {
          const incident = getStore().incidents.find(
            (i) => i.id === r.incident_id,
          );
          return {
            ...r,
            incident_status: incident?.status ?? null,
            incident_updated_at: incident?.updated_at ?? null,
          };
        });
    }
    const { data, error } = await this.actor
      .client!.from("reports")
      .select("*")
      .eq("reporter_id", id)
      .order("created_at", { ascending: false });
    failure(error);
    // Only project status for incidents linked to this verified user's reports.
    const ids = [
      ...new Set((data ?? []).map((r) => r.incident_id).filter(Boolean)),
    ];
    const summaries = ids.length
      ? await this.admin
          .from("incidents")
          .select("id,status,updated_at")
          .in("id", ids)
      : { data: [], error: null };
    failure(summaries.error);
    return Promise.all(
      (data ?? []).map(async (r) => {
        const incident = summaries.data?.find((i) => i.id === r.incident_id);
        return {
          ...r,
          image_path: await signedPhoto(r.image_path),
          incident_status: incident?.status ?? null,
          incident_updated_at: incident?.updated_at ?? null,
        };
      }),
    );
  }
  async getStatistics() {
    const list = await this.getIncidents();
    return statistics(list);
  }
  async submitCitizenReport(params: SubmitReport) {
    await validatePhoto(this.actor, params.imagePath);
    params.reporterId = this.actor.profile.id;
    if (this.actor.demo) {
      const result = await IncidentService.submitCitizenReport(params);
      return { ...result, duplicateCandidates: [] };
    }
    const category = reportCategory(params.aiAssessment, params.description);
    const priorityResult = calculatePriorityScore({
      category,
      immediateDanger: params.immediateDanger,
      reportedPeopleAffected: params.reportedPeopleAffected,
      aiAssessment: params.aiAssessment,
      sourceType: params.sourceType,
    });
    const recommendation = recommendDepartments(
      category,
      params.description,
      params.aiAssessment?.secondary_hazards ?? [],
    );
    const { data: departments, error: deptError } = await this.admin
      .from("departments")
      .select("id,name,code,capabilities,responder_role,activation_mode");
    failure(deptError);
    let nearbyQuery = this.admin.from("incidents")
      .select("id,title,category,latitude,longitude,description,status")
      .gte("latitude", params.incidentLatitude - 0.002)
      .lte("latitude", params.incidentLatitude + 0.002)
      .not("status", "in", "(resolved,closed)");
    const longitudeSpan = Math.min(180, 0.002 / Math.max(0.001, Math.cos(params.incidentLatitude * Math.PI / 180)));
    if (params.incidentLongitude - longitudeSpan >= -180 && params.incidentLongitude + longitudeSpan <= 180) {
      nearbyQuery = nearbyQuery.gte("longitude", params.incidentLongitude - longitudeSpan).lte("longitude", params.incidentLongitude + longitudeSpan);
    }
    const { data: nearby, error: nearbyError } = await nearbyQuery;
    failure(nearbyError);
    const duplicates = findDuplicateCandidates({ incident_latitude: params.incidentLatitude, incident_longitude: params.incidentLongitude, description: params.description, category }, (nearby ?? []) as Incident[]);
    const routing = planResponse({ ...params, priorityBand: priorityResult.priorityBand, hasDuplicateCandidates: duplicates.some(d => d.duplicateConfidence !== "unlikely"), departments: departments ?? [] });
    const now = new Date().toISOString();
    const incident: Omit<Incident, "id"> & { id: string } = {
      id: randomUUID(),
      title:
        params.aiAssessment?.title ??
        `Disaster Report: ${params.description.slice(0, 60)}`,
      category,
      latitude: params.incidentLatitude,
      longitude: params.incidentLongitude,
      description: params.description,
      visible_damage: params.aiAssessment?.visible_damage ?? [],
      secondary_hazards: params.aiAssessment?.secondary_hazards ?? [],
      severity: params.aiAssessment?.severity ?? "medium",
      ai_confidence: params.aiAssessment?.confidence ?? 0,
      ai_assessment: params.aiAssessment ?? null,
      priority_score: priorityResult.totalScore,
      priority_band: priorityResult.priorityBand,
      priority_reasons: priorityResult.reasons,
      review_required: routing.mode === "needs_review",
      routing_decision: routing,
      verification_status: "unverified",
      status: routing.assigned_codes.length ? "assigned" : "open",
      primary_department_id: routing.assigned_codes.length ?
        departments?.find(
          (d) => d.code === (routing.assigned_codes.includes(recommendation.primaryDepartmentCode) ? recommendation.primaryDepartmentCode : routing.assigned_codes[0]),
        )?.id ?? null : null,
      created_at: now,
      updated_at: now,
    };
    const report: Report = {
      id: randomUUID(),
      reporter_id: this.actor.profile.id,
      incident_id: incident.id,
      image_path: params.imagePath,
      description: params.description,
      incident_latitude: params.incidentLatitude,
      incident_longitude: params.incidentLongitude,
      reporter_latitude: params.reporterLatitude ?? null,
      reporter_longitude: params.reporterLongitude ?? null,
      source_type: params.sourceType,
      assistance_needed: params.assistanceNeeded,
      reported_people_affected: params.reportedPeopleAffected ?? null,
      immediate_danger: params.immediateDanger,
      verification_status: "unverified",
      created_at: now,
    };
    const readiness = await this.admin.rpc("civiscope_deployment_status");
    if (readiness.error || readiness.data?.schema_version !== "20261105" || !readiness.data?.report_delivery_installed)
      throw new ApiError(503, "The database needs the department-delivery and deployment-readiness migrations through 20261105. Your report has not been submitted; keep this form open and retry after setup.");
    const { error } = await this.admin.rpc("civiscope_submit_report", {
      report_data: report,
      incident_data: incident,
      actor_id: this.actor.profile.id,
    });
    failure(error);
    // Candidate details are for the administrative review endpoint, not exposed to reporters.
    return {
      report: { ...report, image_path: await signedPhoto(report.image_path) },
      incident,
      priorityResult,
      duplicateCandidates: [],
    };
  }
  private async command(
    command: string,
    id: string,
    payload: Record<string, unknown>,
  ) {
    // Older RPCs ignore unknown JSON fields. Check the schema before allowing a
    // write so the UI never claims auto-assignment against an unmigrated DB.
    const schema = await this.admin.from("departments").select("activation_mode,responder_role").limit(1);
    failure(schema.error);
    const { data, error } = await this.admin.rpc("civiscope_command", {
      command,
      target_id: id,
      payload,
      actor_id: this.actor.profile.id,
    });
    failure(error);
    return data;
  }
  private adminOnly() {
    if (this.actor.profile.role !== "admin")
      throw new ApiError(403, "Control Room access is required.");
  }
  private async assignment(id: string) {
    if (this.actor.profile.role === "citizen")
      throw new ApiError(403, "Responder access is required.");
    const found = (await this.getIncidents())
      .flatMap((i) => i.assignments ?? [])
      .find((a) => a.id === id);
    if (!found)
      throw new ApiError(
        404,
        "Assignment not found or not assigned to your department.",
      );
    return found;
  }
  async assignDepartment(
    id: string,
    departmentId: string,
    _actor?: string,
    notes?: string,
  ) {
    this.adminOnly();
    if (this.actor.demo) {
      const incident = getStore().incidents.find(i => i.id === id);
      if (!incident) throw new ApiError(404, "Incident not found.");
      if (incident.status === "closed") throw new ApiError(409, "This incident is closed.");
      if (!SEED_DEPARTMENTS.some(d => d.id === departmentId && d.code !== "CONTROL_ROOM"))
        throw new ApiError(400, "Select an available response department.");
    }
    return this.actor.demo
      ? IncidentService.assignDepartment(
          id,
          departmentId,
          this.actor.profile.id,
          notes,
        )
      : this.command("assign", id, { departmentId, notes });
  }
  async acknowledgeAssignment(id: string) {
    return this.transition(id, "acknowledged");
  }
  async updateResponseStatus(
    id: string,
    status: AssignmentStatus,
    notes?: string,
  ) {
    return this.transition(id, status, notes);
  }
  private async transition(id: string, next: AssignmentStatus, notes?: string) {
    const assignment = await this.assignment(id);
    const transitions: Record<AssignmentStatus, AssignmentStatus[]> = {
      pending: ["acknowledged", "rejected"],
      acknowledged: ["en_route", "on_site", "in_progress", "rejected"],
      en_route: ["on_site", "in_progress", "rejected"],
      on_site: ["in_progress", "resolved", "rejected"],
      in_progress: ["in_progress", "resolved", "rejected"],
      resolved: [],
      rejected: [],
    };
    if (!transitions[assignment.assignment_status].includes(next))
      throw new ApiError(
        409,
        "This assignment status transition is no longer available. Refresh and retry.",
      );
    if (next === "rejected" && (!notes || notes.trim().length < 5))
      throw new ApiError(
        400,
        "Provide a rejection reason with at least 5 characters.",
      );
    if (next === "resolved" && (!notes || notes.trim().length < 10))
      throw new ApiError(400, "Describe the completed work using at least 10 characters for admin verification.");
    if (!this.actor.demo)
      return this.command("status", id, { status: next, notes });
    if (next === "acknowledged")
      return IncidentService.acknowledgeAssignment(id, this.actor.profile.id);
    if (next === "en_route" || next === "on_site") {
      const stored = getStore().assignments.find((a) => a.id === id)!;
      const previous = stored.assignment_status;
      stored.assignment_status = next;
      if (notes) stored.notes = notes;
      const incident = getStore().incidents.find(
        (i) => i.id === stored.incident_id,
      )!;
      incident.status = "in_progress";
      incident.updated_at = new Date().toISOString();
      getStore().activityLogs.unshift({
        id: randomUUID(),
        incident_id: incident.id,
        actor_id: this.actor.profile.id,
        action: "status_updated",
        old_value: { status: previous },
        new_value: { status: next },
        reason: notes ?? `Department ${next.replace("_", " ")}`,
        created_at: new Date().toISOString(),
      });
      return stored;
    }
    if (next === "pending")
      throw new ApiError(409, "Cannot return an assignment to pending.");
    return IncidentService.updateResponseStatus(
      id,
      next,
      notes,
      this.actor.profile.id,
    );
  }
  async verifyIncident(
    id: string,
    status: "verified" | "flagged" | "rejected",
  ) {
    this.adminOnly();
    if (this.actor.demo && !getStore().incidents.some(i => i.id === id)) throw new ApiError(404, "Incident not found.");
    return this.actor.demo
      ? IncidentService.verifyIncident(id, status, this.actor.profile.id)
      : this.command("verify", id, { status });
  }
  async overridePriority(id: string, score: number, reason: string) {
    this.adminOnly();
    if (this.actor.demo && !getStore().incidents.some(i => i.id === id)) throw new ApiError(404, "Incident not found.");
    return this.actor.demo
      ? IncidentService.overridePriority(
          id,
          score,
          reason,
          this.actor.profile.id,
        )
      : this.command("priority", id, { score, reason });
  }
  async closeIncident(id: string) {
    this.adminOnly();
    if (!this.actor.demo) return this.command("close", id, {});
    const incident = getStore().incidents.find((i) => i.id === id);
    if (!incident) throw new ApiError(404, "Incident not found.");
    const assignments = getStore().assignments.filter(
      (a) => a.incident_id === id,
    );
    if (
      incident.status !== "resolved" ||
      !assignments.length ||
      assignments.some((a) => a.assignment_status !== "rejected" && (a.assignment_status !== "resolved" || a.completion_verification !== "verified")) ||
      incident.routing_decision?.mode === "needs_review"
    )
      throw new ApiError(
        409,
        "All response work must be verified and routing review completed before closing.",
      );
    incident.status = "closed";
    incident.updated_at = new Date().toISOString();
    getStore().activityLogs.unshift({
      id: randomUUID(),
      incident_id: id,
      actor_id: this.actor.profile.id,
      action: "incident_closed",
      reason: "Control Room closed the completed incident.",
      created_at: new Date().toISOString(),
    });
    return incident;
  }
  async reviewResponse(id: string, decision: "verified" | "rework", notes: string) {
    this.adminOnly();
    if (notes.trim().length < 10) throw new ApiError(400, "Provide review notes of at least 10 characters.");
    if (!this.actor.demo) return this.command("review_response", id, { decision, notes });
    const assignment = getStore().assignments.find(a => a.id === id);
    if (!assignment || assignment.assignment_status !== "resolved" || assignment.completion_verification !== "pending_review") throw new ApiError(409, "This response is not awaiting verification.");
    assignment.completion_verification = decision;
    assignment.reviewed_by = this.actor.profile.id;
    assignment.reviewed_at = new Date().toISOString();
    assignment.review_notes = notes.trim();
    if (decision === "rework") { assignment.assignment_status = "in_progress"; assignment.completed_at = null; }
    const incident = getStore().incidents.find(i => i.id === assignment.incident_id)!;
    incident.status = responseStatus(getStore().assignments.filter(a => a.incident_id === incident.id));
    incident.updated_at = new Date().toISOString();
    getStore().activityLogs.unshift({ id: randomUUID(), incident_id: incident.id, actor_id: this.actor.profile.id, action: decision === "verified" ? "response_work_verified" : "response_rework_requested", new_value: { assignment_id: id, decision }, reason: notes.trim(), created_at: incident.updated_at });
    return assignment;
  }
  async reviewRouting(id: string, notes: string) {
    this.adminOnly();
    if (notes.trim().length < 10) throw new ApiError(400, "Explain the routing decision using at least 10 characters.");
    if (!this.actor.demo) return this.command("review_routing", id, { notes });
    const incident = getStore().incidents.find(i => i.id === id);
    const assignments = getStore().assignments.filter(a => a.incident_id === id && a.assignment_status !== "rejected");
    if (!incident || incident.status === "closed" || !assignments.length) throw new ApiError(409, "Assign at least one response team before completing routing review.");
    const codes = assignments.map(a => SEED_DEPARTMENTS.find(d => d.id === a.department_id)!.code);
    incident.routing_decision = { mode: "manual", assigned_codes: [...new Set(codes)], suggested_codes: incident.routing_decision?.suggested_codes ?? codes, reasons: [notes.trim()], policy_version: "india-relief-v1" };
    incident.review_required = false;
    incident.updated_at = new Date().toISOString();
    getStore().activityLogs.unshift({ id: randomUUID(), incident_id: id, actor_id: this.actor.profile.id, action: "routing_review_completed", new_value: incident.routing_decision, reason: notes.trim(), created_at: incident.updated_at });
    return incident;
  }
  async confirmDuplicate(reportId: string, targetIncidentId: string) {
    this.adminOnly();
    if (this.actor.demo && (!getStore().reports.some(r => r.id === reportId) || !getStore().incidents.some(i => i.id === targetIncidentId)))
      throw new ApiError(404, "Report or target incident not found.");
    return this.actor.demo
      ? IncidentService.confirmDuplicate(
          reportId,
          targetIncidentId,
          this.actor.profile.id,
        )
      : this.command("duplicate", reportId, { targetIncidentId });
  }
  async keepSeparate(reportId: string) {
    this.adminOnly();
    if (this.actor.demo && !getStore().reports.some(r => r.id === reportId)) throw new ApiError(404, "Report not found.");
    return this.actor.demo
      ? IncidentService.keepSeparate(reportId, this.actor.profile.id)
      : this.command("separate", reportId, {});
  }
  async addEvidence(
    assignmentId: string,
    imagePath: string,
    description: string,
  ) {
    const assignment = await this.assignment(assignmentId);
    if (["resolved", "rejected"].includes(assignment.assignment_status))
      throw new ApiError(409, "This assignment is completed.");
    await validatePhoto(this.actor, imagePath);
    if (!this.actor.demo)
      return this.command("evidence", assignmentId, { imagePath, description });
    const incident = getStore().incidents.find(
      (i) => i.id === assignment.incident_id,
    )!;
    const report: Report = {
      id: randomUUID(),
      reporter_id: this.actor.profile.id,
      incident_id: incident.id,
      image_path: imagePath,
      description,
      incident_latitude: incident.latitude,
      incident_longitude: incident.longitude,
      source_type: "field_report",
      assistance_needed: "Field evidence update",
      immediate_danger: "unknown",
      verification_status: "unverified",
      created_at: new Date().toISOString(),
    };
    getStore().reports.unshift(report);
    getStore().activityLogs.unshift({
      id: randomUUID(),
      incident_id: incident.id,
      actor_id: this.actor.profile.id,
      action: "field_evidence_added",
      reason: description,
      created_at: new Date().toISOString(),
    });
    return report;
  }
}
export async function getBackend(request: Request, adminOnly = false) {
  return new Backend(await requireActor(request, adminOnly));
}
