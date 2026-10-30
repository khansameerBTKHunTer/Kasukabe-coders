import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Incident, Report, AIAssessment, AssignmentStatus } from "@/types";
import { IncidentService, getStore, SEED_DEPARTMENTS } from "@/lib/data-store";
import { ApiError, requireActor, type Actor } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePriorityScore } from "@/lib/priority-engine";
import { recommendDepartments } from "@/lib/department-router";
import { findDuplicateCandidates } from "@/lib/duplicate-detector";

export const EVIDENCE_BUCKET = "incident-evidence";
export type SubmitReport = Parameters<
  typeof IncidentService.submitCitizenReport
>[0];
const activeStatuses = ["acknowledged", "en_route", "on_site", "in_progress"];
function failure(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42501")
    throw new ApiError(
      403,
      "Your account does not have permission for this action.",
    );
  if (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01"
  )
    throw new ApiError(
      503,
      "Database setup is incomplete. Apply the reviewed portal integration migration first.",
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
    if (this.actor.demo) return IncidentService.submitCitizenReport(params);
    const priorityResult = calculatePriorityScore({
      category: params.aiAssessment?.category ?? "other",
      immediateDanger: params.immediateDanger,
      reportedPeopleAffected: params.reportedPeopleAffected,
      aiAssessment: params.aiAssessment,
      sourceType: params.sourceType,
    });
    const recommendation = recommendDepartments(
      params.aiAssessment?.category ?? "other",
      params.description,
      params.aiAssessment?.secondary_hazards ?? [],
    );
    const { data: departments, error: deptError } = await this.admin
      .from("departments")
      .select("*");
    failure(deptError);
    const now = new Date().toISOString();
    const incident: Omit<Incident, "id"> & { id: string } = {
      id: randomUUID(),
      title:
        params.aiAssessment?.title ??
        `Disaster Report: ${params.description.slice(0, 60)}`,
      category: params.aiAssessment?.category ?? "other",
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
      review_required: true,
      verification_status: "unverified",
      status: "open",
      primary_department_id:
        departments?.find(
          (d) => d.code === recommendation.primaryDepartmentCode,
        )?.id ?? null,
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
    return this.actor.demo
      ? IncidentService.verifyIncident(id, status, this.actor.profile.id)
      : this.command("verify", id, { status });
  }
  async overridePriority(id: string, score: number, reason: string) {
    this.adminOnly();
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
      assignments.some((a) => a.assignment_status !== "resolved")
    )
      throw new ApiError(
        409,
        "All department assignments must be resolved before closing.",
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
  async confirmDuplicate(reportId: string, targetIncidentId: string) {
    this.adminOnly();
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
