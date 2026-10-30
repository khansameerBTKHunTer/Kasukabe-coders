import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";
import { z } from "zod";

const DuplicateActionSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  reportId: z.string(),
  targetIncidentId: z.string().optional(),
  actorId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const IncidentService = await getBackend(req, true);
    const body = await req.json();
    const validated = DuplicateActionSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: validated.error.format(),
        },
        { status: 400 },
      );
    }

    const { action, reportId, targetIncidentId, actorId } = validated.data;

    if (action === "confirm") {
      if (!targetIncidentId) {
        return NextResponse.json(
          {
            success: false,
            error: "targetIncidentId is required to confirm duplicate",
          },
          { status: 400 },
        );
      }
      const incident = await IncidentService.confirmDuplicate(
        reportId,
        targetIncidentId,
      );
      return NextResponse.json({
        success: true,
        incident,
        message: "Duplicate confirmed and merged into incident.",
      });
    }

    if (action === "reject") {
      await IncidentService.keepSeparate(reportId);
      return NextResponse.json({
        success: true,
        message: "Report retained as a distinct incident.",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid duplicate action" },
      { status: 400 },
    );
  } catch (err: any) {
    return apiError(err);
  }
}
