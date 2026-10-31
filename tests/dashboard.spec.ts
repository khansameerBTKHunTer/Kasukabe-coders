import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/demo/session", {
    data: { email, password: "1234" },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
}
test.beforeEach(async ({ request, page }) => {
  await page.route("**/api/geocode", (route) =>
    route.fulfill({
      json: { address: "College Road, Lakshmipur, Bangladesh" },
    }),
  );
  const login = await request.post("/api/demo/session", {
    data: { email: "admin@civiscope.demo", password: "1234" },
  });
  expect(
    login.ok(),
    "Run browser tests against CIVISCOPE_DEMO_MODE=true",
  ).toBeTruthy();
  await request.post("/api/seed/reset");
  const browserLogin = await page.request.post("/api/demo/session", {
    data: { email: "admin@civiscope.demo", password: "1234" },
  });
  expect(browserLogin.ok()).toBeTruthy();
});

for (const width of [375, 768, 1440]) {
  test(`Dashboard and responder/citizen portals fit at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Open incident:/ }),
    ).toHaveCount(4);
    await expect(page.locator(".custom-incident-marker")).toHaveCount(4);
    const fits = async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    };
    await fits();
    await page.screenshot({
      path: `test-results/control-room-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: /Open incident:/ })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Close incident details" }),
    ).toBeVisible();
    await fits();
    await loginAs(page, "fire@civiscope.demo");
    await expect(
      page.getByRole("heading", { name: "Fire & Emergency Services" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open incident:/ }),
    ).toHaveCount(1);
    await fits();
    await page.getByRole("button", { name: /Open incident:/ }).click();
    await loginAs(page, "power@civiscope.demo");
    await expect(
      page.getByRole("button", { name: "Close incident details" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Open incident:/ }),
    ).toHaveCount(1);
    await fits();
    await loginAs(page, "municipal@civiscope.demo");
    await expect(
      page.getByRole("heading", { name: /Municipal \/ Panchayat & Public Works/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open incident:/ }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /Open incident:.*Station Road North/ }),
    ).toHaveCount(0);
    await fits();
    await loginAs(page, "medical@civiscope.demo");
    await expect(
      page.getByRole("heading", { name: /Health Department & Emergency Medical Services/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open incident:/ }),
    ).toHaveCount(0);
    await fits();
    await loginAs(page, "citizen@civiscope.demo");
    await expect(
      page.getByRole("heading", { name: "Report an incident" }),
    ).toBeVisible();
    const mapPanel = page.getByTestId("location-map-panel");
    await expect(
      page.locator(".location-map-canvas .leaflet-tile-pane"),
    ).toHaveCount(1);
    await mapPanel.scrollIntoViewIfNeeded();
    const bounds = await mapPanel.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(300);
    if (width >= 1200) expect(bounds!.width).toBeLessThan(width * 0.3);
    await mapPanel.click({ position: { x: 120, y: 150 } });
    await expect(page.locator(".incident-location-marker")).toHaveCount(1);
    await fits();
    await page.getByRole("button", { name: /Track Submitted Reports/ }).click();
    await fits();
    expect(errors).toEqual([]);
  });
}

test("Filters, map selection, activity refresh and PDF download work", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.getByRole("button", { name: /Open incident:/ });
  await expect(cards).toHaveCount(4);
  await page
    .getByRole("combobox", { name: "Category filter" })
    .selectOption("electrical_hazard");
  await expect(cards).toHaveCount(1);
  await expect(page.locator(".custom-incident-marker")).toHaveCount(1);
  await cards.click();
  await page.getByRole("button", { name: "Flag for Triage" }).click();
  await expect(
    page.getByText("Verification status updated by Control Room Admin"),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SitRep PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^CIVISCOPE-SitRep-.*\.pdf$/,
  );
});

test("Production KPIs reflect an incident priority change", async ({
  request,
}) => {
  const list = await (await request.get("/api/incidents")).json();
  const low = list.incidents.find(
    (incident: { priority_band: string }) =>
      incident.priority_band === "Medium",
  );
  await request.patch(`/api/incidents/${low.id}`, {
    data: {
      action: "override_priority",
      priorityScore: 99,
      overrideReason: "Browser regression check",
    },
  });
  const stats = await (await request.get("/api/statistics")).json();
  expect(stats.stats.critical).toBe(3);
});

test("Load failures are visible and Refresh recovers", async ({ page }) => {
  await page.route("**/api/incidents", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"success":false}',
    }),
  );
  await page.goto("/");
  await expect(page.locator('p[role="alert"]')).toContainText("Unable to load");
  await page.unroute("**/api/incidents");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Open incident:/ }),
  ).toHaveCount(4);
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});

test("Map markers explain all priority bands and support keyboard selection", async ({ page, request }) => {
  const payload = await (await request.get("/api/incidents")).json();
  payload.incidents = payload.incidents.map((incident: object, index: number) => ({
    ...incident,
    priority_band: ["Critical", "High", "Medium", "Low"][index],
    priority_score: [95, 70, 45, 10][index],
  }));
  await page.route("**/api/incidents", route => route.fulfill({ json: payload }));
  await page.goto("/");
  for (const band of ["Critical", "High", "Medium", "Low"]) {
    await expect(page.locator(`.priority-map-marker[data-priority="${band}"] .priority-marker-label`)).toHaveText(band);
    await expect(page.getByRole("button", { name: new RegExp(`^${band} priority:`) })).toHaveCount(1);
  }
  const critical = page.getByRole("button", { name: /^Critical priority:/ });
  await critical.focus();
  await critical.press("Enter");
  await expect(page.getByRole("button", { name: "Close incident details" })).toBeVisible();
  await expect(page.locator('.priority-critical.is-selected')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Critical priority:/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close incident details" }).click();
  const high = page.getByRole("button", { name: /^High priority:/ });
  await high.focus();
  await high.press("Space");
  await expect(page.locator('.priority-high.is-selected')).toHaveCount(1);
});

test("Priority changes update map labels and invalid coordinates do not crash the map", async ({ page, request }) => {
  const payload = await (await request.get("/api/incidents")).json();
  const incident = payload.incidents.find((item: { priority_band: string }) => item.priority_band === "Medium");
  await page.goto("/");
  await expect(page.locator('.priority-map-marker[data-priority="Medium"]')).toHaveCount(1);
  const changed = await request.patch(`/api/incidents/${incident.id}`, { data: {
    action: "override_priority", priorityScore: 99, overrideReason: "Map priority regression test",
  } });
  expect(changed.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator('.priority-map-marker[data-priority="Critical"]')).toHaveCount(3);
  await expect(page.locator('.priority-map-marker[data-priority="Medium"]')).toHaveCount(0);
  payload.incidents[0].latitude = 1000;
  await page.route("**/api/incidents", route => route.fulfill({ json: payload }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "invalid coordinates" })).toBeVisible();
  await expect(page.locator('.custom-incident-marker')).toHaveCount(3);
});

test("Map tile failures keep a visible warning and successful tile loading clears it", async ({ page }) => {
  let failTiles = true;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64");
  await page.route(/https:\/\/[abc]\.tile\.openstreetmap\.org\//, route => failTiles
    ? route.abort()
    : route.fulfill({ contentType: "image/png", body: png }));
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Map tiles are unavailable" })).toBeVisible();
  await expect(page.locator('.custom-incident-marker')).toHaveCount(4);
  failTiles = false;
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Map tiles are unavailable" })).toHaveCount(0);
});
