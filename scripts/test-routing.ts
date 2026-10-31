import assert from "node:assert/strict";
import { planResponse, responseStatus, type RoutingInput } from "../src/lib/response-routing";
import { DEPARTMENT_CATALOG, SEED_DEPARTMENT_CATALOG } from "../src/lib/departments";
import { profileAccessError } from "../src/lib/auth/roles";
import { Backend } from "../src/lib/backend";
import { getStore, IncidentService, resetStore, SEED_PROFILES } from "../src/lib/data-store";
import type { AIAssessment } from "../src/types";
import { reportCategory } from "../src/lib/department-router";

const assessment: AIAssessment = { category: "flood", title: "Minor drainage obstruction", severity: "low", confidence: 0.94, visible_damage: ["Blocked roadside drain"], secondary_hazards: [], life_risk_indicators: [], critical_infrastructure_indicators: [], uncertainties: [], human_review_required: false, summary: "Shallow water near a blocked drain. No people are visible.", recommended_departments: ["MUNICIPAL", "NGO_RELIEF", "COMMUNITY_VOLUNTEERS"] };
const input: RoutingInput = { aiAssessment: assessment, description: "Shallow water near a blocked drain", assistanceNeeded: "Pumping and food at a safe relief shelter", immediateDanger: "no", sourceType: "on_site", priorityBand: "Low", hasDuplicateCandidates: false, departments: SEED_DEPARTMENT_CATALOG };
assert.deepEqual(planResponse(input).assigned_codes.sort(), ["MUNICIPAL", "NGO_RELIEF", "COMMUNITY_VOLUNTEERS"].sort());
for (const patch of [
  { aiAssessment: null }, { aiAssessment: { ...assessment, confidence: 0.79 } },
  { aiAssessment: { ...assessment, recommended_departments: ["NDRF"] } },
  { aiAssessment: { ...assessment, recommended_departments: ["an invented team"] } },
  { aiAssessment: { ...assessment, category: "other" as const } },
  { sourceType: "news_public" as const },
  { hasDuplicateCandidates: true }, { departments: [] },
]) {
  const decision = planResponse({ ...input, ...patch });
  assert.equal(decision.mode, "needs_review", JSON.stringify(patch));
  if (patch.sourceType === "news_public" || patch.hasDuplicateCandidates || patch.departments) {
    assert.deepEqual(decision.assigned_codes, []);
  } else {
    assert.ok(decision.assigned_codes.includes("MUNICIPAL"), "Clear municipal hazards still reach their professional department during review");
    assert.ok(!decision.assigned_codes.includes("NDRF"));
    assert.ok(!decision.assigned_codes.includes("COMMUNITY_VOLUNTEERS"));
  }
}
const hazardous = planResponse({ ...input, aiAssessment: { ...assessment, category: "electrical_hazard" }, description: "Downed wire across a path" });
assert.equal(hazardous.mode, "needs_review");
assert.ok(hazardous.suggested_codes.includes("ELECTRICITY"));
assert.ok(!hazardous.suggested_codes.includes("COMMUNITY_VOLUNTEERS"));
const professional = planResponse({ ...input, aiAssessment: { ...assessment, category: "fire", recommended_departments: ["Fire & Rescue", "Electricity Department", "MEDICAL"] }, description: "Flames visible from the building", assistanceNeeded: "Qualified fire services only" });
assert.deepEqual(professional.assigned_codes.sort(), ["FIRE_RESCUE", "MEDICAL", "ELECTRICITY"].sort());
const urgentBuildingFire = planResponse({
  ...input,
  aiAssessment: {
    ...assessment,
    category: "fire",
    title: "Active fire in occupied building",
    severity: "critical",
    human_review_required: true,
    life_risk_indicators: ["People may be inside"],
    recommended_departments: ["Fire & Rescue", "Medical Response"],
  },
  description: "Flames and smoke visible from an occupied building",
  assistanceNeeded: "Fire suppression and rescue",
  immediateDanger: "yes",
  priorityBand: "Critical",
});
assert.equal(urgentBuildingFire.mode, "automatic");
assert.deepEqual(urgentBuildingFire.assigned_codes.sort(), ["FIRE_RESCUE", "MEDICAL"].sort());
assert.match(urgentBuildingFire.reasons[0], /dispatched immediately/);
for (const [description, category, department] of [
  ["The building is on fire and flames are visible", "fire", "FIRE_RESCUE"],
  ["A fallen power line is sparking on the footpath", "electrical_hazard", "ELECTRICITY"],
  ["A fallen tree is blocking the road", "road_blockage", "MUNICIPAL"],
  ["A person is unconscious and bleeding", "medical_emergency", "MEDICAL"],
] as const) {
  assert.equal(reportCategory(null, description), category);
  const decision = planResponse({ ...input, aiAssessment: null, description, assistanceNeeded: "Emergency help needed", immediateDanger: "yes" });
  assert.equal(decision.mode, "needs_review");
  assert.ok(decision.assigned_codes.includes(department), description);
  assert.ok(!decision.assigned_codes.includes("NGO_RELIEF"));
}
assert.equal(reportCategory(null, "No fire is visible. Food supplies needed at the shelter."), "other");
assert.equal(reportCategory(null, "Please contact the fire department for an update"), "other");
const missingMedical = planResponse({ ...input, aiAssessment: null, description: "The building is on fire", departments: SEED_DEPARTMENT_CATALOG.filter(d => d.code !== "MEDICAL") });
assert.ok(missingMedical.assigned_codes.includes("FIRE_RESCUE"), "A missing secondary team must not prevent Fire from receiving its report");
for (const profile of SEED_PROFILES) assert.equal(profileAccessError(profile), null);
assert.ok(profileAccessError({ ...SEED_PROFILES[6], department: SEED_DEPARTMENT_CATALOG[0] }));
assert.equal(new Set(DEPARTMENT_CATALOG.map(d => d.code)).size, 11);

