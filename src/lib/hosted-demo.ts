import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStore, replaceDemoStore, resetStore, type MemoryStore } from "@/lib/data-store";

export const DEMO_BUCKET = "civiscope-demo";
export function hostedDemo() {
  return process.env.CIVISCOPE_DEMO_MODE === "true" && Boolean(process.env.VERCEL);
}
const local = globalThis as typeof globalThis & { civiscopeDemoQueue?: Promise<void> };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const missing = (error: { message?: string; statusCode?: string } | null) =>
  error?.statusCode === "404" || /not found|does not exist/i.test(error?.message ?? "");

// A separate private Storage bucket holds fictional demo snapshots only.
// The real reporting tables and real evidence bucket are never used here.
export async function withHostedDemo<T>(operation: () => Promise<T>): Promise<T> {
  if (!hostedDemo()) return operation();
  const previous = local.civiscopeDemoQueue ?? Promise.resolve();
  let release!: () => void;
  local.civiscopeDemoQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const bucket = createAdminClient().storage.from(DEMO_BUCKET);
  const owner = randomUUID();
  let locked = false;
  try {
    // Storage's non-upsert insert prevents simultaneous normal writers.
    // The lease exceeds API execution time; stale locks recover abandoned demos.
    for (let attempt = 0; attempt < 18; attempt++) {
      const lock = await bucket.upload("state.lock", JSON.stringify({ owner, expires: Date.now() + 120_000 }), {
        contentType: "application/json", upsert: false, cacheControl: "0",
      });
      if (!lock.error) { locked = true; break; }
      if (!/already exists|duplicate|resource already/i.test(lock.error.message) && !["409", "400"].includes(lock.error.statusCode ?? ""))
        throw new ApiError(503, "Shared demo storage is unavailable. Retry shortly.");
      const current = await bucket.download("state.lock");
      if (current.data) {
        const lease = JSON.parse(await current.data.text());
        if (typeof lease.expires === "number" && lease.expires < Date.now()) {
          await bucket.remove(["state.lock"]);
        }
      }
      await delay(150 + Math.random() * 150);
    }
    if (!locked) throw new ApiError(429, "The shared demo is busy. Retry in a few seconds.");
    const downloaded = await bucket.download("state.json");
    if (downloaded.error && !missing(downloaded.error))
      throw new ApiError(503, "The shared demo could not load. Retry shortly.");
    let expires = Date.now() + 24 * 3600_000;
    let initialise = !downloaded.data;
    if (downloaded.data) {
      const snapshot = JSON.parse(await downloaded.data.text());
      if (snapshot.version !== 1 || !snapshot.store || !["incidents", "reports", "assignments", "activityLogs"].every(key => Array.isArray(snapshot.store[key])))
        throw new ApiError(503, "The shared demo needs to be reset.");
      if (snapshot.expires > Date.now()) {
        replaceDemoStore(snapshot.store as MemoryStore);
        expires = snapshot.expires;
      } else { resetStore(); initialise = true; }
    } else resetStore();
    const before = JSON.stringify(getStore());
    const result = await operation();
    const after = JSON.stringify(getStore());
    if (getStore().reports.length > 1000)
      throw new ApiError(409, "The demo is full. Ask the demo admin to reset the fictional scenario.");
    if (initialise || before !== after) {
      const saved = await bucket.upload("state.json", JSON.stringify({ version: 1, expires, store: getStore() }), {
        contentType: "application/json", upsert: true, cacheControl: "0",
      });
      if (saved.error) throw new ApiError(503, "The demo update could not be saved. Retry shortly.");
    }
    return result;
  } finally {
    try {
      if (locked) {
        const current = await bucket.download("state.lock");
        if (current.data && JSON.parse(await current.data.text()).owner === owner)
          await bucket.remove(["state.lock"]);
      }
    } finally { release(); }
  }
}
