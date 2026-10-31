import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("Every API method is reachable over HTTP and protected routes reject anonymous requests", async ({ playwright }) => {
  const client = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const files = (await readdir("src/app/api", { recursive: true })).filter(file => file.endsWith("route.ts"));
    for (const file of files) {
      const path = `/api/${file.replace(/\/?route.ts$/, "").replaceAll("[id]", "missing-record")}`;
      const source = await readFile(resolve("src/app/api", file), "utf8");
      for (const match of source.matchAll(/export (?:async )?function (GET|POST|PATCH|DELETE)\(/g)) {
        const method = match[1];
        const response = await client.fetch(path, { method });
        const isPublic = ["/api/health", "/api/departments", "/api/demo/session"].includes(path);
        const expected = !isPublic ? 401 : path === "/api/demo/session" && method === "POST" ? 400 : 200;
        expect(response.status(), `${method} ${path}`).toBe(expected);
        expect(response.headers()["content-type"]).toContain("application/json");
        if (!isPublic) expect(response.headers()["cache-control"]).toContain("no-store");
      }
    }
    expect((await client.put("/api/incidents")).status()).toBe(405);
    expect((await client.get("/api/does-not-exist")).status()).toBe(404);
  } finally {
    await client.dispose();
  }
});
