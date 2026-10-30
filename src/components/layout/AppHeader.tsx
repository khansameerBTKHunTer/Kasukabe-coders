'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { UserRole } from '@/types';
import { 
  Radio, 
  RotateCcw, 
  User, 
  Shield, 
  Flame, 
  Zap, 
  Users,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export const AppHeader: React.FC = () => {
  const { currentProfile, setRole, availableProfiles } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleResetSeed = async () => {
    if (confirm('Reset scenario to standard Lakshmipur demo state (6 reports, 4 distinct incidents)?')) {
      try {
        setIsResetting(true);
        const res = await fetch('/api/seed/reset', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Unable to reset scenario');
        setResetMessage(data.message || 'Scenario reset.');
        setTimeout(() => {
          setResetMessage(null);
          window.location.reload();
        }, 1200);
      } catch (err: any) {
        alert('Reset failed: ' + err.message);
      } finally {
        setIsResetting(false);
      }
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <Shield className="w-3.5 h-3.5 text-sky-400" />;
      case 'fire_rescue':
        return <Flame className="w-3.5 h-3.5 text-red-400" />;
      case 'electricity':
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case 'citizen':
        return <Users className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800 backdrop-blur-md px-3 sm:px-5 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      {/* Brand Identity */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 font-bold font-mono tracking-tighter group-hover:scale-105 transition-transform shadow-glow">
            CS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-sm">CIVISCOPE</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800">
                Damage Mapper
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5 hidden sm:block">
              AI-Powered Disaster Response Decision Support
            </p>
          </div>
        </Link>

        {/* Live district indicator */}
        <div className="hidden xl:flex items-center gap-2 pl-3 border-l border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-slate-300 font-medium">
            Active Grid: Lakshmipur District
          </span>
        </div>
      </div>

      {/* Right Controls: Role Switcher & Scenario Reset */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {resetMessage && (
          <span className="text-xs text-emerald-400 bg-emerald-950/50 px-2 py-1 rounded border border-emerald-500/40 flex items-center gap-1 animate-pulse">
            <CheckCircle className="w-3 h-3" />
            {resetMessage}
          </span>
        )}

        {/* Reset Demo State Button */}
        <button
          type="button"
          onClick={handleResetSeed}
          disabled={isResetting}
          title="Reset simulated reports and incidents back to initial Lakshmipur scenario"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          <span>Reset Scenario</span>
        </button>

        {/* Role Selector Pill */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
          <div className="pl-1.5 flex items-center gap-1 text-[11px] text-slate-400 font-medium">
            {getRoleIcon(currentProfile.role)}
            <span className="hidden lg:inline">Active Role:</span>
          </div>
          <select
            aria-label="Active role"
            value={currentProfile.role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="bg-slate-950 text-xs font-semibold text-slate-200 border-none rounded px-2 py-1 focus:outline-none cursor-pointer"
          >
            <option value="admin">Control Room Admin</option>
            <option value="fire_rescue">Fire &amp; Rescue</option>
            <option value="electricity">Electricity Dept</option>
            <option value="citizen">Citizen Portal</option>
          </select>
        </div>
      </div>
    </header>
  );
};
