import { NextRequest, NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';
import { analyzeDisasterImage } from '@/lib/ai-analyzer';
import { z } from 'zod';

const ReportSubmitSchema = z.object({
  imagePath: z.string().min(1, 'Image is required'),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  incidentLatitude: z.number().min(-90).max(90),
  incidentLongitude: z.number().min(-180).max(180),
  reporterLatitude: z.number().nullable().optional(),
  reporterLongitude: z.number().nullable().optional(),
  sourceType: z.enum(['on_site', 'field_report', 'news_public']),
  assistanceNeeded: z.string().trim().min(3, 'Assistance needed must be specified'),
  reportedPeopleAffected: z.number().int().nonnegative().nullable().optional(),
  immediateDanger: z.enum(['yes', 'no', 'unknown']),
  reporterId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const priority = searchParams.get('priority');
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');

    let incidents = await IncidentService.getIncidents();

    if (category && category !== 'all') {
      incidents = incidents.filter(i => i.category === category);
    }
    if (priority && priority !== 'all') {
      incidents = incidents.filter(i => i.priority_band.toLowerCase() === priority.toLowerCase());
    }
    if (status && status !== 'all') {
      incidents = incidents.filter(i => i.status === status);
    }
    if (departmentId && departmentId !== 'all') {
      incidents = incidents.filter(
        i => i.primary_department_id === departmentId || 
             i.assignments?.some(a => a.department_id === departmentId)
      );
    }

    return NextResponse.json({ success: true, incidents });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = ReportSubmitSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: validated.error.format() },
        { status: 400 }
      );
    }

    const {
      imagePath,
      description,
      incidentLatitude,
      incidentLongitude,
      reporterLatitude,
      reporterLongitude,
      sourceType,
      assistanceNeeded,
      reportedPeopleAffected,
      immediateDanger,
      reporterId,
    } = validated.data;

    // Run AI analysis if OpenRouter key is available
    let aiAssessment = null;
    let aiWarning: string | null = null;

    try {
      const aiResult = await analyzeDisasterImage({
        imageBase64OrUrl: imagePath,
        description,
        assistanceNeeded,
      });

      if (aiResult.success && aiResult.assessment) {
        aiAssessment = aiResult.assessment;
      } else {
        aiWarning = aiResult.error || 'AI visual assessment could not be generated; report preserved for manual inspection.';
      }
    } catch (e: any) {
      aiWarning = `AI analysis exception: ${e.message}`;
    }

    // Submit report, calculate deterministic priority, and check duplicates
    const result = await IncidentService.submitCitizenReport({
      imagePath,
      description,
      incidentLatitude,
      incidentLongitude,
      reporterLatitude,
      reporterLongitude,
      sourceType,
      assistanceNeeded,
      reportedPeopleAffected,
      immediateDanger,
      reporterId,
      aiAssessment,
    });

    return NextResponse.json(
      {
        success: true,
        report: result.report,
        incident: result.incident,
        duplicateCandidates: result.duplicateCandidates,
        priorityResult: result.priorityResult,
        aiAssessment,
        aiWarning,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
