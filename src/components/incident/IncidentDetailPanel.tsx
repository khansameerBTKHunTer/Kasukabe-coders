"use client";
import Image from "next/image";

import React, { useState } from "react";
import {
  Incident,
  Department,
  Profile,
  Assignment,
  AssignmentStatus,
} from "@/types";
import { PriorityBadge } from "../ui/PriorityBadge";
import {
  IncidentStatusBadge,
  VerificationBadge,
  AssignmentStatusBadge,
} from "../ui/StatusBadge";
import { AIAssessmentCard } from "./AIAssessmentCard";
import { PriorityBreakdownCard } from "./PriorityBreakdownCard";
import { uploadPhoto } from "@/lib/upload-client";
import { ActivityTimeline } from "./ActivityTimeline";
import { ResponseRoutingCard } from "./ResponseRoutingCard";
import { ResponseWorkReview } from "./ResponseWorkReview";
import {
  X,
  MapPin,
  Clock,
  Send,
  ShieldCheck,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Building,
  Image as ImageIcon,
} from "lucide-react";

interface IncidentDetailPanelProps {
  incident: Incident;
  departments: Department[];
  currentUser: Profile;
  onClose: () => void;
  onRefresh: () => void;
}

export const IncidentDetailPanel: React.FC<IncidentDetailPanelProps> = ({
  incident,
  departments,
  currentUser,
  onClose,
  onRefresh,
}) => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    departments.find(
      (d) =>
        d.id === incident.primary_department_id && d.code !== "CONTROL_ROOM",
    )?.id ||
      departments.find((d) => d.code !== "CONTROL_ROOM")?.id ||
      "",
  );
  const [assignNotes, setAssignNotes] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Status update state for department responders
  const [statusNote, setStatusNote] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsError, setLogsError] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const actionLock = React.useRef(false);

  // Fetch real activity logs for this incident
  React.useEffect(() => {
    const controller = new AbortController();
    setLogsError("");
    fetch(`/api/incidents/${incident.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success)
          throw new Error(data.error || "Activity could not be loaded.");
        return data;
      })
      .then((data) => {
        if (data.success && data.activityLogs) {
          setActivityLogs(data.activityLogs);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError")
          setLogsError(
            "Activity could not be loaded. Refresh the incident to retry.",
          );
      });
    return () => controller.abort();
  }, [incident]);

  const isAdmin = currentUser.role === "admin";

  // Check if current department has an assignment for this incident
  const userDeptAssignment = incident.assignments?.find(
    (a) =>
      a.department_id === currentUser.department_id &&
      !["resolved", "rejected"].includes(a.assignment_status),
  );

  const canRespondToAssignment =
    userDeptAssignment &&
    (userDeptAssignment.assignment_status === "pending" ||
      userDeptAssignment.assignment_status === "acknowledged" ||
      userDeptAssignment.assignment_status === "en_route" ||
      userDeptAssignment.assignment_status === "on_site" ||
      userDeptAssignment.assignment_status === "in_progress");

  // Handle department assignment (Admin only)
  const handleAssignDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId || actionLock.current) return;
    actionLock.current = true;

    try {
      setIsAssigning(true);
      setActionError(null);
      const res = await fetch(`/api/incidents/${incident.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: selectedDeptId,
          assignedBy: currentUser.id,
          notes: assignNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(
          data.error || "The server did not acknowledge the action.",
        );

      setAssignNotes("");
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to assign department");
    } finally {
      setIsAssigning(false);
      actionLock.current = false;
    }
  };

  // Handle acknowledgement (Department user)
  const handleAcknowledge = async () => {
    if (!userDeptAssignment || actionLock.current) return;
    actionLock.current = true;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      const res = await fetch(`/api/assignments/${userDeptAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "acknowledge",
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(
          data.error || "The server did not acknowledge the action.",
        );
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to acknowledge assignment");
    } finally {
      setIsUpdatingStatus(false);
      actionLock.current = false;
    }
  };

  // Handle status update (Department user)
  const handleUpdateStatus = async (status: AssignmentStatus) => {
    if (!userDeptAssignment || actionLock.current) return;
    actionLock.current = true;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      const res = await fetch(`/api/assignments/${userDeptAssignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          status,
          notes: statusNote || undefined,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(
          data.error || "The server did not acknowledge the action.",
        );

      setStatusNote("");
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to update response status");
    } finally {
      setIsUpdatingStatus(false);
      actionLock.current = false;
    }
  };

  // Handle priority override (Admin only)
  const handleOverridePriority = async (newScore: number, reason: string) => {
    const res = await fetch(`/api/incidents/${incident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "override_priority",
        priorityScore: newScore,
        overrideReason: reason,
        userId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(
        data.error || "The server did not acknowledge the action.",
      );
    onRefresh();
  };

  // Handle verification status change (Admin only)
  const handleVerify = async (status: "verified" | "flagged" | "rejected") => {
    try {
      setActionError(null);
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          verificationStatus: status,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(
          data.error || "The server did not acknowledge the action.",
        );
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to update verification status");
    }
  };

  // Primary image
  const primaryReport = incident.reports?.[0];
  const imagePath = primaryReport?.image_path;

  const submitEvidence = async () => {
    if (!userDeptAssignment || !evidence || actionLock.current) return;
    actionLock.current = true;
    setIsUpdatingStatus(true);
    setActionError(null);
    try {
      const photo = await uploadPhoto(evidence, () => {});
      const res = await fetch(
        `/api/assignments/${userDeptAssignment.id}/evidence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imagePath: photo.imagePath,
            description: statusNote,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success || !data.report?.id)
        throw new Error(data.error || "Evidence was not acknowledged.");
      setEvidence(null);
      setStatusNote("");
      onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Evidence upload failed.",
      );
    } finally {
      actionLock.current = false;
      setIsUpdatingStatus(false);
    }
  };
  const closeIncident = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setIsUpdatingStatus(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "Closure failed.");
      onRefresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Closure failed.",
      );
    } finally {
      actionLock.current = false;
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col glass-panel-elevated rounded-xl overflow-hidden border border-slate-200/80">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-start justify-between bg-white/80">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <PriorityBadge
              band={incident.priority_band}
              score={incident.priority_score}
              size="md"
            />
            <IncidentStatusBadge status={incident.status} />
            <VerificationBadge status={incident.verification_status} />
          </div>
          <h2 className="text-base font-bold text-slate-900 leading-snug">
            {incident.title}
          </h2>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              {incident.latitude.toFixed(4)}°N, {incident.longitude.toFixed(4)}
              °E
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5" />
              {new Date(incident.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <button
          aria-label="Close incident details"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mx-4 mt-3 p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {actionError}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Evidence Imagery Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
              Photographic Evidence ({incident.reports?.length ?? 0})
            </span>
            {incident.reports && incident.reports.length > 1 && (
              <span className="text-[11px] text-blue-700 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {incident.reports.length - 1} Additional evidence records
              </span>
            )}
          </div>

          <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-black max-h-56">
            {imagePath ? (
              <Image
                unoptimized
                width={800}
                height={448}
                src={imagePath}
                alt="Disaster evidence"
                className="w-full h-48 object-cover"
              />
            ) : (
              <p className="p-5 text-xs text-slate-500">
                No incident photograph available.
              </p>
            )}
          </div>

          {/* Multiple evidence gallery thumbnails */}
          {incident.reports && incident.reports.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {incident.reports.map((rep, idx) => (
                <div
                  key={rep.id}
                  className="relative rounded border border-slate-200 overflow-hidden shrink-0 w-20 h-14 bg-white"
                >
                  <Image
                    unoptimized
                    width={800}
                    height={448}
                    src={rep.image_path}
                    alt={`Evidence #${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 bg-black/80 text-[9px] px-1 font-mono text-slate-700">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="p-3 rounded-lg bg-white/60 border border-slate-200 space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Incident Description &amp; Civilian Context:
          </span>
          <p className="text-xs text-slate-700 leading-relaxed">
            {incident.description}
          </p>
        </div>

        {/* AI Assessment Card */}
        <AIAssessmentCard
          assessment={incident.ai_assessment}
          confidence={incident.ai_confidence}
        />

        {/* Priority Breakdown Engine */}
        <PriorityBreakdownCard
          score={incident.priority_score}
          band={incident.priority_band}
          reasons={incident.priority_reasons}
          reviewRequired={incident.review_required}
          canOverride={isAdmin}
          onOverride={handleOverridePriority}
        />

        {/* Verification Actions (Admin Only) */}
        {isAdmin && (
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white/60 space-y-2.5">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Human Incident Verification
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleVerify("verified")}
                disabled={incident.verification_status === "verified"}
                className="py-1.5 px-2 rounded text-xs font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-200 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
              >
                Mark Verified
              </button>
              <button
                type="button"
                onClick={() => handleVerify("flagged")}
                disabled={incident.verification_status === "flagged"}
                className="py-1.5 px-2 rounded text-xs font-medium bg-amber-500/15 text-amber-700 border border-amber-200 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
              >
                Flag for Triage
              </button>
              <button
                type="button"
                onClick={() => handleVerify("rejected")}
                disabled={incident.verification_status === "rejected"}
                className="py-1.5 px-2 rounded text-xs font-medium bg-red-500/15 text-red-700 border border-red-200 hover:bg-red-500/25 transition-colors disabled:opacity-40"
              >
                Reject Report
              </button>
            </div>
          </div>
        )}

        {/* Department Assignments Status */}
        <ResponseRoutingCard incident={incident} departments={departments} isAdmin={isAdmin} onRefresh={onRefresh} />
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Building className="w-4 h-4 text-blue-600" />
              Department Coordination
            </span>
            {incident.primary_department && (
              <span className="text-xs text-blue-600 font-medium">
                Lead: {incident.primary_department.name}
              </span>
            )}
          </div>

          {/* Existing Assignments */}
          {incident.assignments && incident.assignments.length > 0 ? (
            <div className="space-y-2">
              {incident.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-2.5 rounded-lg bg-slate-50/60 border border-slate-200 flex flex-wrap gap-2 items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-medium text-slate-700 block">
                      {assignment.department?.name || "Department"}
                    </span>
                    {assignment.notes && (
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {assignment.notes}
                      </span>
                    )}
                  </div>
                  <AssignmentStatusBadge
                    status={assignment.assignment_status}
                  />
                  <ResponseWorkReview assignment={assignment} isAdmin={isAdmin} onRefresh={onRefresh} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              No department assigned yet.
            </p>
          )}

          {canRespondToAssignment && userDeptAssignment && (
            <div className="mt-3 space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <h3 className="text-sm font-semibold text-blue-700">
                Your department response
              </h3>
              <p className="text-xs text-slate-500">
                Assignment status is separate from the overall incident status.
                Other departments may still be responding.
              </p>
              <label className="block text-xs">
                Field observations or rejection reason
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  disabled={isUpdatingStatus}
                  rows={3}
                  className="mt-1 w-full rounded border border-slate-200 bg-slate-50 p-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {userDeptAssignment.assignment_status === "pending" && (
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={handleAcknowledge}
                    className="rounded bg-primary px-3 py-2 text-xs font-semibold text-white"
                  >
                    Accept assignment
                  </button>
                )}
                {userDeptAssignment.assignment_status === "acknowledged" && (
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus("en_route")}
                    className="rounded border border-sky-200 px-3 py-2 text-xs"
                  >
                    En route
                  </button>
                )}
                {["acknowledged", "en_route"].includes(
                  userDeptAssignment.assignment_status,
                ) && (
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus("on_site")}
                    className="rounded border border-sky-200 px-3 py-2 text-xs"
                  >
                    On site
                  </button>
                )}
                {[
                  "acknowledged",
                  "en_route",
                  "on_site",
                  "in_progress",
                ].includes(userDeptAssignment.assignment_status) && (
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus("in_progress")}
                    className="rounded border border-indigo-200 px-3 py-2 text-xs"
                  >
                    {userDeptAssignment.assignment_status === "in_progress"
                      ? "Save field observation"
                      : "In progress"}
                  </button>
                )}
                {["on_site", "in_progress"].includes(
                  userDeptAssignment.assignment_status,
                ) && (
                  <button
                    type="button"
                    disabled={isUpdatingStatus || statusNote.trim().length < 10}
                    onClick={() => handleUpdateStatus("resolved")}
                    className="rounded border border-emerald-200 px-3 py-2 text-xs text-emerald-700"
                  >
                    Resolve assignment
                  </button>
                )}
                <button
                  type="button"
                  disabled={isUpdatingStatus || statusNote.trim().length < 5}
                  onClick={() => handleUpdateStatus("rejected")}
                  className="rounded border border-red-200 px-3 py-2 text-xs text-red-700"
                >
                  Reject assignment
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Completion requires notes of at least 10 characters for admin verification. A rejection requires a reason of at least 5 characters.
              </p>
              <label className="block text-xs">
                Additional field photograph
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isUpdatingStatus}
                  onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-xs"
                />
              </label>
              <button
                type="button"
                onClick={submitEvidence}
                disabled={
                  isUpdatingStatus || !evidence || statusNote.trim().length < 5
                }
                className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-50"
              >
                {isUpdatingStatus
                  ? "Saving response…"
                  : "Upload evidence with observation"}
              </button>
            </div>
          )}

          {/* Admin Assign New Department Form */}
          {isAdmin && (
            <form
              onSubmit={handleAssignDepartment}
              className="space-y-2 pt-2 border-t border-slate-200"
            >
              <label className="text-[11px] font-medium text-slate-500 block">
                Add a department assignment:
              </label>
              <div className="flex gap-2">
                <select
                  aria-label="Assign response department"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="min-w-0 flex-1 bg-white border border-slate-200 rounded text-xs text-slate-900 p-1.5"
                >
                  {departments
                    .filter((d) => d.code !== "CONTROL_ROOM")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="px-3 py-1.5 bg-primary hover:bg-primary text-white font-semibold rounded text-xs transition-colors shrink-0 flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Assign</span>
                </button>
              </div>
              <input
                type="text"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                placeholder="Optional dispatch notes or capability requirements..."
                className="w-full bg-white border border-slate-200 rounded text-xs text-slate-900 p-1.5"
              />
            </form>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <button
              type="button"
              disabled={
                isUpdatingStatus ||
                incident.status !== "resolved" ||
                !incident.assignments?.length ||
                incident.assignments.some(
                  (a) => a.assignment_status !== "rejected" && (a.assignment_status !== "resolved" || a.completion_verification !== "verified"),
                ) || incident.routing_decision?.mode === "needs_review"
              }
              onClick={closeIncident}
              className="rounded border border-emerald-200 px-3 py-2 text-xs text-emerald-700 disabled:opacity-40"
            >
              Close completed incident
            </button>
            <p className="text-xs text-slate-500">
              Closure requires admin verification of completed work and a completed routing review.
            </p>
          </div>
        )}
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${incident.latitude},${incident.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded border border-sky-200 p-3 text-center text-sm text-blue-700"
        >
          Navigate to incident
        </a>
        <p className="text-xs text-slate-500">
          External navigation may not account for disaster road closures.
        </p>
        {/* Activity Timeline */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white/60 space-y-2.5">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
            Incident Activity Log &amp; Timeline
          </span>
          {logsError && (
            <p role="alert" className="text-xs text-red-700">
              {logsError}
            </p>
          )}
          <ActivityTimeline logs={activityLogs} />
        </div>
      </div>
    </div>
  );
};
