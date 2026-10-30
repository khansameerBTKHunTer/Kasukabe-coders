import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, name: string) {
  expect((await page.request.post("/api/demo/session", { data: { email: `${name}@civiscope.demo`, password: "CiviscopeDemo!2026" } })).ok()).toBeTruthy();
  await page.goto("/");
}

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