async function main() {
  resetStore();
  const submitted = await IncidentService.submitCitizenReport({ imagePath: "/test.png", description: input.description, assistanceNeeded: input.assistanceNeeded, incidentLatitude: 18.52, incidentLongitude: 73.85, immediateDanger: "no", sourceType: "on_site", reporterId: SEED_PROFILES[3].id, aiAssessment: assessment });
  assert.equal(submitted.incident.routing_decision?.mode, "automatic");
  const assignments = getStore().assignments.filter(a => a.incident_id === submitted.incident.id);
  assert.equal(assignments.length, 3);
  assert.ok(assignments.every(a => a.assignment_source === "automatic" && a.assignment_status === "pending" && !a.assigned_by));
  const admin = new Backend({ profile: SEED_PROFILES[0], demo: true, client: null });
  const citizen = new Backend({ profile: SEED_PROFILES[3], demo: true, client: null });
  const ngo = new Backend({ profile: SEED_PROFILES.find(p => p.email === "ngo@civiscope.demo")!, demo: true, client: null });
  assert.deepEqual((await ngo.getIncidents()).map(i => i.id), [submitted.incident.id]);
  assert.equal((await ngo.getIncidents())[0].assignments?.length, 1);
  await assert.rejects(citizen.reviewResponse(assignments[0].id, "verified", "Work checked"), /Control Room/);
  for (const assignment of assignments) {
    await admin.acknowledgeAssignment(assignment.id);
    await admin.updateResponseStatus(assignment.id, "in_progress");
    await assert.rejects(admin.updateResponseStatus(assignment.id, "resolved"), /completed work/);
    await admin.updateResponseStatus(assignment.id, "resolved", "Drain cleared and safe-zone supplies delivered.");
  }
  assert.equal(submitted.incident.status, "pending_verification");
  await assert.rejects(admin.closeIncident(submitted.incident.id), /verified/);
  await assert.rejects(ngo.reviewResponse(assignments[0].id, "verified", "Verified field work"), /Control Room/);
  await admin.reviewResponse(assignments[0].id, "rework", "Drain still obstructed; revisit and clear remaining debris.");
  assert.equal(assignments[0].assignment_status, "in_progress");
  assert.equal(submitted.incident.status, "in_progress");
  await admin.updateResponseStatus(assignments[0].id, "resolved", "Remaining debris cleared and checked on site.");
  assert.equal(assignments[0].reviewed_by, null);
  for (const assignment of assignments) await admin.reviewResponse(assignment.id, "verified", "Field photographs and completion notes checked.");
  assert.equal(responseStatus(assignments), "resolved");
  await admin.closeIncident(submitted.incident.id);
  assert.equal(submitted.incident.status, "closed");
  assert.ok(getStore().activityLogs.some(l => l.action === "response_auto_assigned" && l.actor_id === null));
  resetStore();
  // Exercise the real repository's Supabase HTTP/RPC boundary without touching
  // a hosted project. PostgreSQL executes these payloads in test:database.
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://routing-tests.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  const photoName = "12345678-1234-4234-8234-123456789012.png";
  const rpcCalls: { incident_data: { routing_decision: { mode: string; assigned_codes: string[] }; status: string }; report_data: { reporter_id: string }; actor_id: string }[] = [];
  let missingSchema = false;
  let staleSubmitFunction = false;
  let nearbyRows: unknown[] = [];
  globalThis.fetch = async (resource, init) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    assert.equal(url.hostname, "routing-tests.example.invalid");
    if (url.pathname === "/storage/v1/object/list/incident-evidence") return Response.json([{ name: photoName }]);
    if (url.pathname.startsWith("/storage/v1/object/incident-evidence/")) return new Response(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64"), { headers: { "Content-Type": "image/png" } });
    if (url.pathname.startsWith("/storage/v1/object/sign/incident-evidence/")) return Response.json({ signedURL: "/object/sign/incident-evidence/test.png?token=test-only" });
    if (url.pathname === "/rest/v1/departments") return missingSchema
      ? Response.json({ code: "42703", message: "Missing relief routing columns" }, { status: 400 })
      : Response.json(SEED_DEPARTMENT_CATALOG);
    if (url.pathname === "/rest/v1/incidents") return Response.json(nearbyRows);
    if (url.pathname === "/rest/v1/rpc/civiscope_deployment_status") return Response.json({ schema_version: staleSubmitFunction ? "20261103" : "20261105", report_delivery_installed: !staleSubmitFunction });
    if (url.pathname === "/rest/v1/rpc/civiscope_submit_report") {
      rpcCalls.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  try {
    const real = new Backend({ profile: SEED_PROFILES[3], demo: false, client: null });
    const report = { imagePath: `supabase://incident-evidence/${SEED_PROFILES[3].id}/${photoName}`, description: input.description, assistanceNeeded: input.assistanceNeeded, incidentLatitude: 18.52, incidentLongitude: 73.85, immediateDanger: "no" as const, sourceType: "on_site" as const, reporterId: SEED_PROFILES[0].id, aiAssessment: assessment };
    const result = await real.submitCitizenReport({ ...report });
    assert.equal(result.incident.status, "assigned");
    assert.equal(rpcCalls[0].incident_data.routing_decision.mode, "automatic");
    assert.equal(rpcCalls[0].incident_data.routing_decision.assigned_codes.length, 3);
    assert.equal(rpcCalls[0].actor_id, SEED_PROFILES[3].id);
    assert.equal(rpcCalls[0].report_data.reporter_id, SEED_PROFILES[3].id);
    await real.submitCitizenReport({ ...report, aiAssessment: null });
    assert.equal(rpcCalls[1].incident_data.routing_decision.mode, "needs_review");
    assert.deepEqual(rpcCalls[1].incident_data.routing_decision.assigned_codes, ["MUNICIPAL"]);
    nearbyRows = [{ id: "12345678-0000-4000-8000-123456789012", title: "Existing nearby flood", category: "flood", latitude: 18.52, longitude: 73.85, description: null, status: "open" }];
    await real.submitCitizenReport({ ...report });
    assert.equal(rpcCalls[2].incident_data.routing_decision.mode, "needs_review", "A nearby legacy incident with nullable description must still prevent duplicate assignment");
    staleSubmitFunction = true;
    await assert.rejects(real.submitCitizenReport({ ...report }), /deployment-readiness migrations/);
    assert.equal(rpcCalls.length, 3, "An older submit RPC must not silently discard assignments");
    staleSubmitFunction = false;
    missingSchema = true;
    await assert.rejects(real.submitCitizenReport({ ...report }), /India relief routing migrations/);
    assert.equal(rpcCalls.length, 3, "Unmigrated projects must fail before a mutation");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
  console.log("Routing tests passed: AI + mandatory rules, all review gates, India directory, department access, verified closure and rework.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
