"use client";
import { useState } from "react";
import type { Assignment } from "@/types";

export function ResponseWorkReview({ assignment, isAdmin, onRefresh }: { assignment: Assignment; isAdmin: boolean; onRefresh: () => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function review(decision: "verified" | "rework") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/assignments/${assignment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review_response", decision, notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Work review failed.");
      setNotes(""); onRefresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Work review failed."); }
    finally { setBusy(false); }
  }
  return <div className="w-full space-y-2 text-xs">
    <p className="text-slate-500">{assignment.assignment_source === "automatic" ? "Automatically assigned" : "Admin assignment"}</p>
    {assignment.completion_verification === "pending_review" && <p className="font-medium text-amber-800">Work completed — awaiting admin verification</p>}
    {assignment.completion_verification === "verified" && <p className="font-medium text-emerald-700">Work verified by admin</p>}
    {assignment.completion_verification === "rework" && <p className="font-medium text-amber-800">Further work requested by admin</p>}
    {assignment.review_notes && <p className="text-slate-700">Admin review: {assignment.review_notes}</p>}
    {isAdmin && assignment.completion_verification === "pending_review" && <fieldset className="space-y-2 rounded border border-amber-200 bg-amber-50 p-2" disabled={busy}>
      <legend className="font-medium">Verify completed work</legend>
      <p>Review the team’s observations, field photographs and completion notes.</p>
      <textarea aria-label={`Work review notes for ${assignment.department?.name ?? "response team"}`} value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} placeholder="Record what you checked and whether further work is needed…" className="w-full rounded border border-slate-300 bg-white p-2" />
      <div className="flex flex-wrap gap-2">
        <button disabled={notes.trim().length < 10} onClick={() => void review("verified")} className="rounded bg-emerald-700 px-3 py-1.5 text-white disabled:opacity-40">Verify work</button>
        <button disabled={notes.trim().length < 10} onClick={() => void review("rework")} className="rounded border border-amber-300 px-3 py-1.5 text-amber-900 disabled:opacity-40">Request further work</button>
      </div>
    </fieldset>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
