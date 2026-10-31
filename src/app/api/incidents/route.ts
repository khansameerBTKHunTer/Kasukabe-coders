import { NextRequest, NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { apiError } from "@/lib/auth/server";
import { analyzeUploadedPhoto } from "@/lib/image-analysis";
import { z } from "zod";
export const maxDuration = 60;

const ReportSubmitSchema = z.object({
  imagePath: z.string().min(1, "Image is required").max(600),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters").max(4000),
  incidentLatitude: z.number().min(-90).max(90),
  incidentLongitude: z.number().min(-180).max(180),
  reporterLatitude: z.number().min(-90).max(90).nullable().optional(),
  reporterLongitude: z.number().min(-180).max(180).nullable().optional(),
  sourceType: z.enum(["on_site", "field_report", "news_public"]),
  assistanceNeeded: z
    .string()
    .trim()
    .min(3, "Assistance needed must be specified").max(2000),
  reportedPeopleAffected: z.number().int().nonnegative().nullable().optional(),
  immediateDanger: z.enum(["yes", "no", "unknown"]),
  reporterId: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const IncidentService = await getBackend(req);
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const status = searchParams.get("status");
    const departmentId = searchParams.get("departmentId");

    let incidents = await IncidentService.getIncidents();

    if (category && category !== "all") {
      incidents = incidents.filter((i) => i.category === category);
    }
    if (priority && priority !== "all") {
      incidents = incidents.filter(
        (i) => i.priority_band.toLowerCase() === priority.toLowerCase(),
      );
    }
    if (status && status !== "all") {
      incidents = incidents.filter((i) => i.status === status);
    }
    if (departmentId && departmentId !== "all") {
      incidents = incidents.filter(
        (i) =>
          i.primary_department_id === departmentId ||
          i.assignments?.some((a) => a.department_id === departmentId),
      );
    }

    return NextResponse.json({ success: true, incidents });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const IncidentService = await getBackend(req);
    const body = await req.json();
    const validated = ReportSubmitSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: validated.error.format(),
        },
        { status: 400 },
      );
    }

    const {
      imagePath,
      description,
      incidentLatitude,
      incidentLongitude,
      reporterLatitude,
      reporterLongitude,
      sourceType,
      assistanceNeeded,
      reportedPeopleAffected,
      immediateDanger,
      reporterId,
    } = validated.data;

    // Visual analysis is optional; clear report text can still route departments.
    let aiAssessment = null;
    let aiWarning: string | null = null;

    try {
      const aiResult = await analyzeUploadedPhoto(
        IncidentService.actor,
        imagePath,
        description,
        assistanceNeeded,
      );

      if (aiResult.success && aiResult.assessment) {
        aiAssessment = aiResult.assessment;
      } else {
        aiWarning =
          aiResult.error ||
          "AI visual assessment could not be generated; report preserved for manual inspection.";
      }
    } catch {
      aiWarning = "Photo analysis is unavailable. Your reported observations will still be used for department routing.";
    }

    // Submit report, calculate deterministic priority, and check duplicates
    const result = await IncidentService.submitCitizenReport({
      imagePath,
      description,
      incidentLatitude,
      incidentLongitude,
      reporterLatitude,
      reporterLongitude,
      sourceType,
      assistanceNeeded,
      reportedPeopleAffected,
      immediateDanger,
      reporterId,
      aiAssessment,
    });

    return NextResponse.json(
      {
        success: true,
        report: result.report,
        incident: result.incident,
        duplicateCandidates: result.duplicateCandidates,
        priorityResult: result.priorityResult,
        aiAssessment,
        aiWarning,
      },
      { status: 201 },
    );
  } catch (err: any) {
    return apiError(err);
  }
}
