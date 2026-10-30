import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { ApiError, apiError } from "@/lib/auth/server";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const service = await getBackend(request);
    const body = await request.json();
    if (
      typeof body.imagePath !== "string" ||
      typeof body.description !== "string" ||
      body.description.trim().length < 5
    )
      throw new ApiError(
        400,
        "Upload a photo and describe the field evidence in at least 5 characters.",
      );
    const report = await service.addEvidence(
      (await params).id,
      body.imagePath,
      body.description.trim(),
    );
    return NextResponse.json({ success: true, report }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
