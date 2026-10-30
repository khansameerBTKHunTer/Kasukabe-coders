'use client';

import React, { useState } from 'react';
import { Incident, Department, Profile, Assignment } from '@/types';
import { PriorityBadge } from '../ui/PriorityBadge';
import { IncidentStatusBadge, VerificationBadge, AssignmentStatusBadge } from '../ui/StatusBadge';
import { AIAssessmentCard } from './AIAssessmentCard';
import { PriorityBreakdownCard } from './PriorityBreakdownCard';
import { ActivityTimeline } from './ActivityTimeline';
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
  Image as ImageIcon
} from 'lucide-react';

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
    incident.primary_department_id || departments[0]?.id || ''
  );
  const [assignNotes, setAssignNotes] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Status update state for department responders
  const [statusNote, setStatusNote] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Fetch real activity logs for this incident
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/incidents/${incident.id}`, { cache: 'no-store', signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.activityLogs) {
          setActivityLogs(data.activityLogs);
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.error('Failed to load activity logs', err); });
    return () => controller.abort();
  }, [incident]);

  const isAdmin = currentUser.role === 'admin';
  const isFire = currentUser.role === 'fire_rescue';
  const isElectricity = currentUser.role === 'electricity';

  // Check if current department has an assignment for this incident
  const userDeptAssignment = incident.assignments?.find(
    (a) => a.department_id === currentUser.department_id
  );

  const canRespondToAssignment =
    userDeptAssignment &&
    (userDeptAssignment.assignment_status === 'pending' ||
     userDeptAssignment.assignment_status === 'acknowledged' ||
     userDeptAssignment.assignment_status === 'in_progress');

  // Handle department assignment (Admin only)
  const handleAssignDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptId) return;

    try {
      setIsAssigning(true);
      setActionError(null);
      const res = await fetch(`/api/incidents/${incident.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: selectedDeptId,
          assignedBy: currentUser.id,
          notes: assignNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setAssignNotes('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to assign department');
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle acknowledgement (Department user)
  const handleAcknowledge = async () => {
    if (!userDeptAssignment) return;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      const res = await fetch(`/api/assignments/${userDeptAssignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'acknowledge',
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to acknowledge assignment');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle status update (Department user)
  const handleUpdateStatus = async (status: 'in_progress' | 'resolved') => {
    if (!userDeptAssignment) return;
    try {
      setIsUpdatingStatus(true);
      setActionError(null);
      const res = await fetch(`/api/assignments/${userDeptAssignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          status,
          notes: statusNote || undefined,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setStatusNote('');
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update response status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle priority override (Admin only)
  const handleOverridePriority = async (newScore: number, reason: string) => {
    const res = await fetch(`/api/incidents/${incident.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'override_priority',
        priorityScore: newScore,
        overrideReason: reason,
        userId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    onRefresh();
  };

  // Handle verification status change (Admin only)
  const handleVerify = async (status: 'verified' | 'flagged' | 'rejected') => {
    try {
      setActionError(null);
      const res = await fetch(`/api/incidents/${incident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          verificationStatus: status,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update verification status');
    }
  };

  // Primary image
  const primaryReport = incident.reports?.[0];
  const imagePath = primaryReport?.image_path || '/simulated-evidence/flood_college_road_1.svg';

  return (
    <div className="h-full min-h-0 flex flex-col glass-panel-elevated rounded-xl overflow-hidden border border-slate-700/80">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-start justify-between bg-slate-900/80">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <PriorityBadge band={incident.priority_band} score={incident.priority_score} size="md" />
            <IncidentStatusBadge status={incident.status} />
            <VerificationBadge status={incident.verification_status} />
          </div>
          <h2 className="text-base font-bold text-white leading-snug">{incident.title}</h2>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              {incident.latitude.toFixed(4)}°N, {incident.longitude.toFixed(4)}°E
            </span>
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5" />
              {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <button
          aria-label="Close incident details"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {actionError && (
        <div className="mx-4 mt-3 p-2.5 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-300">
          {actionError}
        </div>
      )}

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Evidence Imagery Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
              Photographic Evidence ({incident.reports?.length ?? 0})
            </span>
            {incident.reports && incident.reports.length > 1 && (
              <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {incident.reports.length - 1} Duplicates Merged
              </span>
            )}
          </div>

          <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black max-h-56">
            <img
              src={imagePath}
              alt="Disaster evidence"
              className="w-full h-48 object-cover"
            />
          </div>

          {/* Multiple evidence gallery thumbnails */}
          {incident.reports && incident.reports.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {incident.reports.map((rep, idx) => (
                <div
                  key={rep.id}
                  className="relative rounded border border-slate-700 overflow-hidden shrink-0 w-20 h-14 bg-slate-900"
                >
                  <img src={rep.image_path} alt={`Evidence #${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 bg-black/80 text-[9px] px-1 font-mono text-slate-300">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Incident Description &amp; Civilian Context:
          </span>
          <p className="text-xs text-slate-200 leading-relaxed">{incident.description}</p>
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
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2.5">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Human Incident Verification
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleVerify('verified')}
                disabled={incident.verification_status === 'verified'}
                className="py-1.5 px-2 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
              >
                Mark Verified
              </button>
              <button
                type="button"
                onClick={() => handleVerify('flagged')}
                disabled={incident.verification_status === 'flagged'}
                className="py-1.5 px-2 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
              >
                Flag for Triage
              </button>
              <button
                type="button"
                onClick={() => handleVerify('rejected')}
                disabled={incident.verification_status === 'rejected'}
                className="py-1.5 px-2 rounded text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-40"
              >
                Reject Report
              </button>
            </div>
          </div>
        )}

        {/* Department Assignments Status */}
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Building className="w-4 h-4 text-sky-400" />
              Department Coordination
            </span>
            {incident.primary_department && (
              <span className="text-xs text-sky-400 font-medium">
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
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-wrap gap-2 items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-medium text-slate-200 block">
                      {assignment.department?.name || 'Department'}
                    </span>
                    {assignment.notes && (
                      <span className="text-[11px] text-slate-400 block mt-0.5">{assignment.notes}</span>
                    )}
                  </div>
                  <AssignmentStatusBadge status={assignment.assignment_status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No department assigned yet.</p>
          )}

          {/* Department Responder Actions (For Assigned Department User) */}
          {canRespondToAssignment && userDeptAssignment && (
            <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-500/30 space-y-2 mt-2">
              <span className="text-xs font-semibold text-sky-300 block">
                {currentUser.display_name} — Response Operations:
              </span>

              {userDeptAssignment.assignment_status === 'pending' && (
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={isUpdatingStatus}
                  className="w-full py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs transition-colors"
                >
                  {isUpdatingStatus ? 'Acknowledging...' : 'Acknowledge Assignment Dispatch'}
                </button>
              )}

              {(userDeptAssignment.assignment_status === 'acknowledged' ||
                userDeptAssignment.assignment_status === 'in_progress') && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Add operational update note (e.g., Crew en route)..."
                    className="w-full text-xs bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus('in_progress')}
                      disabled={isUpdatingStatus}
                      className="py-1 px-2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-medium hover:bg-indigo-500/30"
                    >
                      Update Note
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus('resolved')}
                      disabled={isUpdatingStatus}
                      className="py-1 px-2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-medium hover:bg-emerald-500/30"
                    >
                      Mark Resolved
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Assign New Department Form */}
          {isAdmin && (
            <form onSubmit={handleAssignDepartment} className="space-y-2 pt-2 border-t border-slate-800">
              <label className="text-[11px] font-medium text-slate-400 block">
                Assign Department Capability:
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded text-xs text-white p-1.5"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded text-xs transition-colors shrink-0 flex items-center gap-1"
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
                className="w-full bg-slate-900 border border-slate-700 rounded text-xs text-white p-1.5"
              />
            </form>
          )}
        </div>

        {/* Activity Timeline */}
        <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2.5">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
            Incident Activity Log &amp; Timeline
          </span>
          <ActivityTimeline logs={activityLogs} />
        </div>
      </div>
    </div>
  );
};
