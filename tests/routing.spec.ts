import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, name: string) {
  expect((await page.request.post("/api/demo/session", { data: { email: `${name}@civiscope.demo`, password: "1234" } })).ok()).toBeTruthy();
  await page.goto("/");
}

test("a citizen fire report reaches Fire without AI or an admin assigning it", async ({ page }) => {
  await login(page, "admin");
  expect((await page.request.post("/api/seed/reset")).ok()).toBeTruthy();
  await login(page, "citizen");
  await page.route("**/api/geocode/search", route => route.fulfill({ json: { results: [
    { address: "Neelasandra, Bengaluru, Karnataka", lat: 12.952, lng: 77.615 },
  ] } }));
  await page.route("**/api/ai/analyze", route => route.fulfill(
    route.request().method() === "GET" ? { json: { configured: false } } :
      { status: 503, json: { success: false, error: "Vision is unavailable; continue with typed observations." } },
  ));
  await page.getByLabel("Incident photograph", { exact: true }).setInputFiles({
    name: "fire.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByLabel("Visible damage", { exact: true }).fill("The apartment building is on fire and flames are visible from the windows.");
  await page.getByLabel("Assistance required", { exact: true }).fill("Fire suppression and rescue needed immediately.");
  await page.getByRole("searchbox", { name: "Search incident address" }).fill("Neelasandra, Bengaluru");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByTestId("selected-address")).toContainText("Neelasandra");
  const submitted = page.waitForResponse(r => r.url().endsWith("/api/incidents") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Submit Emergency Report", exact: true }).last().click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const { incident } = await response.json();
  expect(incident.ai_assessment).toBeNull();
  expect(incident.category).toBe("fire");
  expect(incident.status).toBe("assigned");
  expect(incident.routing_decision.assigned_codes).toEqual(expect.arrayContaining(["FIRE_RESCUE", "MEDICAL"]));
  await expect(page.getByText(/Response teams have received your report/)).toBeVisible();

  await login(page, "fire");
  await expect(page.getByRole("button", { name: `Open incident: ${incident.title}`, exact: true })).toBeVisible();
  const fireIncident = await page.request.get(`/api/incidents/${incident.id}`);
  expect(fireIncident.ok()).toBeTruthy();
  const fireData = (await fireIncident.json()).incident;
  expect(fireData.reports).toHaveLength(1);
  expect(fireData.assignments).toHaveLength(1);
  expect(fireData.assignments[0].department.code).toBe("FIRE_RESCUE");
  await page.getByRole("button", { name: `Open incident: ${incident.title}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept assignment", exact: true })).toBeVisible();

  await login(page, "admin");
  expect((await page.request.get(`/api/incidents/${incident.id}`)).ok()).toBeTruthy();
  await login(page, "power");
  expect((await page.request.get(`/api/incidents/${incident.id}`)).status()).toBe(404);
});

test("routing exceptions, NGO response, rework and admin verification persist", async ({ page }) => {
  await login(page, "admin");
  expect((await page.request.post("/api/seed/reset")).ok()).toBeTruthy();
  await login(page, "citizen");
  const image = await page.request.post("/api/uploads", { multipart: { file: { name: "relief.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64") } } });
  expect(image.status()).toBe(201);
  const photo = await image.json();
  const submission = await page.request.post("/api/incidents", { data: { imagePath: photo.imagePath, description: "Food supplies needed at the safe relief shelter", assistanceNeeded: "Food and hygiene kits", incidentLatitude: 18.52, incidentLongitude: 73.85, immediateDanger: "no", sourceType: "on_site" } });
  expect(submission.status()).toBe(201);
  const { incident } = await submission.json();
  expect(incident.routing_decision.mode).toBe("needs_review");
  await login(page, "admin");
  await page.getByLabel("Review queue", { exact: true }).selectOption("routing");
  await expect(page.getByRole("button", { name: /Open incident:/ })).toHaveCount(1);
  await page.getByRole("button", { name: /Open incident:/ }).click();
  await expect(page.getByRole("heading", { name: "Admin routing review required" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete routing review" })).toBeDisabled();
  await page.getByLabel("Assign response department").selectOption({ label: "NGO / Humanitarian Relief Partners" });
  const assigning = page.waitForResponse(r => r.url().endsWith("/assign") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  expect((await assigning).ok()).toBeTruthy();
  await page.getByLabel("Routing review notes").fill("The safe shelter needs supplies only. NGO support confirmed by the coordinator.");
  const reviewing = page.waitForResponse(r => r.url().endsWith("/routing") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Complete routing review" }).click();
  expect((await reviewing).ok()).toBeTruthy();
  await page.getByLabel("Review queue", { exact: true }).selectOption("all");
  // The selected incident remains open while the queue filter changes.
  await login(page, "ngo");
  await expect(page.getByRole("heading", { name: "NGO / Humanitarian Relief Partners", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open incident:/ })).toHaveCount(1);
  await page.getByRole("button", { name: /Open incident:/ }).click();
  for (const action of ["Accept assignment", "In progress"]) {
    const transition = page.waitForResponse(r => r.url().includes("/api/assignments/") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: action, exact: true }).click();
    expect((await transition).ok()).toBeTruthy();
  }
  await page.getByLabel("Field observations or rejection reason").fill("Food and hygiene kits delivered at the designated safe shelter.");
  const completion = page.waitForResponse(r => r.url().includes("/api/assignments/") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Resolve assignment", exact: true }).click();
  expect((await completion).ok()).toBeTruthy();
  await expect(page.getByText("Work completed — awaiting admin verification", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify work", exact: true })).toHaveCount(0);
  await login(page, "admin");
  await page.getByLabel("Review queue", { exact: true }).selectOption("work");
  await expect(page.getByRole("button", { name: /Open incident:/ })).toHaveCount(1);
  await page.getByRole("button", { name: /Open incident:/ }).click();
  await expect(page.getByRole("button", { name: "Close completed incident" })).toBeDisabled();
  await page.getByLabel("Work review notes for NGO / Humanitarian Relief Partners", { exact: true }).fill("Additional food kits are needed at the shelter; return to complete delivery.");
  const rework = page.waitForResponse(r => r.url().includes("/api/assignments/") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Request further work", exact: true }).click();
  expect((await rework).ok()).toBeTruthy();
  await login(page, "ngo");
  await page.getByRole("button", { name: /Open incident:/ }).click();
  await expect(page.getByText("Further work requested by admin", { exact: true })).toBeVisible();
  await page.getByLabel("Field observations or rejection reason").fill("Additional kits delivered and shelter coordinator confirmed receipt.");
  const resubmitted = page.waitForResponse(r => r.url().includes("/api/assignments/") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Resolve assignment", exact: true }).click();
  expect((await resubmitted).ok()).toBeTruthy();
  await login(page, "admin");
  await page.getByLabel("Review queue", { exact: true }).selectOption("work");
  await page.getByRole("button", { name: /Open incident:/ }).click();
  await page.getByLabel("Work review notes for NGO / Humanitarian Relief Partners", { exact: true }).fill("Shelter coordinator confirmed delivery; completion notes checked.");
  const verification = page.waitForResponse(r => r.url().includes("/api/assignments/") && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Verify work", exact: true }).click();
  expect((await verification).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Close completed incident" })).toBeEnabled();
  await expect(page.getByText("Work verified by admin", { exact: true })).toBeVisible();
});

test("all India relief demo accounts reach their own department portals", async ({ page }) => {
  await login(page, "admin");
  expect((await page.request.post("/api/seed/reset")).ok()).toBeTruthy();
  for (const [email, name] of [
    ["sdrf", "State Disaster Response Force (SDRF)"],
    ["ndrf", "National Disaster Response Force (NDRF)"],
    ["police", "Police & Traffic Control"],
    ["civil", "Civil Defence & Home Guards"],
    ["ngo", "NGO / Humanitarian Relief Partners"],
    ["volunteer", "Community Volunteers / Aapda Mitra"],
  ]) {
    await login(page, email);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open incident:/ })).toHaveCount(0);
  }
});

test("an already-open Fire portal receives new citizen reports when refocused", async ({ page, browser }) => {
  await login(page, "admin");
  expect((await page.request.post("/api/seed/reset")).ok()).toBeTruthy();
  const fireContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const firePage = await fireContext.newPage();
    await login(firePage, "fire");
    await expect(firePage.getByRole("heading", { name: "Fire & Emergency Services", exact: true })).toBeVisible();
    await login(page, "citizen");
    const image = await page.request.post("/api/uploads", { multipart: { file: {
      name: "new-fire.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64"),
    } } });
    expect(image.status()).toBe(201);
    const photo = await image.json();
    const submission = await page.request.post("/api/incidents", { data: {
      imagePath: photo.imagePath, description: "Flames visible from the warehouse roof near the bridge", assistanceNeeded: "Fire suppression", incidentLatitude: 11.5, incidentLongitude: 77.5, sourceType: "on_site", immediateDanger: "yes",
    } });
    expect(submission.status()).toBe(201);
    const { incident } = await submission.json();
    await firePage.bringToFront();
    await firePage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(firePage.getByRole("button", { name: `Open incident: ${incident.title}`, exact: true })).toBeVisible();
  } finally {
    await fireContext.close();
  }
});
