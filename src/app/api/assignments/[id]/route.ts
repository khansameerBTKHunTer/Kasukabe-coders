import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";
import { z } from "zod";

const UpdateAssignmentSchema = z.object({
  action: z.enum(["acknowledge", "update_status", "review_response"]),
  decision: z.enum(["verified", "rework"]).optional(),
  status: z
    .enum(["en_route", "on_site", "in_progress", "resolved", "rejected"])
    .optional(),
  notes: z.string().optional(),
  userId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const IncidentService = await getBackend(req);
    const { id } = await params;
    const body = await req.json();
    const validated = UpdateAssignmentSchema.safeParse(body);

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

    const { action, status, notes, decision } = validated.data;

    if (action === "review_response") {
      if (!decision || !notes) return NextResponse.json({ success: false, error: "Provide a review decision and notes." }, { status: 400 });
      const assignment = await IncidentService.reviewResponse(id, decision, notes);
      return NextResponse.json({ success: true, assignment });
    }

    if (action === "acknowledge") {
      const assignment = await IncidentService.acknowledgeAssignment(id);
      return NextResponse.json({ success: true, assignment });
    }

    if (action === "update_status") {
      if (!status) {
        return NextResponse.json(
          { success: false, error: "Missing status" },
          { status: 400 },
        );
      }
      const assignment = await IncidentService.updateResponseStatus(
        id,
        status,
        notes,
      );
      return NextResponse.json({ success: true, assignment });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 },
    );
  } catch (err: any) {
    return apiError(err);
  }
}
