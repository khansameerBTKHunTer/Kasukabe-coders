import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/seed/reset');
});

for (const width of [375, 768, 1440]) {
  test(`Dashboard and responder/citizen portals fit at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Open incident:/ })).toHaveCount(4);
    await expect(page.locator('.custom-incident-marker')).toHaveCount(4);
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    await fits();
    await page.screenshot({ path: `test-results/control-room-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Open incident:/ }).first().click();
    await expect(page.getByRole('button', { name: 'Close incident details' })).toBeVisible();
    await fits();
    await page.getByRole('combobox', { name: 'Active role' }).selectOption('fire_rescue');
    await expect(page.getByRole('heading', { name: 'Fire & Rescue Operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open incident:/ })).toHaveCount(1);
    await fits();
    await page.getByRole('button', { name: /Open incident:/ }).click();
    await page.getByRole('combobox', { name: 'Active role' }).selectOption('electricity');
    await expect(page.getByRole('button', { name: 'Close incident details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Open incident:/ })).toHaveCount(1);
    await fits();
    await page.getByRole('combobox', { name: 'Active role' }).selectOption('citizen');
    await expect(page.getByRole('heading', { name: 'Citizen Emergency Report Form' })).toBeVisible();
    await page.getByRole('button', { name: /Commercial Building Structural Collapse/ }).click();
    await expect(page.getByText('22.9410°N, 90.8250°E', { exact: true })).toBeVisible();
    await fits();
    await page.getByRole('button', { name: /Track Submitted Reports/ }).click();
    await fits();
    expect(errors).toEqual([]);
  });
}

test('Filters, map selection, activity refresh and PDF download work', async ({ page }) => {
  await page.goto('/');
  const cards = page.getByRole('button', { name: /Open incident:/ });
  await expect(cards).toHaveCount(4);
  await page.getByRole('combobox', { name: 'Category filter' }).selectOption('electrical_hazard');
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.custom-incident-marker')).toHaveCount(1);
  await cards.click();
  await page.getByRole('button', { name: 'Flag for Triage' }).click();
  await expect(page.getByText('Verification status updated by Control Room Admin')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SitRep PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^CIVISCOPE-SitRep-.*\.pdf$/);
});

test('Production KPIs reflect an incident priority change', async ({ request }) => {
  const list = await (await request.get('/api/incidents')).json();
  const low = list.incidents.find((incident: { priority_band: string }) => incident.priority_band === 'Medium');
  await request.patch(`/api/incidents/${low.id}`, { data: { action: 'override_priority', priorityScore: 99, overrideReason: 'Browser regression check' } });
  const stats = await (await request.get('/api/statistics')).json();
  expect(stats.stats.critical).toBe(3);
});

test('Load failures are visible and Refresh recovers', async ({ page }) => {
  await page.route('**/api/incidents', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' }));
  await page.goto('/');
  await expect(page.locator('p[role="alert"]')).toContainText('Unable to load');
  await page.unroute('**/api/incidents');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: /Open incident:/ })).toHaveCount(4);
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});
