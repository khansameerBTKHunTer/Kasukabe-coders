import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';
import { z } from 'zod';

const UpdateAssignmentSchema = z.object({
  action: z.enum(['acknowledge', 'update_status']),
  status: z.enum(['in_progress', 'resolved', 'rejected']).optional(),
  notes: z.string().optional(),
  userId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = UpdateAssignmentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: validated.error.format() },
        { status: 400 }
      );
    }

    const { action, status, notes, userId } = validated.data;

    if (action === 'acknowledge') {
      const assignment = await IncidentService.acknowledgeAssignment(id, userId);
      return NextResponse.json({ success: true, assignment });
    }

    if (action === 'update_status') {
      if (!status) {
        return NextResponse.json({ success: false, error: 'Missing status' }, { status: 400 });
      }
      const assignment = await IncidentService.updateResponseStatus(id, status, notes, userId);
      return NextResponse.json({ success: true, assignment });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
