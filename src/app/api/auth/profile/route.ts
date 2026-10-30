import { NextRequest, NextResponse } from "next/server";
import { apiError, requireActor } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    return NextResponse.json(
      { profile: actor.profile, demo: actor.demo },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
