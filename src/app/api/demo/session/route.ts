import { NextRequest, NextResponse } from "next/server";
import {
  createDemoToken,
  DEMO_COOKIE,
  DEMO_PASSWORD,
  demoEnabled,
  readDemoProfile,
} from "@/lib/auth/demo";
import { SEED_PROFILES } from "@/lib/data-store";
import { apiError, assertSameOrigin } from "@/lib/auth/server";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { enabled: demoEnabled(), profile: readDemoProfile(request) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!demoEnabled())
      return NextResponse.json(
        {
          error:
            "Demo login is disabled. Start the app with CIVISCOPE_DEMO_MODE=true to use isolated fictional data.",
        },
        { status: 403 },
      );
    const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Enter a valid demo email and password." }, { status: 400 });
    const { email, password } = input.data;
    const profile = SEED_PROFILES.find(
      (p) => p.email === String(email).trim().toLowerCase(),
    );
    if (!profile || password !== DEMO_PASSWORD)
      return NextResponse.json(
        { error: "Incorrect demo email or password." },
        { status: 401 },
      );
    const response = NextResponse.json({ profile, demo: true });
    response.cookies.set(DEMO_COOKIE, createDemoToken(profile.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ success: true });
    response.cookies.set(DEMO_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
