'use client';

import React from 'react';
import { PriorityBand } from '@/types';
import { AlertTriangle, Flame, ShieldAlert, ShieldCheck } from 'lucide-react';

interface PriorityBadgeProps {
  band: PriorityBand;
  score?: number;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  band,
  score,
  showScore = true,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  };

  const config = {
    Critical: {
      bg: 'bg-red-500/15 border-red-500/40 text-red-400',
      icon: Flame,
      indicator: 'bg-red-500 animate-pulse',
    },
    High: {
      bg: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
      icon: AlertTriangle,
      indicator: 'bg-orange-500',
    },
    Medium: {
      bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
      icon: ShieldAlert,
      indicator: 'bg-amber-500',
    },
    Low: {
      bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
      icon: ShieldCheck,
      indicator: 'bg-emerald-500',
    },
  }[band] || {
    bg: 'bg-slate-500/15 border-slate-500/40 text-slate-400',
    icon: ShieldCheck,
    indicator: 'bg-slate-500',
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bg} ${sizeClasses[size]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.indicator}`} />
      <Icon className="w-3.5 h-3.5" />
      <span>{band}</span>
      {showScore && score !== undefined && (
        <span className="opacity-75 font-mono text-[11px] ml-0.5">
          ({score.toFixed(1)})
        </span>
      )}
    </span>
  );
};
