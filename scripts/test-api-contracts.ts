import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server";
import { createDemoToken } from "../src/lib/auth/demo";
import { getStore, resetStore, SEED_PROFILES } from "../src/lib/data-store";

// Discover routes so newly added endpoints cannot silently escape the API checks.
async function main() {
  process.env.CIVISCOPE_DEMO_MODE = "true";
  process.env.GEMINI_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "";
  resetStore();
  const files = (await readdir("src/app/api", { recursive: true })).filter(file => file.endsWith("route.ts")).sort();
  let methods = 0;
  let assertions = 0;
  for (const file of files) {
    const source = await readFile(resolve("src/app/api", file), "utf8");
    const handlers = await import(pathToFileURL(resolve("src/app/api", file)).href);
    const path = `/api/${file.replace(/\/?route.ts$/, "").replaceAll("[id]", "missing-record")}`;
    const publicRoute = ["/api/health", "/api/departments", "/api/demo/session"].includes(path);
    for (const match of source.matchAll(/export (?:async )?function (GET|POST|PATCH|DELETE)\(/g)) {
      const method = match[1];
      methods++;
      const invoke = async (authenticated: boolean, body?: string, origin?: string) => {
        const request = new NextRequest(`http://localhost${path}`, {
          method,
          headers: {
            ...(authenticated ? { cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[0].id)}` } : {}),
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(origin ? { origin } : {}),
          },
          ...(body !== undefined ? { body } : {}),
        });
        return handlers[method](request, { params: Promise.resolve({ id: "missing-record" }) }) as Promise<Response>;
      };
      if (!publicRoute) {
        const response = await invoke(false);
        assert.equal(response.status, 401, `${method} ${path}: anonymous access`);
        assertions++;
      }
      if (method !== "GET") {
        assert.equal((await invoke(true, "{}", "https://attacker.invalid")).status, 403, `${method} ${path}: cross-site mutation`);
        assertions++;
      }
      if (["POST", "PATCH"].includes(method) && path !== "/api/seed/reset") {
        for (const body of ["null", "{broken-json", "{}", "[]"]) {
          const response = await invoke(true, body);
          assert.equal(response.status, 400, `${method} ${path}: malformed body ${body}`);
          assertions++;
        }
      } else if (method === "GET") {
        const response = await invoke(true);
        assert.equal(response.status, path.includes("missing-record") ? 404 : 200, `${method} ${path}: authenticated read`);
        assertions++;
      } else if (method === "DELETE") {
        assert.equal((await invoke(true)).status, 200);
        assertions++;
      } else if (path === "/api/seed/reset") {
        assert.equal((await invoke(true)).status, 200);
        assertions++;
      }
      console.log(`PASS ${method} ${path}`);
    }
  }
  const { PATCH: update } = await import("../src/app/api/incidents/[id]/route");
  const { POST: duplicate } = await import("../src/app/api/incidents/duplicate/route");
  const report = getStore().reports.find(item => item.incident_id)!;
  for (const body of [
    { action: "reject", reportId: report.id },
    { action: "confirm", reportId: report.id, targetIncidentId: report.incident_id },
    { action: "confirm", reportId: report.id, targetIncidentId: report.incident_id },
  ]) {
    const response = await duplicate(new NextRequest("http://localhost/api/incidents/duplicate", {
      method: "POST", headers: { cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[0].id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200, "Duplicate decisions and repeated confirmation must succeed");
    assertions++;
  }
  for (const body of [
    { action: "verify", verificationStatus: "verified" },
    { action: "override_priority", priorityScore: 90, overrideReason: "Missing record regression" },
  ]) {
    const response = await update(new NextRequest("http://localhost/api/incidents/missing-record", {
      method: "PATCH", headers: { cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[0].id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "missing-record" }) });
    assert.equal(response.status, 404, "Missing incidents must not return server errors");
    assertions++;
  }
  const { POST: reverse } = await import("../src/app/api/geocode/route");
  const { POST: search } = await import("../src/app/api/geocode/search/route");
  const originalFetch = globalThis.fetch;
  const previousVercel = process.env.VERCEL;
  const previousGeocoding = process.env.GEOCODING_BASE_URL;
  try {
    process.env.VERCEL = "1";
    delete process.env.GEOCODING_BASE_URL;
    const disabled = await search(new NextRequest("http://localhost/api/geocode/search", {
      method: "POST", headers: { cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[3].id)}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "Hosted missing provider" }),
    }));
    assert.equal(disabled.status, 503, "Vercel must not silently fall back to the demo-only public geocoder");
    assert.match(await disabled.text(), /drop a pin/);
    assertions += 2;
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousGeocoding === undefined) delete process.env.GEOCODING_BASE_URL;
    else process.env.GEOCODING_BASE_URL = previousGeocoding;
  }
  let upstreamFailure = false;
  globalThis.fetch = async input => {
    if (upstreamFailure) return new Response("private upstream error", { status: 503 });
    return Response.json(String(input).includes("/reverse?")
      ? { display_name: "Bengaluru, Karnataka, India" }
      : [{ lat: "12.97", lon: "77.59", display_name: "Bengaluru, Karnataka, India" }, { lat: "999", lon: "0", display_name: "Invalid coordinates" }]);
  };
  const geocodeRequest = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { cookie: `civiscope_demo=${createDemoToken(SEED_PROFILES[3].id)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    const reverseResponse = await reverse(geocodeRequest("/api/geocode", { lat: 12.97, lng: 77.59 }));
    assert.equal(reverseResponse.status, 200);
    assert.equal((await reverseResponse.json()).address, "Bengaluru, Karnataka, India");
    const searchResponse = await search(geocodeRequest("/api/geocode/search", { query: "Bengaluru contract check" }));
    assert.equal(searchResponse.status, 200);
    assert.equal((await searchResponse.json()).results.length, 1, "Invalid provider coordinates must be discarded");
    upstreamFailure = true;
    const failed = await search(geocodeRequest("/api/geocode/search", { query: "Different lookup upstream failure" }));
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private upstream error"));
    assertions += 6;
  } finally { globalThis.fetch = originalFetch; }
  resetStore();
  console.log(`API inventory passed: ${files.length} route files, ${methods} methods, ${assertions} authentication/validation/read assertions. Mutation success paths run in API, routing, uploads and browser suites.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
