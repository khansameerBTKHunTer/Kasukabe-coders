import type { AIAssessment, Department, PriorityBand, RoutingDecision, SourceType, ImmediateDanger, Assignment } from "@/types";
import { departmentDefinition } from "./departments";
import { recommendDepartments, reportCategory, reportedHazardCategories } from "./department-router";

export interface RoutingInput {
  aiAssessment?: AIAssessment | null;
  description: string;
  assistanceNeeded: string;
  immediateDanger: ImmediateDanger;
  sourceType: SourceType;
  priorityBand: PriorityBand;
  hasDuplicateCandidates: boolean;
  departments: Department[];
}

// Model suggestions are untrusted. Mandatory professional teams come from rules;
// codes, confidence, activation restrictions and availability are checked here.
export function planResponse(input: RoutingInput): RoutingDecision {
  const ai = input.aiAssessment;
  const text = [input.description, input.assistanceNeeded, ...(ai?.secondary_hazards ?? [])].join(" ");
  const category = reportCategory(ai, input.description);
  const base = recommendDepartments(category, text, ai?.secondary_hazards ?? []);
  const codes = new Set<string>([base.primaryDepartmentCode, ...base.secondaryDepartmentNames.map(n => departmentDefinition(n)?.code).filter((c): c is NonNullable<typeof c> => Boolean(c))]);
  const mandatory = new Set(codes);
  for (const hazard of reportedHazardCategories(input.description)) {
    const recommendation = recommendDepartments(hazard, text, []);
    mandatory.add(recommendation.primaryDepartmentCode);
    for (const name of recommendation.secondaryDepartmentNames) {
      const code = departmentDefinition(name)?.code;
      if (code) mandatory.add(code);
    }
  }
  for (const code of mandatory) codes.add(code);
  const reasons: string[] = [];
  const unsafeSupport = input.immediateDanger !== "no" || !ai || ["high", "critical"].includes(ai.severity)
    || Boolean(ai.life_risk_indicators.length) || ["fire", "building_damage", "electrical_hazard", "landslide", "medical_emergency"].includes(ai.category)
    || /\b(trapped|injur(?:ed|ies|y)|electrocut(?:ed|ion)?|sparking|live wires?|collapsed?|swift water|deep water|fire|smoke)\b/i.test(text);
  for (const suggestion of ai?.recommended_departments ?? []) {
    const dept = departmentDefinition(suggestion);
    if (!dept) { reasons.push("The AI suggested an unrecognized response team."); continue; }
    if (dept.activation === "coordination") { reasons.push("The AI requested district-level coordination."); continue; }
    if (dept.activation === "support" && unsafeSupport) {
      reasons.push("Volunteer or relief support near a hazard needs an admin to confirm a safe staging area.");
      continue;
    }
    if (!ai || ai.confidence < 0.8) continue;
    codes.add(dept.code);
  }
  if (/\b(injur(?:ed|ies|y)|casualt(?:y|ies)|bleeding|unconscious)\b/i.test(text)) codes.add("MEDICAL");
  if (/\b(traffic|road closure|road blocked|blocked road)\b/i.test(text)) codes.add("POLICE");
  if (!unsafeSupport && /\b(shelter|food|drinking water|relief supplies|hygiene|ration)\b/i.test(text)) {
    codes.add("NGO_RELIEF");
    codes.add("COMMUNITY_VOLUNTEERS");
  }
  if (!unsafeSupport && /\b(evacuation support|shelter support|relief logistics)\b/i.test(text)) codes.add("CIVIL_DEFENCE");
  codes.delete("CONTROL_ROOM");
  if (!ai) reasons.push("Photo analysis is unavailable. Clear reported hazards are routed by capability rules; admin must review the evidence.");
  if (ai && ai.confidence < 0.8) reasons.push("The assessment confidence is below 80%.");
  if (ai && ai.category !== category) reasons.push("The reported hazard is routed from the citizen's description; the visual classification needs review.");
  if (category === "other" || !codes.size) reasons.push("The incident does not have a clear response category.");
  // Urgency is a reason to dispatch mandatory professional teams immediately,
  // not a reason to leave a clear incident unassigned. The control room still
  // monitors the incident and verifies each team's completed work.
  if (input.sourceType === "news_public") reasons.push("Public or news evidence must be checked before assigning teams.");
  if (input.hasDuplicateCandidates) reasons.push("A nearby similar incident may already have response teams assigned.");
  for (const code of codes) {
    if (departmentDefinition(code)?.activation === "admin_only") reasons.push(`${code} activation requires an admin decision.`);
    if (!input.departments.some(d => d.code === code)) reasons.push(`The ${code} team is missing from the department directory.`);
  }
  const mode = reasons.length ? "needs_review" : "automatic";
  const held = input.sourceType === "news_public" || input.hasDuplicateCandidates;
  const assigned = held ? [] : [...codes].filter(code =>
    input.departments.some(d => d.code === code) &&
    (mode === "automatic" || mandatory.has(code)) &&
    (departmentDefinition(code)?.activation === "automatic" ||
      (mode === "automatic" && departmentDefinition(code)?.activation === "support")),
  );
  return { mode, suggested_codes: [...codes], assigned_codes: assigned, reasons: reasons.length ? [...new Set(reasons)] : [
    input.immediateDanger !== "no" || ai?.life_risk_indicators.length || ["High", "Critical"].includes(input.priorityBand) || (ai && ["high", "critical"].includes(ai.severity))
      ? "Clear urgent incident: professional response teams dispatched immediately; the control room will monitor and verify the response."
      : "Clear assessment at 80% confidence or higher; response teams selected using AI and capability rules.",
  ], policy_version: "india-relief-v3" };
}

export function responseStatus(assignments: Assignment[]) {
  if (!assignments.length || assignments.every(a => a.assignment_status === "rejected")) return "open" as const;
  const active = assignments.filter(a => a.assignment_status !== "rejected");
  if (active.every(a => a.assignment_status === "resolved")) {
    return active.every(a => a.completion_verification === "verified") ? "resolved" as const : "pending_verification" as const;
  }
  return active.some(a => ["acknowledged", "en_route", "on_site", "in_progress", "resolved"].includes(a.assignment_status)) ? "in_progress" as const : "assigned" as const;
}
