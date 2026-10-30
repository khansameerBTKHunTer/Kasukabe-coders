import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor, apiError } from "@/lib/auth/server";
import {
  analyzeUploadedPhoto,
  visionConfiguration,
} from "@/lib/image-analysis";
const Schema = z.object({
  imageBase64OrUrl: z.string().min(1),
  description: z.string().max(4000).default(""),
  assistanceNeeded: z.string().max(2000).default(""),
});
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireActor(request);
    return NextResponse.json(visionConfiguration(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(request);
    const body = Schema.safeParse(await request.json());
    if (!body.success)
      return NextResponse.json(
        { success: false, error: "Choose an uploaded photograph to analyze." },
        { status: 400 },
      );
    const result = await analyzeUploadedPhoto(
      actor,
      body.data.imageBase64OrUrl,
      body.data.description,
      body.data.assistanceNeeded,
    );
    const assessment = result.assessment;
    return NextResponse.json(
      {
        ...result,
        model: visionConfiguration().model,
        suggestions: assessment
          ? {
              description: assessment.summary,
              assistanceNeeded:
                assessment.assistance_required ||
                `Request ${assessment.recommended_departments.join(" and ") || "Control Room review"} for ${assessment.visible_damage.map((item) => item.replaceAll("_", " ")).join(", ") || assessment.category.replaceAll("_", " ")}.`,
            }
          : undefined,
      },
      {
        status: result.success
          ? 200
          : result.isConfigurationMissing
            ? 503
            : 502,
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
