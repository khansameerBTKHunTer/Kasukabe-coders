import { NextRequest, NextResponse } from 'next/server';
import { analyzeDisasterImage } from '@/lib/ai-analyzer';
import { z } from 'zod';

const AnalyzeRequestSchema = z.object({
  imageBase64OrUrl: z.string().min(1),
  description: z.string().min(5),
  assistanceNeeded: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = AnalyzeRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: validated.error.format() },
        { status: 400 }
      );
    }

    const result = await analyzeDisasterImage(validated.data);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
