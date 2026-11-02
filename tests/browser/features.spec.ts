import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const names = ['Select location', 'Water sources', 'Water consumption', 'Maintenance & readiness',
  'Water quality', 'Groundwater & soil', 'Community budget', 'Overview', 'Building map',
  'Register property', 'Property details', 'Roof verification', 'Rainfall forecast', 'Historical rainfall',
  'WaterTwin', 'Rainwater calculator', 'Storage optimiser', 'Recommendations', 'Field observations',
  'Performance history', 'Locality network', 'Commercial', 'Municipal', 'Water assistant', 'Assessment reports', 'Data sources', 'Settings'];

test('every public feature has an interactive labelled preview without private requests', async ({ page }) => {
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
  await expect(nav.getByRole('link')).toHaveCount(names.length);
  for (const name of names) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText('Fictional data · no records saved', { exact: true })).toBeVisible();
    await expect(page.getByText('What the real page needs', { exact: true })).toBeVisible();
  }
  await nav.getByRole('link', { name: 'Maintenance & readiness', exact: true }).click();
  await page.getByRole('checkbox', { name: /^Roof cleaning/ }).check();
  await expect(page.getByText('1 of 6 practice checks selected.', { exact: false })).toBeVisible();
  await nav.getByRole('link', { name: 'Water quality', exact: true }).click();
  await page.getByLabel('Simulated pH', { exact: true }).fill('6.8');
  await expect(page.getByRole('cell', { name: '6.8', exact: true })).toBeVisible();
  await expect(page.getByText('Suitability remains unestablished', { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Community budget', exact: true }).click();
  await page.getByText('Collection, starting storage and annual assumptions', { exact: true }).click();
  await page.getByLabel('Illustrative community budget (₹)').fill('0');
  await expect(page.getByText('No beneficial affordable upgrade in this example', { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Water assistant', exact: true }).click();
  await page.getByLabel('Question for the example assistant').selectOption('overflow');
  await expect(page.getByText('The backend water balance estimates', { exact: false })).toBeVisible();
  await nav.getByRole('link', { name: 'Assessment reports', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download simulated PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('SIMULATED');
  expect(await download.failure()).toBeNull();
  await mkdir('artifacts/features', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/demo/features?feature=%2Fquality');
    await expect(page.getByLabel('Simulated pH', { exact: true })).toBeVisible();
    await expect(page.locator('.feature-result')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.screenshot({ path: `artifacts/features/quality-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Feature to simulate', { exact: true }).selectOption('/twin');
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
  await page.getByLabel('Assumed catchment (m²)', { exact: true }).fill('180');
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
    await page.screenshot({ path: `artifacts/features/home-${viewport.width}.png` });
  }
  // Expandable menus retain every existing destination, including keyboard access on mobile.
  await page.locator('.nav-more > summary').click();
  for (const summary of await page.locator('.nav-disclosure summary').all()) {
    const group = summary.locator('..');
    if (await group.getAttribute('open') === null) await summary.click();
    await expect(group.locator('.nav-link').first()).toBeVisible();
  }
  await expect(page.locator('#primary-navigation nav .nav-link')).toHaveCount(27);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My overview', exact: true })).toBeFocused();
  await page.locator('.nav-disclosure summary').filter({ hasText: 'Help & settings' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.nav-disclosure').filter({ hasText: 'Help & settings' })).not.toHaveAttribute('open');
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
  await page.goto('/#/quality');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await expect(page.getByLabel('Simulated pH', { exact: true })).toBeVisible();
  await page.getByLabel('Simulated pH', { exact: true }).fill('8');
  await page.locator('.nav-disclosure summary').filter({ hasText: 'Property & roof' }).click();
  await page.getByRole('link', { name: 'My property details', exact: true }).click();
  await page.getByLabel('Assumed catchment (m²)', { exact: true }).fill('200');
  const communityMenu = page.locator('.nav-disclosure').filter({ has: page.locator('summary').filter({ hasText: 'Community tools' }) });
  if (await communityMenu.getAttribute('open') === null) await communityMenu.locator('summary').click();
  await page.getByRole('link', { name: 'Municipal overview', exact: true }).click();
  await expect(page.getByText('Fictional municipal view', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my property', exact: true }).click();
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
