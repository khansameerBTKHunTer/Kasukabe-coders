'use client';

import React from 'react';
import { AIAssessment } from '@/types';
import { Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

interface AIAssessmentCardProps {
  assessment: AIAssessment | null;
  confidence: number;
}

export const AIAssessmentCard: React.FC<AIAssessmentCardProps> = ({
  assessment,
  confidence,
}) => {
  if (!assessment) {
    return (
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-slate-400 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-slate-500" />
          <span>No automated AI assessment generated yet. Pending manual control room review.</span>
        </div>
      </div>
    );
  }

  const confidencePct = Math.round((assessment.confidence || confidence) * 100);

  return (
    <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-950/10 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5">
        <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs tracking-wider uppercase">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span>AI Vision Assessment (Provisional Decision Support)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">Confidence:</span>
          <span className={`font-mono font-bold ${confidencePct >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {confidencePct}%
          </span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
        {assessment.summary}
      </p>

      {/* Damage & Hazards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Visible Damage */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
            Directly Visible Damage:
          </span>
          {assessment.visible_damage && assessment.visible_damage.length > 0 ? (
            <ul className="space-y-1">
              {assessment.visible_damage.map((item, idx) => (
                <li key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
                  <span>{item.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-slate-500 italic">None specifically flagged</span>
          )}
        </div>

        {/* Inferred Secondary Hazards */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Potential Secondary Hazards:
          </span>
          {assessment.secondary_hazards && assessment.secondary_hazards.length > 0 ? (
            <ul className="space-y-1">
              {assessment.secondary_hazards.map((item, idx) => (
                <li key={idx} className="text-xs text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <span>{item.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-slate-500 italic">No secondary cascading risks detected</span>
          )}
        </div>
      </div>

      {/* Life Risk & Critical Infrastructure */}
      {(assessment.life_risk_indicators?.length > 0 || assessment.critical_infrastructure_indicators?.length > 0) && (
        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
          {assessment.life_risk_indicators?.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-950/20 p-2 rounded border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-red-200">Life Threat Flags: </span>
                <span>{assessment.life_risk_indicators.join('; ')}</span>
              </div>
            </div>
          )}

          {assessment.critical_infrastructure_indicators?.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/20 p-2 rounded border border-amber-500/20">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-200">Critical Infrastructure Impact: </span>
                <span>{assessment.critical_infrastructure_indicators.join('; ')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Uncertainties Disclaimer */}
      {assessment.uncertainties && assessment.uncertainties.length > 0 && (
        <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800 flex items-start gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-300">Uncertainties: </span>
            <span>{assessment.uncertainties.join(', ')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
