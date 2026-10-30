'use client';

import React from 'react';
import { ActivityLog } from '@/types';
import { 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  Send, 
  Sliders, 
  Layers, 
  Clock,
  ShieldCheck 
} from 'lucide-react';

interface ActivityTimelineProps {
  logs: ActivityLog[];
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ logs }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-white/30 text-xs text-slate-500 text-center">
        No recorded response activity yet for this incident.
      </div>
    );
  }

  const getActionConfig = (action: string) => {
    switch (action) {
      case 'report_created':
        return { label: 'Report Submitted', icon: FileText, color: 'text-blue-600 bg-sky-500/20' };
      case 'ai_assessed':
        return { label: 'AI Assessment Run', icon: Sparkles, color: 'text-purple-400 bg-purple-500/20' };
      case 'verification_updated':
        return { label: 'Verification Updated', icon: ShieldCheck, color: 'text-emerald-700 bg-emerald-500/20' };
      case 'department_assigned':
        return { label: 'Department Assigned', icon: Send, color: 'text-amber-700 bg-amber-500/20' };
      case 'assignment_acknowledged':
        return { label: 'Assignment Acknowledged', icon: CheckCircle2, color: 'text-blue-600 bg-sky-500/20' };
      case 'status_updated':
        return { label: 'Response Status Updated', icon: Clock, color: 'text-indigo-700 bg-indigo-500/20' };
      case 'incident_resolved':
        return { label: 'Incident Resolved', icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-500/20' };
      case 'priority_override':
        return { label: 'Priority Override', icon: Sliders, color: 'text-red-700 bg-red-500/20' };
      case 'duplicate_confirmed':
        return { label: 'Duplicate Report Merged', icon: Layers, color: 'text-blue-700 bg-blue-500/20' };
      case 'duplicate_rejected':
        return { label: 'Kept As Distinct Incident', icon: Layers, color: 'text-slate-500 bg-slate-500/20' };
      default:
        return { label: action.replace(/_/g, ' '), icon: Clock, color: 'text-slate-500 bg-slate-500/20' };
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative pl-6 border-l border-slate-200 space-y-4">
        {logs.map((log) => {
          const config = getActionConfig(log.action);
          const Icon = config.icon;
          const formattedDate = new Date(log.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div key={log.id} className="relative group">
              {/* Icon Marker */}
              <div
                className={`absolute -left-[31px] top-0 p-1.5 rounded-full ${config.color} border border-slate-900 shadow-sm`}
              >
                <Icon className="w-3 h-3" />
              </div>

              {/* Event Content */}
              <div className="p-2.5 rounded-lg bg-white/60 border border-slate-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    {config.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {formattedDate}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-xs text-slate-700">
                    {log.reason}
                  </p>
                )}

                {log.new_value && typeof log.new_value === 'object' && (
                  <div className="text-[10px] font-mono text-slate-500 bg-slate-50/40 p-1 rounded border border-slate-200/60 overflow-x-auto">
                    {JSON.stringify(log.new_value)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
