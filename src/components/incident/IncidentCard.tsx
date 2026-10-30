'use client';

import React from 'react';
import { Incident } from '@/types';
import { PriorityBadge } from '../ui/PriorityBadge';
import { IncidentStatusBadge, VerificationBadge } from '../ui/StatusBadge';
import { MapPin, Clock, Layers, Sparkles, Building2 } from 'lucide-react';

interface IncidentCardProps {
  incident: Incident;
  isSelected: boolean;
  onSelect: (incident: Incident) => void;
}

export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      aria-label={`Open incident: ${incident.title}`}
      onClick={() => onSelect(incident)}
      className={`w-full text-left p-4 rounded-xl cursor-pointer transition-all border ${
        isSelected
          ? 'glass-panel-elevated border-sky-400/80 shadow-glow'
          : 'glass-card hover:border-slate-200'
      }`}
    >
      {/* Top row: Priority & Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <PriorityBadge
          band={incident.priority_band}
          score={incident.priority_score}
          size="sm"
        />
        <div className="flex items-center gap-1.5">
          <VerificationBadge status={incident.verification_status} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </div>

      {/* Title & Category */}
      <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 mb-1">
        {incident.title}
      </h3>

      {/* Description Snippet */}
      <p className="text-xs text-slate-500 line-clamp-2 mb-2.5">
        {incident.description}
      </p>

      {/* Footer Info Row */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200/80 gap-1.5">
        <span className="flex items-center gap-1 font-mono">
          <MapPin className="w-3 h-3 text-blue-600" />
          {incident.latitude.toFixed(3)}°, {incident.longitude.toFixed(3)}°
        </span>

        {incident.primary_department && (
          <span className="flex items-center gap-1 text-slate-700">
            <Building2 className="w-3 h-3 text-amber-700" />
            {incident.primary_department.name}
          </span>
        )}

        <div className="flex items-center gap-2">
          {incident.evidence_count && incident.evidence_count > 1 ? (
            <span className="flex items-center gap-1 text-blue-700">
              <Layers className="w-3 h-3" />
              {incident.evidence_count} photos
            </span>
          ) : null}

          {incident.ai_confidence > 0 && (
            <span className="flex items-center gap-1 text-blue-600 font-mono">
              <Sparkles className="w-3 h-3" />
              {Math.round(incident.ai_confidence * 100)}%
            </span>
          )}

          <span className="flex items-center gap-1 font-mono text-slate-500">
            <Clock className="w-3 h-3" />
            {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </button>
  );
};
