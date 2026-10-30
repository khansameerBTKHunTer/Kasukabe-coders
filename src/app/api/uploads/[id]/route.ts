import { NextRequest } from "next/server";
import { ApiError, apiError, requireActor } from "@/lib/auth/server";
import { readDemoUpload } from "@/lib/uploads";
import { getStore } from "@/lib/data-store";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(request);
    if (!actor.demo) throw new ApiError(404, "Photograph not found.");
    const { id } = await params;
    const upload = await readDemoUpload(id);
    if (upload.owner !== actor.profile.id && actor.profile.role !== "admin") {
      const report = getStore().reports.find(
        (r) => r.image_path === `/api/uploads/${id}`,
      );
      if (
        !report ||
        !getStore().assignments.some(
          (a) =>
            a.incident_id === report.incident_id &&
            a.department_id === actor.profile.department_id,
        )
      )
        throw new ApiError(
          403,
          "This photograph is not available to your account.",
        );
    }
    return new Response(Buffer.from(upload.base64, "base64"), {
      headers: {
        "Content-Type": upload.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
