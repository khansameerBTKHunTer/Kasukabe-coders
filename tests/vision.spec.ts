import { test, expect, type Route } from "@playwright/test";
const photo = {
  name: "damage.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
    "base64",
  ),
};
const assessment = {
  category: "building_damage",
  title: "Visible damaged exterior masonry",
  visible_damage: ["cracked masonry"],
  secondary_hazards: ["fallen_debris"],
  severity: "high",
  confidence: 0.82,
  recommended_departments: ["Fire & Rescue"],
  assistance_required:
    "Request Fire & Rescue to assess the damaged exterior and secure the immediate area.",
  life_risk_indicators: [],
  critical_infrastructure_indicators: [],
  uncertainties: ["Interior conditions cannot be confirmed."],
  human_review_required: true,
  summary:
    "Cracked exterior masonry and fallen debris are visible near the building entrance.",
};
const result = {
  success: true,
  model: "gemini-3.5-flash-lite",
  assessment,
  suggestions: {
    description: assessment.summary,
    assistanceNeeded: assessment.assistance_required,
  },
};
test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/session", {
    data: { email: "citizen@civiscope.demo", password: "CiviscopeDemo!2026" },
  });
  await page.route("**/api/ai/analyze", (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? { model: "gemini-3.5-flash-lite", configured: true }
          : result,
    }),
  );
  await page.route("**/api/geocode", (route) =>
    route.fulfill({ json: { address: "Fixture Road, Fixture Town" } }),
  );
});
test("selecting a photo automatically fills editable damage and assistance suggestions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Incident photograph", { exact: true })
    .setInputFiles(photo);
  await expect(page.getByLabel("Visible damage", { exact: true })).toHaveValue(
    assessment.summary,
  );
  await expect(
    page.getByLabel("Assistance required", { exact: true }),
  ).toHaveValue(assessment.assistance_required);
  await expect(page.getByText("82% confidence")).toBeVisible();
  await page
    .getByLabel("Visible damage", { exact: true })
    .fill("My edited observation from the scene.");
  await expect(page.getByLabel("Visible damage", { exact: true })).toHaveValue(
    "My edited observation from the scene.",
  );
});
test("late model responses never overwrite observations the citizen has typed", async ({
  page,
}) => {
  let pending: Route | undefined;
  await page.route("**/api/ai/analyze", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { configured: true, model: "gemini-3.5-flash-lite" },
      });
    pending = route;
  });
  await page.goto("/");
  await page
    .getByLabel("Incident photograph", { exact: true })
    .setInputFiles(photo);
  await expect.poll(() => Boolean(pending)).toBeTruthy();
  await page
    .getByLabel("Visible damage", { exact: true })
    .fill("An eyewitness observation typed while AI is loading.");
  await pending!.fulfill({ json: result });
  await expect(
    page.getByLabel("Assistance required", { exact: true }),
  ).toHaveValue(assessment.assistance_required);
  await expect(page.getByLabel("Visible damage", { exact: true })).toHaveValue(
    "An eyewitness observation typed while AI is loading.",
  );
});
test("the light login background loads locally and fills the page", async ({
  page,
}) => {
  await page.request.delete("/api/demo/session");
  await page.goto("/login");
  await expect(page.locator(".auth-screen")).toBeVisible();
  expect(
    await page
      .locator(".auth-screen")
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain("civiscope-city-background.webp");
  expect(
    (await page.request.get("/images/civiscope-city-background.webp")).ok(),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "test-results/login-light-desktop.png",
    fullPage: true,
  });
});
