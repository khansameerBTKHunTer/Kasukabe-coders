import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { SEED_PROFILES } from "@/lib/data-store";

export const DEMO_COOKIE = "civiscope_demo";
const state = globalThis as typeof globalThis & {
  civiscopeDemoSecret?: string;
};
function secret() {
  return (state.civiscopeDemoSecret ??= randomBytes(32).toString("hex"));
}
export function demoEnabled() {
  return process.env.CIVISCOPE_DEMO_MODE === "true";
}
export function createDemoToken(id: string) {
  const payload = Buffer.from(
    JSON.stringify({ id, exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export function readDemoProfile(request: Request) {
  if (!demoEnabled()) return null;
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(DEMO_COOKIE + "="))
    ?.slice(DEMO_COOKIE.length + 1);
  if (!token) return null;
  try {
    const [payload, signature] = token.split(".");
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed.exp !== "number" || parsed.exp <= Date.now()) return null;
    return SEED_PROFILES.find((profile) => profile.id === parsed.id) ?? null;
  } catch {
    return null;
  }
}
