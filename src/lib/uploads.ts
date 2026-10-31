import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/server";
import { ApiError } from "@/lib/auth/server";
import { EVIDENCE_BUCKET } from "./backend";
import { createAdminClient } from "./supabase/admin";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, validatePhotoBytes } from "./photo-validation";
const directory = join(tmpdir(), "civiscope-demo-evidence");
export async function readDemoUpload(
  id: string,
): Promise<{ owner: string; type: string; base64: string }> {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new ApiError(404, "Photograph not found.");
  try {
    return JSON.parse(await readFile(join(directory, id + ".json"), "utf8"));
  } catch {
    throw new ApiError(404, "Photograph not found. Upload it again.");
  }
}
export async function savePhoto(actor: Actor, file: File) {
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES)
    throw new ApiError(400, "Choose a photograph no larger than 8 MB.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = validatePhotoBytes(buffer, file.type);
  const id = randomUUID();
  if (actor.demo) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, id + ".json"),
      JSON.stringify({
        owner: actor.profile.id,
        type,
        base64: buffer.toString("base64"),
      }),
      { mode: 0o600 },
    );
    return {
      imagePath: `/api/uploads/${id}`,
      previewUrl: `/api/uploads/${id}`,
      storage: "temporary-demo",
    };
  }
  const path = `${actor.profile.id}/${id}.${type === "image/jpeg" ? "jpg" : type.split("/")[1]}`;
  const { error } = await actor
    .client!.storage.from(EVIDENCE_BUCKET)
    .upload(path, buffer, { contentType: type, upsert: false });
  if (error)
    throw new ApiError(
      error.statusCode === "403" ? 403 : 503,
      "Photograph upload failed. Check the evidence bucket and upload permissions, then retry.",
    );
  const signed = await createAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(path, 900);
  return {
    imagePath: `supabase://${EVIDENCE_BUCKET}/${path}`,
    previewUrl: signed.data?.signedUrl ?? "",
    storage: "supabase",
  };
}

export async function preparePhotoUpload(actor: Actor, contentType: string, size: number) {
  if (!PHOTO_TYPES.includes(contentType as typeof PHOTO_TYPES[number]) || !Number.isInteger(size) || size <= 0 || size > MAX_PHOTO_BYTES)
    throw new ApiError(400, "Choose a JPEG, PNG, or WebP photograph up to 8 MB.");
  if (actor.demo) return { uploadMode: "multipart" as const };
  const path = `${actor.profile.id}/${randomUUID()}.${contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1]}`;
  const { data, error } = await createAdminClient().storage.from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data)
    throw new ApiError(503, "Unable to prepare the photograph upload. Check the evidence bucket and retry.");
  return { uploadMode: "direct" as const, uploadUrl: data.signedUrl, imagePath: `supabase://${EVIDENCE_BUCKET}/${path}` };
}
