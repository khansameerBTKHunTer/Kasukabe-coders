import { NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';
import { generateSitRep } from '@/lib/sitrep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Capture the current service state before rendering; never reuse a cached PDF.
    const [incidents, stats, activityLogs] = await Promise.all([
      IncidentService.getIncidents(),
      IncidentService.getStatistics(),
      IncidentService.getActivityLogs(),
    ]);
    const snapshot = structuredClone({ generatedAt: new Date().toISOString(), incidents, stats, activityLogs });
    const pdf = generateSitRep(snapshot);
    const filename = `CIVISCOPE-SitRep-${snapshot.generatedAt.replace(/[:.]/g, '-')}.pdf`;
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('SitRep generation failed', error);
    return NextResponse.json({ success: false, error: 'Unable to generate situation report. Please retry.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
