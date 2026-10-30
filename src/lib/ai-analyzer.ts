import { z } from 'zod';
import { AIAssessment, IncidentCategory, SeverityLevel } from '../types';

// Zod schema enforcing the structured AI output contract
export const AIAssessmentSchema = z.object({
  category: z.enum([
    'flood',
    'building_damage',
    'electrical_hazard',
    'fire',
    'landslide',
    'road_blockage',
    'medical_emergency',
    'other',
  ]),
  title: z.string().min(5).max(120),
  visible_damage: z.array(z.string()),
  secondary_hazards: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  confidence: z.number().min(0).max(1),
  recommended_departments: z.array(z.string()),
  life_risk_indicators: z.array(z.string()),
  critical_infrastructure_indicators: z.array(z.string()),
  uncertainties: z.array(z.string()),
  human_review_required: z.boolean(),
  summary: z.string().min(10).max(500),
});

export interface AnalyzeImageParams {
  imageBase64OrUrl: string;
  description: string;
  assistanceNeeded: string;
}

export interface AIAnalysisResult {
  success: boolean;
  assessment?: AIAssessment;
  error?: string;
  isConfigurationMissing?: boolean;
}

/**
 * Server-side AI Image Analysis using OpenRouter
 */
export async function analyzeDisasterImage(params: AnalyzeImageParams): Promise<AIAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      isConfigurationMissing: true,
      error: 'OPENROUTER_API_KEY is not configured in environment variables. Vision analysis is suspended; report is saved for manual control room triage.',
    };
  }

  const systemPrompt = `You are a specialized disaster damage assessment vision system assisting emergency control rooms.
Your role is DECISION SUPPORT ONLY. You must never fabricate certainty.
Safety Rules:
- Distinguish directly visible damage from inferred secondary hazards.
- DO NOT claim people are trapped merely because a building is damaged unless there is clear direct evidence in the photo.
- DO NOT assert fallen wires are live or de-energized; treat downed conductors as potential shock hazards with uncertainty.
- DO NOT claim a damaged structure is "safe".
- DO NOT claim this report is verified.
- You must output valid, pure JSON without markdown backticks or commentary matching the requested schema.`;

  const userPrompt = `Analyze this disaster photo and reporter context:
Description from reporter: "${params.description}"
Assistance requested: "${params.assistanceNeeded}"

Respond with ONLY a JSON object formatted strictly as follows:
{
  "category": "flood" | "building_damage" | "electrical_hazard" | "fire" | "landslide" | "road_blockage" | "medical_emergency" | "other",
  "title": "Short concise title (under 80 chars)",
  "visible_damage": ["observed damage 1", "observed damage 2"],
  "secondary_hazards": ["inferred hazard 1", "inferred hazard 2"],
  "severity": "critical" | "high" | "medium" | "low",
  "confidence": 0.85,
  "recommended_departments": ["Fire & Rescue", "Electricity Department", etc.],
  "life_risk_indicators": ["specific observations indicating human risk"],
  "critical_infrastructure_indicators": ["bridges", "power lines", "arterial roads", etc.],
  "uncertainties": ["aspects obscured by water/smoke/distance"],
  "human_review_required": true,
  "summary": "Objective two-sentence assessment of observed physical conditions."
}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {

    // Determine image payload
    let imageContent: any;
    if (params.imageBase64OrUrl.startsWith('data:')) {
      imageContent = {
        type: 'image_url',
        image_url: {
          url: params.imageBase64OrUrl,
        },
      };
    } else if (params.imageBase64OrUrl.startsWith('http://') || params.imageBase64OrUrl.startsWith('https://')) {
      imageContent = {
        type: 'image_url',
        image_url: {
          url: params.imageBase64OrUrl,
        },
      };
    } else {
      // Local path or simulated reference
      imageContent = {
        type: 'text',
        text: `[Image reference: ${params.imageBase64OrUrl}]`,
      };
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          imageContent,
        ],
      },
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Damage Mapper CIVISCOPE',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `OpenRouter API error (${response.status}): ${errorText.slice(0, 300)}`,
      };
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      return {
        success: false,
        error: 'OpenRouter returned an empty model response.',
      };
    }

    // Parse and validate with Zod
    let parsed: any;
    try {
      // Clean possible markdown code fences if model returned them
      const cleanJson = rawContent.replace(/```json\n?|\n?```/g, '').trim();
      parsed = JSON.parse(cleanJson);
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to parse AI output as JSON: ${e.message}`,
      };
    }

    const validated = AIAssessmentSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        success: false,
        error: `AI response failed schema validation: ${validated.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ')}`,
      };
    }

    return {
      success: true,
      assessment: validated.data as AIAssessment,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: 'AI analysis request timed out after 25 seconds.',
      };
    }
    return {
      success: false,
      error: `Network or runtime failure calling OpenRouter: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
