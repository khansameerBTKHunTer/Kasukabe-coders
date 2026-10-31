import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor, apiError } from "@/lib/auth/server";
import { geocodingAttribution, reverseGeocode } from "@/lib/geocoding";
export async function POST(request: NextRequest) {
  try {
    await requireActor(request);
    const parsed = z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lng: z.number().finite().min(-180).max(180),
      })
      .safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Select a valid incident pin on the map." },
        { status: 400 },
      );
    return NextResponse.json({
      address: await reverseGeocode(parsed.data.lat, parsed.data.lng),
      attribution: geocodingAttribution(),
      approximate: true,
    });
  } catch (error) {
    return apiError(error);
  }
}
