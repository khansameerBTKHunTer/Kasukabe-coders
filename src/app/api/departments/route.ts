import { NextResponse } from "next/server";
import { SEED_DEPARTMENTS } from "@/lib/data-store";
import { demoEnabled } from "@/lib/auth/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, apiError } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (demoEnabled())
      return NextResponse.json({
        success: true,
        departments: SEED_DEPARTMENTS,
      });
    const { data, error } = await createAdminClient()
      .from("departments")
      .select("id,name,code,capabilities");
    if (error)
      throw new ApiError(
        503,
        "Department setup is unavailable. Check the database migrations and server configuration.",
      );
    return NextResponse.json(
      { success: true, departments: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
