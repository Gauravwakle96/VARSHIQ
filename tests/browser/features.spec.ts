import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const sections = [['Overview', 'Overview'], ['My property', 'Property details'], ['Rainfall', 'Rainfall forecast'],
  ['My tank', 'WaterTwin'], ['Records', 'Field observations'], ['Reports', 'Assessment reports']];

test('six demo sections keep example inputs optional and results interactive without private requests', async ({ page }) => {
  const errors: string[] = [];
  const privateRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/v1/') && !path.startsWith('/api/v1/demo/')) privateRequests.push(path);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/demo/features');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText('Every litre accounted for', { exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Simulated feature navigation' });
  await expect(nav.getByRole('link')).toHaveCount(6);
  for (const [name, heading] of sections) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('Fictional data · no records saved', { exact: true })).toBeVisible();
    await expect(page.locator('.example-settings')).not.toHaveAttribute('open');
  }
  await nav.getByRole('link', { name: 'Records', exact: true }).click();
  await page.getByRole('navigation', { name: 'Demo section pages' }).getByRole('link', { name: 'Maintenance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice monsoon readiness', exact: true })).toBeVisible();
  await expect(page.getByLabel('Roof area (m²)', { exact: true })).toBeHidden();
  await page.getByRole('checkbox', { name: /^Roof cleaning/ }).check();
  await expect(page.getByText('1 of 6 practice checks selected.', { exact: false })).toBeVisible();
  await page.locator('.example-settings > summary').click();
  await page.getByLabel('Roof area (m²)', { exact: true }).fill('180');
  await expect(page.locator('.example-summary')).toContainText('180 m²');
  await expect(page.getByLabel('Invented annual rainfall (mm)')).toHaveCount(0);
  await expect(page.getByLabel('Illustrative community budget (₹)')).toHaveCount(0);
  await page.locator('.example-settings > summary').click();
  await page.getByRole('link', { name: 'Water assistant', exact: true }).click();
  await page.getByLabel('Question for the example assistant').selectOption('overflow');
  await expect(page.getByText('The backend water balance estimates', { exact: false })).toBeVisible();
  await nav.getByRole('link', { name: 'My tank', exact: true }).click();
  await page.getByRole('navigation', { name: 'Demo section pages' }).getByRole('link', { name: 'Tank sizes', exact: true }).click();
  await page.locator('.example-settings > summary').click();
  await page.getByText('More example settings', { exact: true }).click();
  await expect(page.getByLabel('Invented annual rainfall (mm)')).toBeVisible();
  await nav.getByRole('link', { name: 'Reports', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download simulated PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('SIMULATED');
  expect(await download.failure()).toBeNull();
  await mkdir('artifacts/features', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/demo/features?feature=%2Fmaintenance');
    await expect(page.getByRole('heading', { name: 'Practice monsoon readiness', exact: true })).toBeVisible();
    await expect(page.getByLabel('Roof area (m²)', { exact: true })).toBeHidden();
    await expect(page.locator('.feature-result')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.screenshot({ path: `artifacts/features/blue-maintenance-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Section to explore', { exact: true }).selectOption('/twin');
  await expect(page.getByRole('heading', { name: 'WaterTwin', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Next simulation hour', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next simulation hour', exact: true }).click();
  await page.screenshot({ path: 'artifacts/features/twin-mobile.png' });
  await page.getByRole('link', { name: 'Skip to feature simulation', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#feature-main')).toBeFocused();
  await expect(page).toHaveURL(/demo\/features/);
  await page.route('**/api/v1/demo/workspace', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: { message: 'AUTOMATED TEST feature failure' } }) }));
  await page.locator('.example-settings > summary').click();
  await page.getByLabel('Roof area (m²)', { exact: true }).fill('180');
  await expect(page.getByText('AUTOMATED TEST feature failure', { exact: true })).toBeVisible();
  await expect(page.getByText('Modelled inflow', { exact: true })).toBeHidden();
  await page.unroute('**/api/v1/demo/workspace');
  await page.getByRole('button', { name: 'Retry simulation', exact: true }).click();
  await expect(page.getByText('Modelled inflow', { exact: true })).toBeVisible();
  expect(privateRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('owner planning previews preserve real evidence and municipal permissions', async ({ page }) => {
  const session = await page.request.get('/api/v1/auth/session').then(response => response.json());
  const register = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-CSRF-Token': session.data.csrf_token }, data: {
      name: 'AUTOMATED TEST Planning Owner', email: `planning-preview-${Date.now()}@example.com`,
      password: 'AUTOMATED-TEST-password-2026',
    },
  }).then(response => response.json());
  const headers = { 'X-CSRF-Token': register.data.csrf_token };
  const created = await page.request.post('/api/v1/buildings', { headers, data: {
    name: 'AUTOMATED TEST Planning Property', property_type: 'residential', locality: 'AUTOMATED TEST locality',
    latitude: 19.8762, longitude: 75.3433, effective_catchment_m2: null,
  }}).then(response => response.json());
  const id = created.data.id;
  const patched = await page.request.patch(`/api/v1/buildings/${id}`, { headers, data: {
    planning_assumptions: true, effective_catchment_m2: 120, runoff_coefficient: .8,
    coefficient_source: 'AUTOMATED TEST planning assumption', first_flush_mm: 1, collection_efficiency: .9,
    tank_capacity_l: 2000, current_storage_l: 500, daily_demand_l: 400, storage_status: 'estimated',
  }});
  expect(patched.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'AUTOMATED TEST Planning Property', exact: true })).toBeVisible();
  await expect(page.locator('#primary-navigation nav .nav-link:visible')).toHaveCount(6);
  await expect(page.getByRole('link', { name: 'Will it rain?', exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Will my tank fill up?', exact: false })).toBeVisible();
  await expect(page.getByText('Using estimated property details', { exact: true })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Estimated tank level' })).toHaveAttribute('aria-valuenow', '25');
  await expect(page.getByRole('link', { name: 'Estimate my roof from the map', exact: false })).toBeVisible();
  await mkdir('artifacts/features', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.screenshot({ path: `artifacts/features/blue-home-${viewport.width}.png` });
  }
  // Core destinations and section links replace the long nested catalogue.
  await expect(page.locator('.nav-more, .nav-disclosure')).toHaveCount(0);
  const ownerNav = page.getByRole('navigation', { name: 'Your water tools' });
  await expect(ownerNav.getByRole('link', { name: 'Municipal overview', exact: true })).toHaveCount(0);
  await expect(ownerNav.getByRole('link', { name: 'Groundwater & soil', exact: true })).toHaveCount(0);
  await ownerNav.getByRole('link', { name: 'My property', exact: true }).click();
  await page.getByRole('navigation', { name: 'My property pages' }).getByRole('link', { name: 'Building map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find the roof. Start the connection.', exact: true })).toBeVisible();
  await expect(ownerNav.getByRole('link', { name: 'My property', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(ownerNav.getByRole('link', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/property');
  await expect(page.getByRole('heading', { name: 'About your property', exact: true })).toBeVisible();
  await expect(page.locator('[name="latitude"]')).toBeHidden();
  await expect(page.locator('[name="runoff_coefficient"]')).toBeHidden();
  await expect(page.locator('[name="tank_capacity_l"]')).toBeVisible();
  const address = page.locator('details').filter({ has: page.locator('[name="country"]') });
  await address.locator('summary').click();
  await page.locator('[name="country"]').fill('');
  await address.locator('summary').click();
  await page.getByRole('button', { name: 'Save property changes', exact: true }).click();
  await expect(address).toHaveAttribute('open');
  await expect(page.locator('[name="country"]')).toBeFocused();
  await page.locator('[name="country"]').fill('IN');
  expect(await page.locator('#main-content').innerText()).not.toMatch(/\bscenario\b/i);
  await page.goto('/#/maintenance');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice monsoon readiness', exact: true })).toBeVisible();
  await expect(page.getByLabel('Roof area (m²)', { exact: true })).toBeHidden();
  await page.locator('.example-settings > summary').click();
  await page.getByLabel('Roof area (m²)', { exact: true }).fill('200');
  await ownerNav.getByRole('link', { name: 'My tank', exact: true }).click();
  await expect(page.locator('.example-settings')).not.toHaveAttribute('open');
  await expect(page.locator('.example-summary')).toContainText('200 m²');
  await page.getByRole('button', { name: 'Back to my property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Will my tank have enough water?', exact: true })).toBeVisible();
  await page.goto('/#/municipal');
  await expect(page.getByText('Municipal access required', { exact: true })).toBeVisible();
  const prop = await page.request.get(`/api/v1/buildings/${id}`).then(response => response.json());
  expect(prop.data.effective_catchment_m2).toBe(120);
  expect(prop.data.measurements).toEqual([]);
  expect(prop.data.current_storage_l).toBe(500);
  const quality = await page.request.get(`/api/v1/water-quality/${id}`).then(response => response.json());
  const storage = await page.request.get(`/api/v1/storage/${id}`).then(response => response.json());
  expect(quality.data.records).toEqual([]);
  expect(storage.data.observations).toEqual([]);
  const municipal = await page.request.get('/api/v1/dashboard/municipal');
  expect(municipal.status()).toBe(403);
  const user = await page.request.get('/api/v1/auth/session').then(response => response.json());
  expect(user.data.user.role).toBe('owner');
});
