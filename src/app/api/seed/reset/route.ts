import { NextRequest, NextResponse } from "next/server";
import { resetStore } from "@/lib/data-store";
import { ApiError, apiError, requireActor } from "@/lib/auth/server";
import { withHostedDemo } from "@/lib/hosted-demo";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(request, true);
    if (!actor.demo)
      throw new ApiError(403, "Reset is only available in the isolated demo.");
    await withHostedDemo(async () => { resetStore(); });
    return NextResponse.json({
      success: true,
      message: "Fictional demo scenario reset.",
    });
  } catch (error) {
    return apiError(error);
  }
}
