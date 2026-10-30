import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createDemoToken } from "../src/lib/auth/demo";
import { resetStore, getStore, SEED_PROFILES } from "../src/lib/data-store";
import { GET as list, POST as submit } from "../src/app/api/incidents/route";
import { GET as reports } from "../src/app/api/reports/route";
import { PATCH as updateIncident } from "../src/app/api/incidents/[id]/route";
import { PATCH as updateAssignment } from "../src/app/api/assignments/[id]/route";
import { POST as upload } from "../src/app/api/uploads/route";
import { POST as reset } from "../src/app/api/seed/reset/route";
import { POST as demoLogin } from "../src/app/api/demo/session/route";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
  "base64",
);
function request(path: string, actor?: number, method = "GET", body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      ...(actor === undefined
        ? {}
        : {
            cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[actor].id)}`,
          }),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function main() {
  process.env.CIVISCOPE_DEMO_MODE = "true";
  process.env.OPENROUTER_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  process.env.AI_PROVIDER = "openrouter";
  resetStore();
  assert.equal((await list(request("/api/incidents"))).status, 401);
  assert.equal((await list(request("/api/incidents", 3))).status, 403);
  assert.equal(
    (await reset(request("/api/seed/reset", 3, "POST"))).status,
    403,
  );
  const badOrigin = request("/api/demo/session", undefined, "POST", {
    email: SEED_PROFILES[0].email,
    password: "CiviscopeDemo!2026",
  });
  badOrigin.headers.set("origin", "https://attacker.invalid");
  assert.equal((await demoLogin(badOrigin)).status, 403);
  const invalidLogin = request("/api/demo/session", undefined, "POST", {
    email: SEED_PROFILES[0].email,
    password: "incorrect",
  });
  assert.equal((await demoLogin(invalidLogin)).status, 401);
  const form = new FormData();
  form.append("file", new File([png], "incident.png", { type: "image/png" }));
  const uploadRequest = new NextRequest("http://localhost/api/uploads", {
    method: "POST",
    headers: {
      cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[3].id)}`,
    },
    body: form,
  });
  const uploaded = await upload(uploadRequest);
  assert.equal(uploaded.status, 201);
  const photo = await uploaded.json();
  const body = {
    reporterId: SEED_PROFILES[0].id,
    imagePath: photo.imagePath,
    description: "Flood water blocking the pedestrian path",
    assistanceNeeded: "Water pumping",
    incidentLatitude: 22.95,
    incidentLongitude: 90.82,
    sourceType: "on_site",
    immediateDanger: "unknown",
  };
  const submitted = await submit(request("/api/incidents", 3, "POST", body));
  assert.equal(submitted.status, 201);
  const result = await submitted.json();
  assert.equal(
    result.report.reporter_id,
    SEED_PROFILES[3].id,
    "Server must ignore spoofed reporter identity",
  );
  const own = await (await reports(request("/api/reports", 3))).json();
  assert.ok(
    own.reports.every(
      (r: { reporter_id: string }) => r.reporter_id === SEED_PROFILES[3].id,
    ),
  );
  const forbidden = await updateIncident(
    request("/api/incidents/id", 3, "PATCH", {
      action: "verify",
      verificationStatus: "verified",
    }),
    { params: Promise.resolve({ id: result.incident.id }) },
  );
  assert.equal(forbidden.status, 403);
  const electrical = getStore().assignments.find(
    (a) => a.department_id === SEED_PROFILES[2].department_id,
  )!;
  const crossDepartment = await updateAssignment(
    request("/api/assignments/id", 1, "PATCH", {
      action: "update_status",
      status: "resolved",
    }),
    { params: Promise.resolve({ id: electrical.id }) },
  );
  assert.equal(crossDepartment.status, 404);
  const fire = getStore().assignments.find(
    (a) => a.department_id === SEED_PROFILES[1].department_id,
  )!;
  const enRoute = await updateAssignment(
    request("/api/assignments/id", 1, "PATCH", {
      action: "update_status",
      status: "en_route",
      userId: SEED_PROFILES[0].id,
    }),
    { params: Promise.resolve({ id: fire.id }) },
  );
  assert.equal(enRoute.status, 200);
  assert.equal(
    getStore().activityLogs[0].actor_id,
    SEED_PROFILES[1].id,
    "Server must ignore spoofed audit identity",
  );
  const malformed = new FormData();
  malformed.append(
    "file",
    new File(["<svg/>"], "fake.png", { type: "image/png" }),
  );
  assert.equal(
    (
      await upload(
        new NextRequest("http://localhost/api/uploads", {
          method: "POST",
          headers: {
            cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[3].id)}`,
          },
          body: malformed,
        }),
      )
    ).status,
    400,
  );
  console.log(
    "API security tests passed: authentication, CSRF, roles, ownership, upload validation, department scope, audit identity, and real demo persistence.",
  );
  resetStore();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
