import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { demoEnabled, readDemoProfile } from "./demo";
import { profileAccessError } from "./roles";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export interface Actor {
  profile: Profile;
  demo: boolean;
  client: SupabaseClient | null;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, "Request origin is not permitted.");
}
export async function requireActor(
  request: Request,
  adminOnly = false,
): Promise<Actor> {
  if (!["GET", "HEAD"].includes(request.method)) assertSameOrigin(request);
  let profile: Profile;
  let client: SupabaseClient | null = null;
  if (demoEnabled()) {
    const found = readDemoProfile(request);
    if (!found) throw new ApiError(401, "Sign in to a demo account first.");
    profile = found;
  } else {
    client = await createServerSupabaseClient();
    if (!client) throw new ApiError(503, "Supabase is not configured.");
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      throw new ApiError(401, "Your session has expired. Sign in again.");
    const result = await client
      .from("profiles")
      .select("*, department:departments(*)")
      .eq("id", data.user.id)
      .maybeSingle();
    if (result.error)
      throw new ApiError(
        result.error.code === "42501" ? 403 : 503,
        "Unable to retrieve your profile. Check profile permissions and retry.",
        "PROFILE_ERROR",
      );
    if (!result.data) {
      // Distinguish a missing Auth-linked profile from an RLS-hidden row.
      // The privileged lookup is restricted to this already verified user's ID.
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const lookup = await createAdminClient()
        .from("profiles")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();
      if (lookup.error)
        throw new ApiError(
          503,
          "Unable to check profile provisioning. Retry or contact the project administrator.",
          "PROFILE_ERROR",
        );
      if (lookup.data)
        throw new ApiError(
          403,
          "Your profile exists, but profile permissions prevent access. Contact the project administrator.",
          "PROFILE_ERROR",
        );
      throw new ApiError(
        404,
        "Your account exists, but its profile is missing. Ask the project administrator to check profile provisioning.",
        "PROFILE_MISSING",
      );
    }
    profile = result.data as Profile;
    if (profile.id !== data.user.id)
      throw new ApiError(403, "Profile identity does not match your account.");
  }
  const accessError = profileAccessError(profile);
  if (accessError) throw new ApiError(403, accessError, "PROFILE_ACCESS");
  if (adminOnly && profile.role !== "admin")
    throw new ApiError(403, "Control Room access is required.");
  return { profile, demo: demoEnabled(), client };
}
export function apiError(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "API operation failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return NextResponse.json(
    {
      success: false,
      error: "The operation could not be completed. Please retry.",
    },
    { status: 500 },
  );
}
