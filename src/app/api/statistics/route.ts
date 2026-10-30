import { NextResponse } from 'next/server';
import { IncidentService } from '@/lib/data-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stats = await IncidentService.getStatistics();
    return NextResponse.json({ success: true, stats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
