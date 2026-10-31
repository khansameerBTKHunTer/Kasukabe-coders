import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor, apiError } from "@/lib/auth/server";
import { geocodingAttribution, searchAddress } from "@/lib/geocoding";

export async function POST(request: NextRequest) {
  try {
    await requireActor(request);
    const parsed = z.object({ query: z.string().trim().min(3).max(200) })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Enter an address between 3 and 200 characters, including the area or city." },
        { status: 400 },
      );
    return NextResponse.json({
      results: await searchAddress(parsed.data.query),
      attribution: geocodingAttribution(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
