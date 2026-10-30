'use client';

import React, { useState } from 'react';
import { Incident, Report, DuplicateMatch } from '@/types';
import { Layers, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { PriorityBadge } from '../ui/PriorityBadge';

interface DuplicateReviewPanelProps {
  report: Report;
  candidates: DuplicateMatch[];
  onConfirmDuplicate: (reportId: string, targetIncidentId: string) => Promise<void>;
  onKeepSeparate: (reportId: string) => Promise<void>;
  onClose?: () => void;
}

export const DuplicateReviewPanel: React.FC<DuplicateReviewPanelProps> = ({
  report,
  candidates,
  onConfirmDuplicate,
  onKeepSeparate,
  onClose,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (targetIncidentId: string) => {
    try {
      setLoadingId(targetIncidentId);
      setError(null);
      await onConfirmDuplicate(report.id, targetIncidentId);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to confirm duplicate');
    } finally {
      setLoadingId(null);
    }
  };

  const handleKeepSeparate = async () => {
    try {
      setLoadingId('keep-separate');
      setError(null);
      await onKeepSeparate(report.id);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to keep separate');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-sky-500/30 bg-slate-900/90 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              Potential Duplicate Incident Detected
            </h3>
            <p className="text-xs text-slate-400">
              New report #{report.id.slice(0, 8)} is within 150m of existing incidents.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-red-950/40 border border-red-500/40 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Comparison: Incoming Report */}
      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-sky-400 uppercase tracking-wider">
            Incoming Report Evidence
          </span>
          <span className="text-slate-400 font-mono">
            {report.incident_latitude.toFixed(4)}°N, {report.incident_longitude.toFixed(4)}°E
          </span>
        </div>

        <div className="flex gap-3 items-center">
          <img
            src={report.image_path}
            alt="Incoming evidence"
            className="w-24 h-16 object-cover rounded border border-slate-700 bg-black shrink-0"
          />
          <div className="text-xs text-slate-300 line-clamp-2">
            {report.description}
          </div>
        </div>
      </div>

      {/* Candidate Matches */}
      <div className="space-y-3">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Existing Incident Matches ({candidates.length}):
        </span>

        {candidates.map((match) => {
          const inc = match.incident;
          const isProcessing = loadingId === inc.id;

          return (
            <div
              key={inc.id}
              className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 space-y-3 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <PriorityBadge band={inc.priority_band} score={inc.priority_score} size="sm" />
                    <span className="text-xs font-mono text-slate-400">
                      #{inc.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-amber-400 font-medium">
                      ({match.distanceMeters}m away)
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-white">{inc.title}</h4>
                </div>

                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    match.duplicateConfidence === 'high'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {match.duplicateConfidence.toUpperCase()} CONFIDENCE
                </span>
              </div>

              {/* Rationale factors */}
              <div className="text-[11px] space-y-1 text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800/80">
                {match.reasons.map((r, i) => (
                  <p key={i} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-sky-400" />
                    <span>{r}</span>
                  </p>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => handleConfirm(inc.id)}
                  disabled={isProcessing || loadingId !== null}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Merging...' : 'Confirm Duplicate (Merge Evidence)'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Keep Separate Button */}
      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
        <span className="text-xs text-slate-400">
          If this report represents a different hazard at this location:
        </span>
        <button
          type="button"
          onClick={handleKeepSeparate}
          disabled={loadingId !== null}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>Keep Separate (Distinct Hazard)</span>
        </button>
      </div>
    </div>
  );
};
