import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { analyzeDisasterImage } from "../src/lib/ai-analyzer";
import { POST, GET } from "../src/app/api/ai/analyze/route";
import { POST as submit } from "../src/app/api/incidents/route";
import { createDemoToken } from "../src/lib/auth/demo";
import { SEED_PROFILES, resetStore } from "../src/lib/data-store";
import { savePhoto } from "../src/lib/uploads";
import { reverseGeocode } from "../src/lib/geocoding";
const fixture = {
  category: "building_damage",
  title: "Observed damaged exterior wall",
  visible_damage: ["cracked masonry", "fallen exterior debris"],
  secondary_hazards: ["unstable_debris"],
  severity: "high",
  confidence: 0.82,
  recommended_departments: ["Fire & Rescue"],
  assistance_required:
    "Request Fire & Rescue to assess the damaged facade and keep pedestrians away from fallen debris.",
  life_risk_indicators: [],
  critical_infrastructure_indicators: [],
  uncertainties: ["Interior conditions are not visible."],
  human_review_required: true,
  summary:
    "The photograph shows cracked exterior masonry and fallen debris beside the building. Interior conditions cannot be confirmed.",
};
async function main() {
  process.env.CIVISCOPE_DEMO_MODE = "true";
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "test-only-key";
  process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
  const original = globalThis.fetch;
  let calls = 0;
  let mode = "success";
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://openrouter.ai/api/v1/chat/completions",
    );
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, "google/gemini-2.5-flash");
    assert.equal(payload.messages[1].content[1].type, "image_url");
    if (mode === "credits")
      return new Response("private provider debug details", { status: 402 });
    if (mode === "invalid")
      return Response.json({
        choices: [{ message: { content: '{"made_up":true}' } }],
      });
    return Response.json({
      choices: [{ message: { content: JSON.stringify(fixture) } }],
    });
  };
  const profile = SEED_PROFILES[3];
  const photo = await savePhoto(
    { profile, demo: true, client: null },
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      "test.png",
      { type: "image/png" },
    ),
  );
  const request = (path: string, body?: unknown) =>
    new NextRequest(`http://localhost${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: `civiscope_demo=${createDemoToken(profile.id)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    const metadata = await GET(request("/api/ai/analyze"));
    const config = await metadata.json();
    assert.equal(config.configured, true);
    assert.equal(config.model, "google/gemini-2.5-flash");
    assert.ok(!JSON.stringify(config).includes("test-only-key"));
    const analyzed = await POST(
      request("/api/ai/analyze", { imageBase64OrUrl: photo.imagePath }),
    );
    assert.equal(analyzed.status, 200);
    const data = await analyzed.json();
    assert.equal(data.suggestions.description, fixture.summary);
    assert.equal(
      data.suggestions.assistanceNeeded,
      fixture.assistance_required,
    );
    await POST(
      request("/api/ai/analyze", { imageBase64OrUrl: photo.imagePath }),
    );
    assert.equal(calls, 1, "Same photo analysis must be cached");
    const received = await submit(
      request("/api/incidents", {
        imagePath: photo.imagePath,
        description: fixture.summary,
        assistanceNeeded: fixture.assistance_required,
        incidentLatitude: 0,
        incidentLongitude: 0,
        reporterLatitude: 0,
        reporterLongitude: 0,
        sourceType: "on_site",
        immediateDanger: "unknown",
      }),
    );
    assert.equal(received.status, 201);
    const saved = await received.json();
    assert.equal(saved.aiAssessment.category, "building_damage");
    assert.equal(saved.report.reporter_latitude, 0);
    assert.equal(
      calls,
      1,
      "Submitting the analyzed photo must reuse the validated assessment",
    );
    mode = "credits";
    const credits = await analyzeDisasterImage({
      imageBase64OrUrl: "data:image/png;base64,test",
      description: "",
      assistanceNeeded: "",
    });
    assert.equal(credits.success, false);
    assert.match(credits.error!, /insufficient credits/);
    assert.ok(!credits.error!.includes("debug"));
    mode = "invalid";
    assert.equal(
      (
        await analyzeDisasterImage({
          imageBase64OrUrl: "data:image/png;base64,test",
          description: "",
          assistanceNeeded: "",
        })
      ).success,
      false,
    );
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-google-only";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      );
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-google-only",
      );
      const body = JSON.parse(String(init?.body));
      assert.equal(body.contents[0].parts[1].inlineData.mimeType, "image/png");
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      return Response.json({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(fixture) }] } },
        ],
      });
    };
    const native = await analyzeDisasterImage({
      imageBase64OrUrl: "data:image/png;base64,dGVzdA==",
      description: "",
      assistanceNeeded: "",
    });
    assert.equal(native.success, true);
    assert.equal(
      native.assessment?.assistance_required,
      fixture.assistance_required,
    );
    const times: number[] = [];
    globalThis.fetch = async (_input, init) => {
      assert.ok(
        new Headers(init?.headers).get("User-Agent")?.includes("CIVISCOPE"),
      );
      times.push(Date.now());
      return Response.json({ display_name: "Fixture Street, Fixture Town" });
    };
    assert.equal(
      await reverseGeocode(12.12345, 77.12345),
      "Fixture Street, Fixture Town",
    );
    await reverseGeocode(12.12345, 77.12345);
    assert.equal(
      times.length,
      1,
      "Repeated address lookups must use the cache",
    );
    await reverseGeocode(12.12346, 77.12346);
    assert.ok(
      times[1] - times[0] >= 1000,
      "Public geocoding must stay below one request per second",
    );
    console.log(
      "Vision and address tests passed: Gemini and OpenRouter image input, editable suggestions, cached submit, error sanitization, address cache and request spacing. External requests were mocked.",
    );
  } finally {
    globalThis.fetch = original;
    resetStore();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
