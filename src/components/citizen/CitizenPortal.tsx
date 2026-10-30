'use client';

import React, { useState, useEffect } from 'react';
import { ReportForm } from './ReportForm';
import { Report, Profile } from '@/types';
import { 
  FileText, 
  PlusCircle, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  ShieldCheck,
  RefreshCw 
} from 'lucide-react';
import { VerificationBadge } from '../ui/StatusBadge';

export const CitizenPortal: React.FC<{ currentUser: Profile }> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'report' | 'my_reports'>('report');
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/incidents');
      const data = await res.json();
      if (data.success) {
        // Collect citizen reports
        const allReports: Report[] = [];
        data.incidents.forEach((inc: any) => {
          if (inc.reports) {
            allReports.push(...inc.reports);
          }
        });
        setReports(allReports.filter(report => report.reporter_id === currentUser.id));
      }
    } catch (err) {
      console.error('Failed to load reports', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'report'
                ? 'bg-sky-500 text-slate-950 shadow-glow'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Submit Emergency Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('my_reports');
              fetchReports();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeTab === 'my_reports'
                ? 'bg-sky-500 text-slate-950 shadow-glow'
                : 'text-slate-400 hover:text-white bg-slate-900/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Track Submitted Reports ({reports.length})</span>
          </button>
        </div>

        {activeTab === 'my_reports' && (
          <button
            onClick={fetchReports}
            disabled={isLoading}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 p-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        )}
      </div>

      {/* Main View */}
      {activeTab === 'report' ? (
        <ReportForm onSuccess={() => fetchReports()} />
      ) : (
        <div className="space-y-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-1">
            <h3 className="text-sm font-bold text-white">Disaster Report Tracking</h3>
            <p className="text-xs text-slate-400">
              Live status updates on your field submissions as control room personnel triage, verify, and dispatch responders.
            </p>
          </div>

          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="p-4 rounded-xl glass-card border border-slate-800 flex flex-col md:flex-row gap-4 items-start"
              >
                <img
                  src={report.image_path}
                  alt="Report evidence"
                  className="w-full md:w-36 h-28 object-cover rounded-lg border border-slate-700 bg-black shrink-0"
                />

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold text-sky-400">
                      Report #{report.id.slice(0, 12)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </span>
                      <VerificationBadge status={report.verification_status} />
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 line-clamp-2">
                    {report.description}
                  </p>

                  <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-300">
                    <span className="font-semibold text-slate-400">Assistance Requested: </span>
                    {report.assistance_needed}
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span className="flex items-center gap-1 font-mono">
                      <MapPin className="w-3 h-3 text-sky-400" />
                      {report.incident_latitude.toFixed(4)}°N, {report.incident_longitude.toFixed(4)}°E
                    </span>

                    <span className="text-slate-400 capitalize">
                      Source: {report.source_type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {reports.length === 0 && (
              <div className="p-12 text-center text-xs text-slate-500 glass-panel rounded-xl">
                No submitted disaster reports found. Use the &quot;Submit Emergency Report&quot; tab to report a localized hazard.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
