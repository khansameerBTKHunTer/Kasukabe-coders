import { test, expect, type Page } from "@playwright/test";
const photograph = {
  name: "incident.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
    "base64",
  ),
};
async function dropPin(page: Page) {
  const map = page.getByTestId("location-map-panel");
  await expect(
    page.locator(".location-map-canvas .leaflet-tile-pane"),
  ).toHaveCount(1);
  await map.click({ position: { x: 120, y: 150 } });
  await expect(page.locator(".incident-location-marker")).toHaveCount(1);
}
test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/session", {
    data: { email: "admin@civiscope.demo", password: "CiviscopeDemo!2026" },
  });
  await page.request.post("/api/seed/reset");
  await page.request.post("/api/demo/session", {
    data: { email: "citizen@civiscope.demo", password: "CiviscopeDemo!2026" },
  });
  await page.route("**/api/geocode", (route) =>
    route.fulfill({
      json: {
        address: "College Road, Lakshmipur, Bangladesh",
        approximate: true,
      },
    }),
  );
  // These regression tests never call the paid external AI provider.
  await page.route("**/api/ai/analyze", (route) =>
    route.fulfill(
      route.request().method() === "GET"
        ? { json: { configured: true, model: "gemini-3.5-flash-lite" } }
        : {
            status: 503,
            json: {
              success: false,
              error:
                "Analysis is unavailable for this test; type the details manually.",
            },
          },
    ),
  );
});
test("GPS refusal has map fallback; untouched center cannot submit; photo report can be tracked", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: unknown, error: (e: unknown) => void) =>
          error({ code: 1 }),
      },
      configurable: true,
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Incident photograph", { exact: true })
    .setInputFiles(photograph);
  await page
    .getByLabel("Visible damage", { exact: true })
    .fill("Flood water is blocking the pedestrian crossing.");
  await page
    .getByLabel("Assistance required", { exact: true })
    .fill("Please send a water pumping team.");
  await page
    .getByRole("button", { name: "Submit Emergency Report", exact: true })
    .last()
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Select the incident on the map",
  );
  await page.getByRole("button", { name: "Use live location" }).click();
  await expect(page.getByText(/Location permission denied/)).toBeVisible();
  await dropPin(page);
  await expect(page.getByTestId("selected-address")).toContainText(
    "College Road",
  );
  await page
    .getByRole("button", { name: "Submit Emergency Report", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Report received for triage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Track Submitted Reports/ }).click();
  await expect(
    page.getByText("Flood water is blocking the pedestrian crossing."),
  ).toBeVisible();
});
test("report failure keeps the photograph, description, and selected address", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Incident photograph", { exact: true })
    .setInputFiles(photograph);
  await page
    .getByLabel("Visible damage", { exact: true })
    .fill("A fallen pole is obstructing the road.");
  await page
    .getByLabel("Assistance required", { exact: true })
    .fill("Electrical isolation required.");
  await dropPin(page);
  await page.route("**/api/incidents", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: {
            success: false,
            error: "Temporary report service failure. Retry.",
          },
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Submit Emergency Report", exact: true })
    .last()
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Temporary report service failure",
  );
  await expect(page.getByLabel("Visible damage", { exact: true })).toHaveValue(
    "A fallen pole is obstructing the road.",
  );
  await expect(page.getByTestId("selected-address")).toContainText(
    "College Road",
  );
  await expect(
    page.getByAltText("Locally selected incident photograph"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Report received for triage" }),
  ).toHaveCount(0);
});
test("live device updates do not move a manually selected incident pin", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__watchStopped = false;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: (success: (position: unknown) => void) => {
          (window as any).__deviceUpdate = success;
          success({
            coords: { latitude: 22.94, longitude: 90.82, accuracy: 10 },
          });
          return 42;
        },
        clearWatch: () => {
          (window as any).__watchStopped = true;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use live location" }).click();
  await expect(page.getByTestId("device-location-status")).toContainText(
    "Device tracking active",
  );
  await dropPin(page);
  const pin = page.locator(".incident-location-marker");
  const prior = await pin.getAttribute("style");
  await page.evaluate(() => {
    (window as any).__deviceUpdate({
      coords: { latitude: 22.95, longitude: 90.83, accuracy: 20 },
    });
  });
  await expect(page.getByText(/accuracy about 20 m/)).toBeVisible();
  await expect(pin).toHaveAttribute("style", prior!);
  await page.getByRole("button", { name: "Stop live location" }).click();
  expect(
    await page.evaluate(() => (window as any).__watchStopped),
  ).toBeTruthy();
});
test("the map has real height, full-width layout, address selection and no coordinate inputs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  const main = await page.locator("main").boundingBox();
  expect(main!.width).toBeGreaterThan(1880);
  const panel = page.getByTestId("location-map-panel");
  const bounds = await panel.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(300);
  expect(bounds!.width).toBeLessThan(1920 * 0.28);
  expect(bounds!.width).toBeGreaterThan(300);
  await expect(
    page.getByLabel("Incident latitude", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Incident longitude", { exact: true }),
  ).toHaveCount(0);
  await dropPin(page);
  await expect(page.getByTestId("selected-address")).toContainText(
    "College Road",
  );
  await page.screenshot({
    path: "test-results/citizen-light-desktop.png",
    fullPage: true,
  });
});

