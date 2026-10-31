import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, requireActor } from "@/lib/auth/server";
import { signedPhoto, validatePhoto } from "@/lib/backend";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    const body = await request.json();
    if (!body || typeof body.imagePath !== "string") throw new ApiError(400, "Choose an uploaded photograph.");
    await validatePhoto(actor, body.imagePath);
    return NextResponse.json({ success: true, imagePath: body.imagePath,
      previewUrl: await signedPhoto(body.imagePath), storage: actor.demo ? "temporary-demo" : "supabase" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
