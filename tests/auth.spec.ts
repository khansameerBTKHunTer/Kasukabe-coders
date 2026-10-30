import { expect, test, type Page } from "@playwright/test";
const uid = "99000000-0000-4000-8000-000000000001";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "person@example.test",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const profile = {
  id: uid,
  email: user.email,
  display_name: "Test Citizen",
  role: "citizen",
  approval_status: "approved",
  department_id: null,
};
function token() {
  return `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
}
async function mockedAuth(
  page: Page,
  options: {
    invalid?: boolean;
    profileStatus?: number;
    missing?: boolean;
    signupImmediate?: boolean;
  } = {},
) {
  const requests: { signup: any[]; recovery: any[]; updates: any[] } = {
    signup: [],
    recovery: [],
    updates: [],
  };
  await page.route("**/api/demo/session", (route) =>
    route.fulfill({ json: { enabled: false, profile: null } }),
  );
  await page.route("**/api/auth/profile", (route) =>
    route.fulfill({
      status: options.profileStatus ?? (options.missing ? 404 : 200),
      json: options.missing
        ? { code: "PROFILE_MISSING", error: "Your account profile is missing." }
        : options.profileStatus
          ? { error: "Profile permission denied." }
          : { profile, demo: false },
    }),
  );
  await page.route("**/api/reports", (route) =>
    route.fulfill({ json: { success: true, reports: [] } }),
  );
  await page.route("**/auth/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/signup")) {
      requests.signup.push(request.postDataJSON());
      return route.fulfill({
        json: options.signupImmediate
          ? {
              access_token: token(),
              refresh_token: "test-refresh-token",
              token_type: "bearer",
              expires_in: 3600,
              user,
            }
          : {
              ...user,
              identities: [{ identity_id: uid, id: uid, provider: "email" }],
            },
      });
    }
    if (path.endsWith("/recover")) {
      requests.recovery.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    }
    if (path.endsWith("/token"))
      return route.fulfill(
        options.invalid
          ? {
              status: 400,
              json: {
                code: "invalid_credentials",
                msg: "Invalid login credentials",
              },
            }
          : {
              json: {
                access_token: token(),
                refresh_token: "test-refresh-token",
                token_type: "bearer",
                expires_in: 3600,
                user,
              },
            },
      );
    if (path.endsWith("/user")) {
      if (request.method() === "PUT")
        requests.updates.push(request.postDataJSON());
      return route.fulfill({ json: user });
    }
    if (path.endsWith("/logout")) return route.fulfill({ json: {} });
    return route.fulfill({
      status: 400,
      json: { error: "Unhandled mock endpoint" },
    });
  });
  return requests;
}
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("TestingPassword!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signed-out entry never displays Control Room; login persists and sign-out removes access", async ({
  page,
}) => {
  await mockedAuth(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Control room" })).toHaveCount(
    0,
  );
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Active role" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
test("incorrect credentials show an error and keep the login form", async ({
  page,
}) => {
  await mockedAuth(page, { invalid: true });
  await signIn(page);
  await expect(page.locator("p[role=alert]")).toContainText(
    /Incorrect email or password/,
  );
  await expect(page).toHaveURL(/\/login$/);
});
for (const state of ["missing", "denied"])
  test(`profile ${state} never becomes a citizen or admin dashboard`, async ({
    page,
  }) => {
    await mockedAuth(
      page,
      state === "missing" ? { missing: true } : { profileStatus: 403 },
    );
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Account access unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry profile" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Report an incident" }),
    ).toHaveCount(0);
  });
for (const code of [null, "FIRE_RESCUE", "ELECTRICITY", "MUNICIPAL", "MEDICAL"])
  test(`signup ${code ?? "citizen"} respects email confirmation and never grants an admin role`, async ({
    page,
  }) => {
    const calls = await mockedAuth(page);
    await page.goto("/register");
    if (code) {
      await page.getByLabel("Account type").selectOption("rescue");
      await page
        .getByLabel("Department name / local unit name")
        .fill("District Unit 2");
      await page
        .getByLabel("Department selection", { exact: true })
        .selectOption({
          label: (
            {
              FIRE_RESCUE: "Fire & Emergency Services",
              ELECTRICITY: "Electricity Distribution Utility (DISCOM)",
              MUNICIPAL: "Municipal / Panchayat & Public Works",
              MEDICAL: "Health Department & Emergency Medical Services",
            } as Record<string, string>
          )[code],
        });
    } else await page.getByLabel("Full name").fill("Test Citizen");
    await page
      .getByLabel(code ? "Official email" : "Email", { exact: true })
      .fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("TestingPassword!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    expect(calls.signup).toHaveLength(1);
    expect(calls.signup[0].data.role).toBeUndefined();
    expect(calls.signup[0].data.department_code).toBe(code);
    await expect(
      page.getByRole("heading", { name: "Control room" }),
    ).toHaveCount(0);
  });
test("forgot password acknowledges generically and uses a same-origin recovery callback", async ({
  page,
}) => {
  const calls = await mockedAuth(page);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account matches");
  expect(calls.recovery).toHaveLength(1);
});
test("recovery state survives reload and password update ends recovery", async ({
  page,
}) => {
  const calls = await mockedAuth(page);
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("civiscope_recovery", "active"),
  );
  await page.goto("/reset-password");
  await page.reload();
  await page
    .getByLabel("New password", { exact: true })
    .fill("UpdatedPassword!");
  await page.getByLabel("Confirm new password").fill("UpdatedPassword!");
  await expect(
    page.getByRole("button", { name: "Update password" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect(calls.updates).toHaveLength(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("civiscope_recovery")),
  ).toBeNull();
});
test("invalid recovery callback clearly explains expiry", async ({ page }) => {
  await mockedAuth(page);
  await page.goto("/auth/callback?error=access_denied&flow=recovery");
  await expect(page.locator("p[role=alert]").first()).toContainText(
    "invalid or expired",
  );
  await expect(
    page.getByRole("link", { name: "Request a new reset link" }),
  ).toBeVisible();
});
test("login form fits on mobile and password visibility is accessible", async ({
  page,
}) => {
  await mockedAuth(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("signup with an immediate session opens the database-profile portal", async ({
  page,
}) => {
  await mockedAuth(page, { signupImmediate: true });
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Test Citizen");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("TestingPassword!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
});
test("valid PKCE recovery callback opens the password form", async ({
  page,
}) => {
  await mockedAuth(page);
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account matches");
  await page.goto("/auth/callback?code=test-pkce-code&flow=recovery");
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(
    page.getByRole("button", { name: "Update password" }),
  ).toBeEnabled();
});