test("address search pins the best match, offers alternatives and submits the chosen coordinates", async ({ page }) => {
  const matches = [
    { address: "Neelasandra, Bengaluru, Karnataka", lat: 12.9586, lng: 77.61495 },
    { address: "Rose Garden, Neelasandra, Bengaluru", lat: 12.9591, lng: 77.6152 },
  ];
  let searchCalls = 0;
  let reverseCalls = 0;
  const submissions: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/geocode")) reverseCalls++;
    if (request.url().endsWith("/api/incidents") && request.method() === "POST")
      submissions.push(request.postDataJSON());
  });
  await page.route("**/api/geocode/search", (route) => {
    searchCalls++;
    expect(route.request().postDataJSON()).toEqual({ query: "Neelasandra, Bengaluru" });
    return route.fulfill({ json: { results: matches } });
  });
  await page.goto("/");
  await expect(page.locator(".location-map-canvas .leaflet-tile-pane")).toHaveCount(1);
  const input = page.getByRole("searchbox", { name: "Search incident address" });
  await input.fill("Neelasandra, Bengaluru");
  expect(searchCalls).toBe(0);
  await input.press("Enter");
  await expect(page.getByTestId("selected-address")).toHaveText(matches[0].address);
  await expect(page.locator(".incident-location-marker")).toHaveCount(1);
  await expect(page.getByRole("button", { name: matches[0].address, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: matches[1].address, exact: true }).click();
  await expect(page.getByTestId("selected-address")).toHaveText(matches[1].address);
  expect(submissions).toHaveLength(0);
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.getByLabel("Incident photograph", { exact: true }).setInputFiles(photograph);
  await page.getByLabel("Visible damage", { exact: true }).fill("A fallen tree is blocking the road in Neelasandra.");
  await page.getByLabel("Assistance required", { exact: true }).fill("Send a crew to remove the tree safely.");
  await page.getByRole("button", { name: "Submit Emergency Report", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Report received for triage" })).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ incidentLatitude: matches[1].lat, incidentLongitude: matches[1].lng });
  expect(reverseCalls).toBe(0);
});

test("unmatched and failed address searches keep the existing pin on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/geocode/search", (route) =>
    route.request().postDataJSON().query === "Unknown place"
      ? route.fulfill({ json: { results: [] } })
      : route.fulfill({ status: 503, json: { error: "Address service is unavailable. Retry shortly." } }),
  );
  await page.goto("/");
  await dropPin(page);
  await expect(page.getByTestId("selected-address")).toContainText("College Road");
  const pin = page.locator(".incident-location-marker");
  const originalPosition = await pin.getAttribute("style");
  const input = page.getByRole("searchbox", { name: "Search incident address" });
  await input.fill("Unknown place");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/No address found/)).toBeVisible();
  await input.fill("Another place");
  await input.press("Enter");
  await expect(page.getByText("Address service is unavailable. Retry shortly.")).toBeVisible();
  await expect(pin).toHaveAttribute("style", originalPosition!);
  await expect(page.getByTestId("selected-address")).toContainText("College Road");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByRole("region", { name: "Incident location", exact: true }).screenshot({ path: "test-results/address-search-mobile.png" });
});

test("a delayed address match cannot override a manually dropped pin", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let finished!: () => void;
  const handled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/api/geocode/search", async (route) => {
    await pending;
    await route.fulfill({ json: { results: [
      { address: "Late search result, Bengaluru", lat: 12.9586, lng: 77.61495 },
    ] } });
    finished();
  });
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search incident address" }).fill("Bengaluru");
  const requested = page.waitForRequest("**/api/geocode/search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await requested;
  await dropPin(page);
  await expect(page.getByTestId("selected-address")).toContainText("College Road");
  const pin = page.locator(".incident-location-marker");
  const position = await pin.getAttribute("style");
  release();
  await handled;
  await expect(page.getByTestId("selected-address")).toContainText("College Road");
  await expect(pin).toHaveAttribute("style", position!);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
});
