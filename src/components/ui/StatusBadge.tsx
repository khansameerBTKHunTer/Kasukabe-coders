'use client';

import React from 'react';
import { IncidentStatus, AssignmentStatus, VerificationStatus } from '@/types';
import { CheckCircle2, Clock, PlayCircle, XCircle, AlertCircle, ShieldAlert } from 'lucide-react';

export const IncidentStatusBadge: React.FC<{ status: IncidentStatus }> = ({ status }) => {
  const config = {
    open: { label: 'Awaiting Triage', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: Clock },
    assigned: { label: 'Assigned', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30', icon: PlayCircle },
    in_progress: { label: 'Responding', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30', icon: PlayCircle },
    resolved: { label: 'Resolved', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 },
    closed: { label: 'Closed', color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', icon: CheckCircle2 },
  }[status] || { label: status, color: 'bg-slate-500/10 text-slate-400 border-slate-500/30', icon: Clock };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export const AssignmentStatusBadge: React.FC<{ status: AssignmentStatus }> = ({ status }) => {
  const config = {
    pending: { label: 'Pending Ack', color: 'bg-amber-500/15 text-amber-400 border-amber-500/40', icon: Clock },
    acknowledged: { label: 'Acknowledged', color: 'bg-sky-500/15 text-sky-400 border-sky-500/40', icon: CheckCircle2 },
    in_progress: { label: 'In Progress', color: 'bg-blue-500/15 text-blue-400 border-blue-500/40', icon: PlayCircle },
    resolved: { label: 'Resolved', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', icon: CheckCircle2 },
    rejected: { label: 'Rejected', color: 'bg-red-500/15 text-red-400 border-red-500/40', icon: XCircle },
  }[status] || { label: status, color: 'bg-slate-500/15 text-slate-400 border-slate-500/40', icon: Clock };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

export const VerificationBadge: React.FC<{ status: VerificationStatus }> = ({ status }) => {
  const config = {
    verified: { label: 'Verified Incident', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', icon: CheckCircle2 },
    unverified: { label: 'Unverified Report', color: 'bg-amber-500/15 text-amber-400 border-amber-500/40', icon: AlertCircle },
    flagged: { label: 'Flagged for Review', color: 'bg-red-500/15 text-red-400 border-red-500/40', icon: ShieldAlert },
    rejected: { label: 'Rejected', color: 'bg-slate-500/15 text-slate-400 border-slate-500/40', icon: XCircle },
  }[status] || { label: status, color: 'bg-slate-500/15 text-slate-400 border-slate-500/40', icon: AlertCircle };

  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};
