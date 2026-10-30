'use client';

import React, { useState, useEffect } from 'react';
import { Incident, Department, Profile } from '@/types';
import { StatCard } from '../ui/StatCard';
import { IncidentCard } from '../incident/IncidentCard';
import { IncidentDetailPanel } from '../incident/IncidentDetailPanel';
import { 
  Building2, 
  Flame, 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  RefreshCw,
  AlertTriangle 
} from 'lucide-react';
import dynamic from 'next/dynamic';

const IncidentMap = dynamic(
  () => import('../map/IncidentMap').then((mod) => mod.IncidentMap),
  { ssr: false, loading: () => <div className="w-full h-full glass-panel flex items-center justify-center text-xs text-slate-500">Loading Map...</div> }
);

interface DepartmentDashboardProps {
  currentUser: Profile;
  departmentCode: 'FIRE_RESCUE' | 'ELECTRICITY';
  departmentName: string;
  departments: Department[];
}

export const DepartmentDashboard: React.FC<DepartmentDashboardProps> = ({
  currentUser,
  departmentCode,
  departmentName,
  departments,
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchDepartmentIncidents = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await fetch(`/api/incidents?departmentId=${currentUser.department_id || ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error('Unable to load department incidents.');
      if (data.success) {
        // Filter strictly to incidents assigned to this department
        const assignedToThisDept = data.incidents.filter((inc: Incident) =>
          inc.primary_department_id === currentUser.department_id ||
          inc.assignments?.some((a) => a.department_id === currentUser.department_id)
        );
        setIncidents(assignedToThisDept);

        setSelectedIncident(current => current ? assignedToThisDept.find((i: Incident) => i.id === current.id) ?? null : null);
      }
    } catch (err) {
      console.error('Failed to load department incidents', err);
      setLoadError('Unable to load department incidents. Use Refresh to retry.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartmentIncidents();
  }, [currentUser.department_id]);

  // Statistics for this department
  const totalAssigned = incidents.length;
  const criticalCount = incidents.filter((i) => i.priority_band === 'Critical').length;
  const pendingAckCount = incidents.filter((i) =>
    i.assignments?.some(
      (a) => a.department_id === currentUser.department_id && a.assignment_status === 'pending'
    )
  ).length;
  const activeCount = incidents.filter((i) =>
    i.assignments?.some(
      (a) =>
        a.department_id === currentUser.department_id &&
        (a.assignment_status === 'acknowledged' || a.assignment_status === 'in_progress')
    )
  ).length;

  return (
    <div className="space-y-4">
      {loadError && <p role="alert" className="p-3 text-sm text-red-300">{loadError}</p>}
      {/* Department Header Banner */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white flex flex-wrap items-center gap-2">
              <span>{departmentName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 font-mono border border-sky-800">
                Authorized Responder Portal
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Logged in as <span className="text-slate-200 font-medium">{currentUser.display_name}</span>. Field assignment response and status tracking.
            </p>
          </div>
        </div>

        <button
          onClick={fetchDepartmentIncidents}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Assigned Incidents"
          value={totalAssigned}
          subtitle="Department Queue"
          icon={Building2}
          variant="default"
        />
        <StatCard
          title="Critical Incidents"
          value={criticalCount}
          subtitle="Priority 80-100"
          icon={Flame}
          variant="critical"
        />
        <StatCard
          title="Pending Acknowledgement"
          value={pendingAckCount}
          subtitle="Immediate Action Needed"
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Active Operations"
          value={activeCount}
          subtitle="In Progress"
          icon={PlayCircle}
          variant="primary"
        />
      </div>

      {/* Department Grid: Map + Assigned Queue */}
      <div className="operations-grid">
        {/* Map view restricted to this department's incidents */}
        <div className="operations-map min-w-0">
          <IncidentMap
            incidents={incidents}
            selectedIncidentId={selectedIncident?.id}
            onSelectIncident={(inc) => setSelectedIncident(inc)}
          />
        </div>

        {/* Right Column: Assigned Queue or Incident Detail Panel */}
        <div className="operations-sidebar min-w-0 min-h-0 flex flex-col">
          {selectedIncident ? (
            <IncidentDetailPanel
              key={selectedIncident.id}
              incident={selectedIncident}
              departments={departments}
              currentUser={currentUser}
              onClose={() => setSelectedIncident(null)}
              onRefresh={fetchDepartmentIncidents}
            />
          ) : (
            <div className="h-full flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800">
              <div className="p-3.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wider uppercase">
                    Department Assignment Queue ({incidents.length})
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Incidents dispatched to {departmentName}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {incidents.length > 0 ? (
                  incidents.map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      isSelected={false}
                      onSelect={(inc) => setSelectedIncident(inc)}
                    />
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No active incidents currently assigned to {departmentName}.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
