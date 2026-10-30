import { NextResponse } from 'next/server';
import { SEED_DEPARTMENTS } from '@/lib/data-store';

export async function GET() {
  return NextResponse.json({ success: true, departments: SEED_DEPARTMENTS });
}
