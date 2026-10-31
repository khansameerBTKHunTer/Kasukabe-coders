import { test, expect } from "@playwright/test";

test("a 5 MB image uploads directly to storage and is verified without a large app request", async ({ page }) => {
  await page.request.post("/api/demo/session", { data: { email: "citizen@civiscope.demo", password: "1234" } });
  const imagePath = "supabase://incident-evidence/test-owner/test.png";
  let uploaded = 0;
  let completed = false;
  await page.route("**/api/uploads", async route => {
    expect(route.request().headers()["content-type"]).toContain("application/json");
    expect(route.request().postDataJSON()).toEqual({ contentType: "image/png", size: 5 * 1024 * 1024 });
    await route.fulfill({ json: { success: true, uploadMode: "direct", imagePath,
      uploadUrl: "https://storage.example.invalid/object/upload/sign/evidence/test.png?token=fixture" } });
  });
  await page.route("https://storage.example.invalid/**", async route => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "PUT", "Access-Control-Allow-Headers": "content-type,x-upsert" } });
      return;
    }
    expect(route.request().method()).toBe("PUT");
    uploaded = route.request().postDataBuffer()!.length;
    await route.fulfill({ json: { Key: "evidence/test.png" }, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.route("**/api/uploads/complete", async route => {
    expect(uploaded).toBe(5 * 1024 * 1024);
    expect(route.request().postDataJSON()).toEqual({ imagePath });
    completed = true;
    await route.fulfill({ json: { success: true, imagePath, previewUrl: "/simulated-evidence/building_collapse_1.jpg", storage: "supabase" } });
  });
  await page.route("**/api/ai/analyze", route => route.fulfill({ json: { configured: false, success: false, error: "Vision unavailable in upload test" } }));
  await page.goto("/");
  const buffer = Buffer.alloc(5 * 1024 * 1024);
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=", "base64").copy(buffer);
  await page.getByLabel("Incident photograph", { exact: true }).setInputFiles({ name: "large.png", mimeType: "image/png", buffer });
  await expect(page.getByText("Photo uploaded · report not submitted yet", { exact: true })).toBeVisible();
  expect(completed).toBeTruthy();
});
