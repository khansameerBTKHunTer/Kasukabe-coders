"use client";

import React, { useState, useEffect } from "react";
import { Incident, Department, Profile, DuplicateMatch, Report } from "@/types";
import { StatCard } from "../ui/StatCard";
import { IncidentCard } from "../incident/IncidentCard";
import { IncidentDetailPanel } from "../incident/IncidentDetailPanel";
import { DuplicateReviewPanel } from "../incident/DuplicateReviewPanel";
import {
  AlertTriangle,
  Flame,
  Clock,
  PlayCircle,
  ListFilter,
  Layers,
  ShieldAlert,
  RefreshCw,
  Search,
  Activity,
  Download,
} from "lucide-react";
import dynamic from "next/dynamic";
import { findDuplicateCandidates } from "@/lib/duplicate-detector";

// Dynamically import Leaflet IncidentMap with ssr: false
const IncidentMap = dynamic(
  () => import("../map/IncidentMap").then((mod) => mod.IncidentMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full glass-panel flex items-center justify-center text-xs text-slate-500">
        Loading Map Engine...
      </div>
    ),
  },
);

interface ControlRoomProps {
  currentUser: Profile;
  departments: Department[];
}

export const ControlRoomDashboard: React.FC<ControlRoomProps> = ({
  currentUser,
  departments,
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportSitRep = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/reports/sitrep", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Unable to generate situation report. Please retry.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "CIVISCOPE-SitRep.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Allow the browser to start consuming the blob before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Unable to download situation report.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Duplicate review modal state
  const [activeDuplicateReport, setActiveDuplicateReport] =
    useState<Report | null>(null);
  const [activeDuplicateMatches, setActiveDuplicateMatches] = useState<
    DuplicateMatch[]
  >([]);

  const dialogRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeDuplicateReport) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDuplicateReport(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const buttons = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], select, input, textarea",
        ),
      ).filter((element) => element.offsetParent !== null);
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialog)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [activeDuplicateReport]);

  const fetchIncidentsAndStats = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const incRes = await fetch("/api/incidents", { cache: "no-store" });
      const incData = await incRes.json();
      if (!incRes.ok || !incData.success || !Array.isArray(incData.incidents))
        throw new Error(incData.error || "Unable to load current incidents.");
      setIncidents(incData.incidents);
      const [statRes] = await Promise.all([
        fetch("/api/statistics", { cache: "no-store" }),
      ]);

      const statData = await statRes.json();
      if (!incRes.ok || !statRes.ok || !incData.success || !statData.success) {
        throw new Error(
          "Unable to load current incidents. Use Refresh to retry.",
        );
      }

      if (incData.success) {
        setIncidents(incData.incidents);
        // If an incident was selected, update its reference
        setSelectedIncident((current) =>
          current
            ? (incData.incidents.find((i: Incident) => i.id === current.id) ??
              null)
            : null,
        );
      }

      if (statData.success) {
        setStats(statData.stats);
      }
    } catch (err) {
      console.error("Failed to load control room data", err);
      setLoadError("Unable to load current incidents. Use Refresh to retry.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidentsAndStats();
  }, []);

  // Filter incidents
  const filteredIncidents = incidents.filter((incident) => {
    if (severityFilter !== "all" && incident.severity !== severityFilter)
      return false;
    if (categoryFilter !== "all" && incident.category !== categoryFilter)
      return false;
    if (
      priorityFilter !== "all" &&
      incident.priority_band.toLowerCase() !== priorityFilter.toLowerCase()
    )
      return false;
    if (statusFilter !== "all" && incident.status !== statusFilter)
      return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = incident.title.toLowerCase().includes(q);
      const matchDesc = incident.description.toLowerCase().includes(q);
      const matchId = incident.id.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchId) return false;
    }
    return true;
  });

  // Handle duplicate actions
  const handleConfirmDuplicate = async (
    reportId: string,
    targetIncidentId: string,
  ) => {
    const res = await fetch("/api/incidents/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        reportId,
        targetIncidentId,
        actorId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    setActiveDuplicateReport(null);
    fetchIncidentsAndStats();
  };

  const handleKeepSeparate = async (reportId: string) => {
    const res = await fetch("/api/incidents/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reject",
        reportId,
        actorId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    setActiveDuplicateReport(null);
    fetchIncidentsAndStats();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-600">
            Lakshmipur District
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Control room
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Assess incidents, coordinate teams, and track the response.
          </p>
        </div>
      </div>
      {loadError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {loadError}
        </p>
      )}
      {/* 1. KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard
          title="Total Incidents"
          value={stats?.total ?? "—"}
          subtitle="Lakshmipur Zone"
          icon={Activity}
          variant="default"
        />
        <StatCard
          title="Critical Priority"
          value={stats?.critical ?? "—"}
          subtitle="Score 80-100"
          icon={Flame}
          variant="critical"
        />
        <StatCard
          title="High Priority"
          value={stats?.high ?? "—"}
          subtitle="Score 60-79.9"
          icon={AlertTriangle}
          variant="high"
        />
        <StatCard
          title="Awaiting Assignment"
          value={stats?.awaitingAssignment ?? "—"}
          subtitle="Open for dispatch"
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Active Responses"
          value={stats?.activeResponses ?? "—"}
          subtitle="In-field operations"
          icon={PlayCircle}
          variant="primary"
        />
      </div>

      {/* Duplicate Review Modal Overlay */}
      {activeDuplicateReport && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Duplicate report review"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-h-[85vh] max-w-2xl w-full overflow-y-auto">
            <DuplicateReviewPanel
              report={activeDuplicateReport}
              candidates={activeDuplicateMatches}
              onConfirmDuplicate={handleConfirmDuplicate}
              onKeepSeparate={handleKeepSeparate}
              onClose={() => setActiveDuplicateReport(null)}
            />
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="glass-panel p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search incidents, IDs, keywords..."
              aria-label="Search incidents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-400"
            />
          </div>

          {/* Category Filter */}
          <select
            aria-label="Category filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-slate-200/80 text-xs text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="flood">Flood</option>
            <option value="electrical_hazard">Electrical Hazard</option>
            <option value="building_damage">Building Damage</option>
            <option value="fire">Fire</option>
            <option value="road_blockage">Road Blockage</option>
            <option value="medical_emergency">Medical Emergency</option>
            <option value="landslide">Landslide</option>
            <option value="other">Other</option>
          </select>

          <select
            aria-label="Severity filter"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All severities</option>
            {["critical", "high", "medium", "low"].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          {/* Priority Filter */}
          <select
            aria-label="Priority filter"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-white border border-slate-200/80 text-xs text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical (80-100)</option>
            <option value="high">High (60-79.9)</option>
            <option value="medium">Medium (35-59.9)</option>
            <option value="low">Low (0-34.9)</option>
          </select>

          {/* Status Filter */}
          <select
            aria-label="Status filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200/80 text-xs text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Awaiting Assignment</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <button
          onClick={exportSitRep}
          disabled={isExporting}
          aria-busy={isExporting}
          title="Download a situation report covering all incidents, independent of queue filters"
          className="inline-flex items-center gap-1.5 text-xs text-blue-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? "Generating PDF..." : "Export SitRep PDF"}</span>
        </button>

        <button
          onClick={fetchIncidentsAndStats}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {exportError && (
        <p role="alert" className="text-xs text-red-700">
          {exportError}
        </p>
      )}

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm text-blue-700">
          Review nearby reports for duplicates
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {incidents.flatMap((incident) =>
            (incident.reports ?? []).map((report) => {
              const candidates = findDuplicateCandidates(
                { ...report, category: incident.category },
                incidents.filter((other) => other.id !== incident.id),
              );
              return (
                <button
                  key={report.id}
                  type="button"
                  disabled={!candidates.length}
                  onClick={() => {
                    setActiveDuplicateReport(report);
                    setActiveDuplicateMatches(candidates);
                  }}
                  className="rounded border border-slate-200 p-2 text-left text-xs disabled:opacity-40"
                >
                  Report #{report.id.slice(0, 8)} · {candidates.length} nearby
                  candidate(s)
                </button>
              );
            }),
          )}
        </div>
      </details>

      {/* Main Command Center Grid: Map (Center-Left) + Ranked Queue & Detail Drawer (Right) */}
      <div className="operations-grid">
        {/* Interactive Leaflet Map */}
        <div className="operations-map min-w-0">
          <IncidentMap
            incidents={filteredIncidents}
            selectedIncidentId={selectedIncident?.id}
            onSelectIncident={(incident) => setSelectedIncident(incident)}
          />
        </div>

        {/* Right Column: Ranked Queue OR Incident Detail Drawer */}
        <div className="operations-sidebar min-w-0 min-h-0 flex flex-col">
          {selectedIncident ? (
            <IncidentDetailPanel
              key={selectedIncident.id}
              incident={selectedIncident}
              departments={departments}
              currentUser={currentUser}
              onClose={() => setSelectedIncident(null)}
              onRefresh={fetchIncidentsAndStats}
            />
          ) : (
            <div className="h-full flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-200">
              {/* Header */}
              <div className="p-3.5 border-b border-slate-200 bg-white/80 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 tracking-wider uppercase flex items-center gap-1.5">
                    <ListFilter className="w-3.5 h-3.5 text-blue-600" />
                    Ranked Incident Queue ({filteredIncidents.length})
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Ordered by deterministic priority score descending
                  </p>
                </div>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {filteredIncidents.length > 0 ? (
                  filteredIncidents.map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      isSelected={false}
                      onSelect={(inc) => setSelectedIncident(inc)}
                    />
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {isLoading
                      ? "Loading incidents..."
                      : "No incidents match the active filter criteria."}
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
