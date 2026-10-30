import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';
import { z } from 'zod';

const AssignDepartmentSchema = z.object({
  departmentId: z.string().uuid(),
  assignedBy: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const validated = AssignDepartmentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: validated.error.format() },
        { status: 400 }
      );
    }

    const { departmentId, assignedBy, notes } = validated.data;
    const assignment = await IncidentService.assignDepartment(
      params.id,
      departmentId,
      assignedBy,
      notes
    );

    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
