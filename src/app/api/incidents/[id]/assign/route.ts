import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";
import { z } from "zod";

const AssignDepartmentSchema = z.object({
  // Seed departments use UUID-shaped identifiers without RFC version bits.
  departmentId: z.guid(),
  assignedBy: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const IncidentService = await getBackend(req, true);
    const { id } = await params;
    const body = await req.json();
    const validated = AssignDepartmentSchema.safeParse(body);

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

    const { departmentId, assignedBy, notes } = validated.data;
    const assignment = await IncidentService.assignDepartment(
      id,
      departmentId,
      assignedBy,
      notes,
    );

    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (err: any) {
    return apiError(err);
  }
}
