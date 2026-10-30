import assert from "node:assert/strict";
import { planResponse, responseStatus, type RoutingInput } from "../src/lib/response-routing";
import { DEPARTMENT_CATALOG, SEED_DEPARTMENT_CATALOG } from "../src/lib/departments";
import { profileAccessError } from "../src/lib/auth/roles";
import { Backend } from "../src/lib/backend";
import { getStore, IncidentService, resetStore, SEED_PROFILES } from "../src/lib/data-store";
import type { AIAssessment } from "../src/types";

const assessment: AIAssessment = { category: "flood", title: "Minor drainage obstruction", severity: "low", confidence: 0.94, visible_damage: ["Blocked roadside drain"], secondary_hazards: [], life_risk_indicators: [], critical_infrastructure_indicators: [], uncertainties: [], human_review_required: false, summary: "Shallow water near a blocked drain. No people are visible.", recommended_departments: ["MUNICIPAL", "NGO_RELIEF", "COMMUNITY_VOLUNTEERS"] };
const input: RoutingInput = { aiAssessment: assessment, description: "Shallow water near a blocked drain", assistanceNeeded: "Pumping and food at a safe relief shelter", immediateDanger: "no", sourceType: "on_site", priorityBand: "Low", hasDuplicateCandidates: false, departments: SEED_DEPARTMENT_CATALOG };
assert.deepEqual(planResponse(input).assigned_codes.sort(), ["MUNICIPAL", "NGO_RELIEF", "COMMUNITY_VOLUNTEERS"].sort());
for (const patch of [
  { aiAssessment: null }, { aiAssessment: { ...assessment, confidence: 0.79 } },
  { aiAssessment: { ...assessment, human_review_required: true } },
  { aiAssessment: { ...assessment, severity: "high" as const } },
  { aiAssessment: { ...assessment, life_risk_indicators: ["Person in water"] } },
  { aiAssessment: { ...assessment, recommended_departments: ["NDRF"] } },
  { aiAssessment: { ...assessment, recommended_departments: ["an invented team"] } },
  { aiAssessment: { ...assessment, category: "other" as const } },
  { immediateDanger: "yes" as const }, { immediateDanger: "unknown" as const },
  { sourceType: "news_public" as const }, { priorityBand: "Critical" as const },
  { hasDuplicateCandidates: true }, { departments: [] },
]) {
  const decision = planResponse({ ...input, ...patch });
  assert.equal(decision.mode, "needs_review", JSON.stringify(patch));
  assert.deepEqual(decision.assigned_codes, []);
}
const hazardous = planResponse({ ...input, aiAssessment: { ...assessment, category: "electrical_hazard" }, description: "Downed wire across a path" });
assert.equal(hazardous.mode, "needs_review");
assert.ok(hazardous.suggested_codes.includes("ELECTRICITY"));
assert.ok(!hazardous.suggested_codes.includes("COMMUNITY_VOLUNTEERS"));
const professional = planResponse({ ...input, aiAssessment: { ...assessment, category: "fire", recommended_departments: ["Fire & Rescue", "Electricity Department", "MEDICAL"] }, assistanceNeeded: "Qualified fire services only" });
assert.deepEqual(professional.assigned_codes.sort(), ["FIRE_RESCUE", "MEDICAL", "ELECTRICITY"].sort());
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
  let nearbyRows: unknown[] = [];
  globalThis.fetch = async (resource, init) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    assert.equal(url.hostname, "routing-tests.example.invalid");
    if (url.pathname === "/storage/v1/object/list/incident-evidence") return Response.json([{ name: photoName }]);
    if (url.pathname.startsWith("/storage/v1/object/sign/incident-evidence/")) return Response.json({ signedURL: "/object/sign/incident-evidence/test.png?token=test-only" });
    if (url.pathname === "/rest/v1/departments") return missingSchema
      ? Response.json({ code: "42703", message: "Missing relief routing columns" }, { status: 400 })
      : Response.json(SEED_DEPARTMENT_CATALOG);
    if (url.pathname === "/rest/v1/incidents") return Response.json(nearbyRows);
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
    assert.deepEqual(rpcCalls[1].incident_data.routing_decision.assigned_codes, []);
    nearbyRows = [{ id: "12345678-0000-4000-8000-123456789012", title: "Existing nearby flood", category: "flood", latitude: 18.52, longitude: 73.85, description: null, status: "open" }];
    await real.submitCitizenReport({ ...report });
    assert.equal(rpcCalls[2].incident_data.routing_decision.mode, "needs_review", "A nearby legacy incident with nullable description must still prevent duplicate assignment");
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
