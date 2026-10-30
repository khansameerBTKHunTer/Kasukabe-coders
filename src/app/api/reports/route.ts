import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      {
        success: true,
        reports: await (await getBackend(request)).getReports(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
