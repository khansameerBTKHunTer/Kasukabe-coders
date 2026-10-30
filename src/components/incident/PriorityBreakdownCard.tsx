'use client';

import React, { useState } from 'react';
import { PriorityBand } from '@/types';
import { PriorityBadge } from '../ui/PriorityBadge';
import { Sliders, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface PriorityBreakdownCardProps {
  score: number;
  band: PriorityBand;
  reasons: string[];
  reviewRequired: boolean;
  canOverride?: boolean;
  onOverride?: (newScore: number, reason: string) => Promise<void>;
}

export const PriorityBreakdownCard: React.FC<PriorityBreakdownCardProps> = ({
  score,
  band,
  reasons,
  reviewRequired,
  canOverride = false,
  onOverride,
}) => {
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideScore, setOverrideScore] = useState<number>(score);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason || overrideReason.trim().length < 5) {
      setOverrideError('Mandatory override explanation required (min 5 characters).');
      return;
    }
    if (!onOverride) return;

    try {
      setIsSubmitting(true);
      setOverrideError(null);
      await onOverride(overrideScore, overrideReason);
      setShowOverrideForm(false);
      setOverrideReason('');
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to apply priority override');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap gap-2 items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold text-slate-200 tracking-wider uppercase">
            Deterministic Priority Engine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge band={band} score={score} size="md" />
        </div>
      </div>

      {/* Review required badge */}
      {reviewRequired && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/25 border border-red-500/30 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-medium">
            Urgent Human Verification Required: Critical life risk or high uncertainty flagged.
          </span>
        </div>
      )}

      {/* Factor Reasons Breakdown */}
      <div className="space-y-1.5 pt-1">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
          Score Breakdown &amp; Factors (100% Weight Matrix):
        </span>
        <ul className="space-y-1.5">
          {reasons.map((reason, idx) => (
            <li
              key={idx}
              className="text-xs text-slate-300 bg-slate-950/40 px-2.5 py-1.5 rounded border border-slate-800/80 flex items-start gap-2"
            >
              <Info className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-slate-500 italic pt-1">
        Deterministic decision-support score. Not an official emergency severity rating.
      </p>

      {/* Administrator Override Section */}
      {canOverride && (
        <div className="pt-2 border-t border-slate-800">
          {!showOverrideForm ? (
            <button
              type="button"
              onClick={() => {
                setOverrideScore(score);
                setShowOverrideForm(true);
              }}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Control Room Priority Override</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          ) : (
            <form onSubmit={handleApplyOverride} className="p-3 bg-slate-950/60 rounded-lg border border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Control Room Priority Override
                </span>
                <button
                  type="button"
                  onClick={() => setShowOverrideForm(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  Cancel
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>New Priority Score:</span>
                  <span className="font-mono font-bold text-sky-400">{overrideScore} / 100</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(Number(e.target.value))}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">
                  Mandatory Override Reason:
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="State operational justification (e.g., eyewitness field confirmation of trapped residents)..."
                  className="w-full text-xs bg-slate-900 border border-slate-700 rounded p-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  rows={2}
                  required
                />
              </div>

              {overrideError && (
                <p className="text-xs text-red-400">{overrideError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold rounded transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Recording Override...' : 'Confirm Priority Override'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
