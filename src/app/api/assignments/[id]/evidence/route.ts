import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { ApiError, apiError } from "@/lib/auth/server";
import { z } from "zod";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const service = await getBackend(request);
    const input = z.object({ imagePath: z.string().min(1).max(600), description: z.string().trim().min(5).max(4000) }).safeParse(await request.json());
    if (!input.success)
      throw new ApiError(
        400,
        "Upload a photo and describe the field evidence in at least 5 characters.",
      );
    const report = await service.addEvidence(
      (await params).id,
      input.data.imagePath,
      input.data.description,
    );
    return NextResponse.json({ success: true, report }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
