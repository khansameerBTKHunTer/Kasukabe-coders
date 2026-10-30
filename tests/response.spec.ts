import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, name: string) {
  expect((await page.request.post('/api/demo/session', { data: { email: `${name}@civiscope.demo`, password: 'CiviscopeDemo!2026' } })).ok()).toBeTruthy();
  await page.goto('/');
}
async function transition(page: Page, action: string) {
  const response = page.waitForResponse(response => response.url().includes('/api/assignments/') && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: action, exact: true }).click();
  expect((await response).ok()).toBeTruthy();
}
test.beforeEach(async ({ page }) => {
  await login(page, 'admin');
  expect((await page.request.post('/api/seed/reset')).ok()).toBeTruthy();
  await page.reload();
});
test('multiple department assignments, evidence, independent resolution and admin closure work', async ({ page }) => {
  await page.getByRole('button', { name: /Open incident:.*Partial Structural Collapse/ }).click();
  await page.getByLabel('Assign response department').selectOption({ label: 'Medical Response' });
  const assigned = page.waitForResponse(response => response.url().includes('/assign') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  expect((await assigned).ok()).toBeTruthy();
  await login(page, 'medical');
  await page.getByRole('button', { name: /Open incident:.*Partial Structural Collapse/ }).click();
  await transition(page, 'Accept assignment');
  await transition(page, 'En route');
  await transition(page, 'On site');
  await page.getByLabel('Field observations or rejection reason').fill('Medical team established triage at the site.');
  await page.getByLabel('Additional field photograph').setInputFiles({ name: 'field.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=', 'base64') });
  const evidence = page.waitForResponse(response => response.url().endsWith('/evidence') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Upload evidence with observation' }).click();
  expect((await evidence).ok()).toBeTruthy();
  await transition(page, 'In progress');
  await transition(page, 'Resolve assignment');
  await expect(page.getByText('Responding', { exact: true })).toBeVisible();
  await login(page, 'fire');
  await page.getByRole('button', { name: /Open incident:.*Partial Structural Collapse/ }).click();
  await transition(page, 'En route');
  await transition(page, 'On site');
  await transition(page, 'In progress');
  await transition(page, 'Resolve assignment');
  await login(page, 'admin');
  await page.getByRole('button', { name: /Open incident:.*Partial Structural Collapse/ }).click();
  await expect(page.getByRole('button', { name: 'Close completed incident' })).toBeEnabled();
  const closed = page.waitForResponse(response => response.url().includes('/api/incidents/') && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Close completed incident' }).click();
  expect((await closed).ok()).toBeTruthy();
  await expect(page.locator('span').filter({ hasText: /^Closed$/ })).toBeVisible();
});
test('assignment rejection requires a reason and persists its own status', async ({ page }) => {
  await login(page, 'power');
  await page.getByRole('button', { name: /Open incident:/ }).click();
  await expect(page.getByRole('button', { name: 'Reject assignment' })).toBeDisabled();
  await page.getByLabel('Field observations or rejection reason').fill('Specialist equipment is unavailable; request another team.');
  await transition(page, 'Reject assignment');
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
});
