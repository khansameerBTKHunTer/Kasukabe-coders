import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, requireActor } from "@/lib/auth/server";
import { savePhoto } from "@/lib/uploads";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    if (Number(request.headers.get("content-length") ?? 0) > 9 * 1024 * 1024)
      throw new ApiError(413, "Photograph exceeds the 8 MB limit.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApiError(400, "Choose an incident photograph.");
    return NextResponse.json(
      { success: true, ...(await savePhoto(actor, file)) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
