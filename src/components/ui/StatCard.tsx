'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'critical' | 'high' | 'warning' | 'primary';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
}) => {
  const variantStyles = {
    default: 'border-slate-800 text-slate-200 icon-bg:bg-slate-800/80 icon-text:text-slate-400',
    critical: 'border-red-500/30 bg-red-950/20 text-red-200 shadow-critical-glow',
    high: 'border-orange-500/30 bg-orange-950/20 text-orange-200',
    warning: 'border-amber-500/30 bg-amber-950/20 text-amber-200',
    primary: 'border-sky-500/30 bg-sky-950/20 text-sky-200 shadow-glow',
  }[variant];

  const iconColors = {
    default: 'text-slate-400 bg-slate-800/80',
    critical: 'text-red-400 bg-red-500/20',
    high: 'text-orange-400 bg-orange-500/20',
    warning: 'text-amber-400 bg-amber-500/20',
    primary: 'text-sky-400 bg-sky-500/20',
  }[variant];

  return (
    <div className={`min-w-0 p-3 sm:p-4 rounded-xl glass-panel ${variantStyles} flex items-start justify-between gap-2 transition-all`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400 tracking-wide">{title}</p>
        <p className="text-3xl font-bold font-mono tracking-tight mt-2 text-white">{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${iconColors}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};
