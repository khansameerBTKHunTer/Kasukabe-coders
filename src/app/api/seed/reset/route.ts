import { NextResponse } from 'next/server';
import { resetStore } from '@/lib/data-store';

export async function POST() {
  try {
    resetStore();
    return NextResponse.json({
      success: true,
      message: 'Lakshmipur simulated disaster scenario successfully reset (6 reports, 4 distinct incidents).',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
