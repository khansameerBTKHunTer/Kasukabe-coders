import { test, expect } from "@playwright/test";
test("dummy login uses an HttpOnly local session, restores on refresh, and never calls real Auth", async ({
  page,
  context,
}) => {
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/")) authRequests.push(request.url());
  });
  await page.goto("/demo-login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("citizen@civiscope.demo");
  await page.getByLabel("Password", { exact: true }).fill("CiviscopeDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === "civiscope_demo")
      ?.httpOnly,
  ).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(authRequests).toEqual([]);
});
test("incorrect dummy password cannot open Control Room", async ({ page }) => {
  await page.goto("/demo-login");
  await page.getByLabel("Email", { exact: true }).fill("admin@civiscope.demo");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Incorrect demo email or password",
  );
  await expect(page.getByRole("heading", { name: "Control room" })).toHaveCount(
    0,
  );
});
