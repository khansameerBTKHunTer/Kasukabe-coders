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
    default: 'border-slate-200 text-slate-700 icon-bg:bg-slate-100/80 icon-text:text-slate-500',
    critical: 'border-red-200 bg-red-50 text-red-700 shadow-critical-glow',
    high: 'border-orange-200 bg-orange-50 text-orange-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    primary: 'border-sky-200 bg-sky-50 text-blue-700 shadow-glow',
  }[variant];

  const iconColors = {
    default: 'text-slate-500 bg-slate-100/80',
    critical: 'text-red-700 bg-red-500/20',
    high: 'text-orange-700 bg-orange-500/20',
    warning: 'text-amber-700 bg-amber-500/20',
    primary: 'text-blue-600 bg-sky-500/20',
  }[variant];

  return (
    <div className={`min-w-0 p-3 sm:p-4 rounded-xl glass-panel ${variantStyles} flex items-start justify-between gap-2 transition-all`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 tracking-wide">{title}</p>
        <p className="text-3xl font-bold font-mono tracking-tight mt-2 text-slate-900">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${iconColors}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};
