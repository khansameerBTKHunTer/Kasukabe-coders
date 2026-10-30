import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const backend = await getBackend(request, true);
    const input = z.object({ notes: z.string().trim().min(10).max(2000) }).safeParse(await request.json());
    if (!input.success) return NextResponse.json({ success: false, error: "Explain the routing decision using at least 10 characters." }, { status: 400 });
    const { id } = await params;
    return NextResponse.json({ success: true, incident: await backend.reviewRouting(id, input.data.notes) });
  } catch (error) { return apiError(error); }
}
