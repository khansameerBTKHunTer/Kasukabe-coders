import { createHash } from "node:crypto";
import type { Actor } from "@/lib/auth/server";
import { ApiError } from "@/lib/auth/server";
import {
  analyzeDisasterImage,
  getVisionConfiguration,
  type AIAnalysisResult,
} from "@/lib/ai-analyzer";
import { validatePhoto, EVIDENCE_BUCKET } from "@/lib/backend";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDemoUpload } from "@/lib/uploads";

export const visionConfiguration = getVisionConfiguration;

const state = globalThis as typeof globalThis & {
  civiscopeVision?: {
    cache: Map<string, { expires: number; result: AIAnalysisResult }>;
    pending: Map<string, Promise<AIAnalysisResult>>;
    requests: Map<string, number[]>;
  };
};
const shared = (): NonNullable<typeof state.civiscopeVision> =>
  (state.civiscopeVision ??= {
    cache: new Map(),
    pending: new Map(),
    requests: new Map(),
  });

export async function analyzeUploadedPhoto(
  actor: Actor,
  imagePath: string,
  description = "",
  assistanceNeeded = "",
): Promise<AIAnalysisResult> {
  await validatePhoto(actor, imagePath);
  if (!visionConfiguration().configured)
    return {
      success: false,
      isConfigurationMissing: true,
      error:
        "Photo analysis is unavailable because the server vision API key is not configured. You can still type the damage and assistance details.",
    };
  const key = createHash("sha256")
    .update(
      `${actor.profile.id}:${imagePath}:${visionConfiguration().provider}:${visionConfiguration().model}`,
    )
    .digest("hex");
  const s = shared();
  const cached = s.cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const existing = s.pending.get(key);
  if (existing) return existing;
  const recent = (s.requests.get(actor.profile.id) ?? []).filter(
    (time) => time > Date.now() - 3600_000,
  );
  if (recent.length >= 20)
    throw new ApiError(
      429,
      "The photo-analysis limit for this account has been reached. Continue with manual details or retry later.",
    );
  recent.push(Date.now());
  s.requests.set(actor.profile.id, recent);
  const pending = (async () => {
    const upload = actor.demo
      ? await readDemoUpload(imagePath.split("/").pop()!)
      : null;
    let image: string;
    if (upload) image = `data:${upload.type};base64,${upload.base64}`;
    else {
      const key = imagePath.slice(`supabase://${EVIDENCE_BUCKET}/`.length);
      const downloaded = await createAdminClient()
        .storage.from(EVIDENCE_BUCKET)
        .download(key);
      if (downloaded.error || !downloaded.data)
        return {
          success: false,
          error:
            "The uploaded photograph could not be read. Upload it again or continue manually.",
        };
      image = `data:${downloaded.data.type};base64,${Buffer.from(await downloaded.data.arrayBuffer()).toString("base64")}`;
    }
    if (!image)
      return {
        success: false,
        error:
          "The uploaded photograph could not be opened for analysis. Upload it again or continue with manual details.",
      };
    const result = await analyzeDisasterImage({
      imageBase64OrUrl: image,
      description,
      assistanceNeeded,
    });
    if (result.success) {
      if (s.cache.size >= 100) s.cache.delete(s.cache.keys().next().value!);
      s.cache.set(key, { expires: Date.now() + 15 * 60_000, result });
    }
    return result;
  })();
  s.pending.set(key, pending);
  try {
    return await pending;
  } finally {
    s.pending.delete(key);
  }
}
