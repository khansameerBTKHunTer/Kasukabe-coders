import type { AIAssessment, Department, PriorityBand, RoutingDecision, SourceType, ImmediateDanger, Assignment } from "@/types";
import { departmentDefinition } from "./departments";
import { recommendDepartments } from "./department-router";

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
  const base = recommendDepartments(ai?.category ?? "other", text, ai?.secondary_hazards ?? []);
  const codes = new Set<string>([base.primaryDepartmentCode, ...base.secondaryDepartmentNames.map(n => departmentDefinition(n)?.code).filter((c): c is NonNullable<typeof c> => Boolean(c))]);
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
  if (!ai) reasons.push("AI assessment is unavailable; an admin must choose the response teams.");
  if (ai && (ai.confidence < 0.8 || ai.human_review_required)) reasons.push("The assessment needs human review or has confidence below 80%.");
  if (!ai || ai.category === "other" || !codes.size) reasons.push("The incident does not have a clear response category.");
  if (input.immediateDanger !== "no" || ai?.life_risk_indicators.length || ["High", "Critical"].includes(input.priorityBand) || (ai && ["high", "critical"].includes(ai.severity))) reasons.push("Immediate danger, life risk or high severity requires urgent admin coordination.");
  if (input.sourceType === "news_public") reasons.push("Public or news evidence must be checked before assigning teams.");
  if (input.hasDuplicateCandidates) reasons.push("A nearby similar incident may already have response teams assigned.");
  for (const code of codes) {
    if (departmentDefinition(code)?.activation === "admin_only") reasons.push(`${code} activation requires an admin decision.`);
    if (!input.departments.some(d => d.code === code)) reasons.push(`The ${code} team is missing from the department directory.`);
  }
  const mode = reasons.length ? "needs_review" : "automatic";
  return { mode, suggested_codes: [...codes], assigned_codes: mode === "automatic" ? [...codes] : [], reasons: reasons.length ? [...new Set(reasons)] : ["Clear assessment at 80% confidence or higher; routine response teams selected using AI and capability rules."], policy_version: "india-relief-v1" };
}

export function responseStatus(assignments: Assignment[]) {
  if (!assignments.length || assignments.every(a => a.assignment_status === "rejected")) return "open" as const;
  const active = assignments.filter(a => a.assignment_status !== "rejected");
  if (active.every(a => a.assignment_status === "resolved")) {
    return active.every(a => a.completion_verification === "verified") ? "resolved" as const : "pending_verification" as const;
  }
  return active.some(a => ["acknowledged", "en_route", "on_site", "in_progress", "resolved"].includes(a.assignment_status)) ? "in_progress" as const : "assigned" as const;
}
