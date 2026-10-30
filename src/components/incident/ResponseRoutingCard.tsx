"use client";
import { useState } from "react";
import type { Department, Incident } from "@/types";

export function ResponseRoutingCard({ incident, departments, isAdmin, onRefresh }: { incident: Incident; departments: Department[]; isAdmin: boolean; onRefresh: () => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const routing = incident.routing_decision;
  const needsReview = routing?.mode === "needs_review";
  async function completeReview() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/incidents/${incident.id}/routing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Routing review failed.");
      setNotes(""); onRefresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Routing review failed."); }
    finally { setBusy(false); }
  }
  return <section className={`space-y-2 rounded-xl border p-3 ${needsReview ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50"}`} aria-label="Response routing">
    <h3 className="text-sm font-semibold">{routing?.mode === "automatic" ? "Response teams assigned automatically" : needsReview ? "Admin routing review required" : routing?.mode === "manual" ? "Response teams confirmed by admin" : "Existing response assignments"}</h3>
    {routing?.reasons.map((reason, index) => <p key={index} className="text-xs text-slate-700">{reason}</p>)}
    {!!routing?.suggested_codes.length && <p className="text-xs text-slate-700">Suggested teams: {routing.suggested_codes.map(code => departments.find(d => d.code === code)?.name ?? code).join("; ")}</p>}
    <p className="text-xs text-slate-500">Assignments are tasks in CIVISCOPE. Teams must acknowledge them; agency deployment is coordinated separately.</p>
    {isAdmin && needsReview && incident.status !== "closed" && <div className="space-y-2 border-t border-amber-200 pt-2">
      <p className="text-xs">Add the required teams below, then confirm your routing decision.</p>
      <textarea aria-label="Routing review notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} placeholder="Explain your team selection, specialist activation or safe relief staging area…" className="w-full rounded border border-slate-300 bg-white p-2 text-xs" />
      <button onClick={() => void completeReview()} disabled={busy || notes.trim().length < 10 || !incident.assignments?.some(a => a.assignment_status !== "rejected")} className="rounded bg-primary px-3 py-2 text-xs text-white disabled:opacity-40">{busy ? "Saving…" : "Complete routing review"}</button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>}
  </section>;
}
