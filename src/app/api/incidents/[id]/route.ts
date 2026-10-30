import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PatchIncidentSchema = z.object({
  action: z.enum(['verify', 'override_priority']),
  verificationStatus: z.enum(['verified', 'flagged', 'rejected']).optional(),
  priorityScore: z.number().min(0).max(100).optional(),
  overrideReason: z.string().min(5).optional(),
  userId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const incident = await IncidentService.getIncidentById(id);
    if (!incident) {
      return NextResponse.json({ success: false, error: 'Incident not found' }, { status: 404 });
    }

    const activityLogs = await IncidentService.getActivityLogs(id);

    return NextResponse.json({
      success: true,
      incident,
      activityLogs,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const validated = PatchIncidentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: validated.error.format() },
        { status: 400 }
      );
    }

    const { action, verificationStatus, priorityScore, overrideReason, userId } = validated.data;

    if (action === 'verify') {
      if (!verificationStatus) {
        return NextResponse.json({ success: false, error: 'Missing verificationStatus' }, { status: 400 });
      }
      const updated = await IncidentService.verifyIncident(id, verificationStatus, userId);
      return NextResponse.json({ success: true, incident: updated });
    }

    if (action === 'override_priority') {
      if (priorityScore === undefined || !overrideReason) {
        return NextResponse.json(
          { success: false, error: 'Both priorityScore and overrideReason are required' },
          { status: 400 }
        );
      }
      const updated = await IncidentService.overridePriority(
        id,
        priorityScore,
        overrideReason,
        userId
      );
      return NextResponse.json({ success: true, incident: updated });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
