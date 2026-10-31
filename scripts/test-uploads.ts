import assert from "node:assert/strict";
import { preparePhotoUpload } from "../src/lib/uploads";
import { validatePhoto } from "../src/lib/backend";
import { SEED_PROFILES } from "../src/lib/data-store";
import { MAX_PHOTO_BYTES } from "../src/lib/photo-validation";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const profile = SEED_PROFILES[3];
const actor = { profile, demo: false, client: null };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://uploads.example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-private-key";
let uploadedPath = "";
let invalidBytes = false;
let downloads = 0;
globalThis.fetch = async (resource, init) => {
  const url = new URL(String(resource));
  assert.equal(url.hostname, "uploads.example.invalid");
  if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) {
    assert.equal(init?.method, "POST");
    assert.ok(url.pathname.includes(`/${profile.id}/`));
    uploadedPath = url.pathname.split("/incident-evidence/")[1];
    return Response.json({ url: `/object/upload/sign/incident-evidence/${uploadedPath}?token=test-upload-token` });
  }
  if (url.pathname === "/storage/v1/object/list/incident-evidence")
    return Response.json([{ name: uploadedPath.split("/").pop() }]);
  if (url.pathname.startsWith("/storage/v1/object/incident-evidence/")) {
    downloads++;
    return new Response(invalidBytes ? Buffer.from("<script>invalid image</script>") : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64"), { headers: { "Content-Type": "image/png" } });
  }
  throw new Error(`Unexpected request: ${url.pathname}`);
};
async function main() {
try {
  const prepared = await preparePhotoUpload(actor, "image/png", MAX_PHOTO_BYTES);
  assert.equal(prepared.uploadMode, "direct");
  if (prepared.uploadMode !== "direct") throw new Error("Missing direct upload");
  assert.ok(prepared.uploadUrl.startsWith("https://uploads.example.invalid/storage/v1/object/upload/sign/"));
  assert.ok(!JSON.stringify(prepared).includes("test-private-key"));
  await validatePhoto(actor, prepared.imagePath);
  await validatePhoto(actor, prepared.imagePath);
  assert.equal(downloads, 1, "Immutable evidence should not be downloaded again at every step");
  await assert.rejects(validatePhoto({ ...actor, profile: SEED_PROFILES[1] }, prepared.imagePath), /your account/);
  for (const [type, size] of [["image/svg+xml", 100], ["image/png", 0], ["image/png", MAX_PHOTO_BYTES + 1]] as const)
    await assert.rejects(preparePhotoUpload(actor, type, size));
  invalidBytes = true;
  const invalid = await preparePhotoUpload(actor, "image/png", 100);
  if (invalid.uploadMode === "direct") await assert.rejects(validatePhoto(actor, invalid.imagePath), /valid JPEG/);
  assert.deepEqual(await preparePhotoUpload({ ...actor, demo: true }, "image/png", 100), { uploadMode: "multipart" });
  console.log("Upload tests passed: direct private uploads, owner isolation, size/type validation, stored signature checks, and reusable validation.");
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
