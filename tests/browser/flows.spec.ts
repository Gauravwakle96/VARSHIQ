import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('real API registration, forecast, WaterTwin, report and responsive accessibility', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /water|welcome|workspace|sign/i }).first()).toBeVisible();
  const create = page.getByRole('button', { name: /create account|register|sign up/i }).first();
  if (await create.isVisible()) await create.click();
  await page.getByLabel(/full name|your name|name/i).first().fill('AUTOMATED TEST Browser Owner');
  await page.getByLabel(/email/i).fill(`browser-fixture-${Date.now()}@example.com`);
  await page.getByLabel(/^password/i).fill('AUTOMATED-TEST-password-2026');
  await page.getByRole('button', { name: /create.*account|create.*workspace|register/i }).last().click();
  await expect(page.getByRole('link', { name: 'My overview', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Start with a roof/ })).toBeVisible();
  await mkdir('artifacts/browser', { recursive: true });
  await page.screenshot({ path: 'artifacts/browser/desktop-empty.png' });

  // Clearly labelled synthetic property exists only in this automated-test database.
  const property = await page.evaluate(async () => {
    const session = await fetch('/api/v1/auth/session', { credentials: 'include' }).then(r => r.json());
    const response = await fetch('/api/v1/buildings', { method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.data.csrf_token },
      body: JSON.stringify({ name: 'AUTOMATED TEST Property', property_type: 'residential', locality: 'Mumbai',
        latitude: 19.076, longitude: 72.8777, effective_catchment_m2: 100, roof_material: 'concrete', runoff_coefficient: 0.8,
        coefficient_source: 'AUTOMATED TEST assumption', first_flush_mm: 1, collection_efficiency: 0.9,
        tank_capacity_l: 1000, current_storage_l: 200, daily_demand_l: 100 }) });
    if (!response.ok) throw new Error(await response.text());
    return (await response.json()).data;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /water|overview|workspace|rain|AUTOMATED TEST/i }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Rain forecast', exact: true }).click();
  await expect(page.getByText('Open-Meteo', { exact: false }).first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('link', { name: 'Weather data by Open-Meteo.com' }).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/desktop-forecast.png' });
  await page.getByRole('link', { name: 'My water tank', exact: true }).first().click();
  await page.getByRole('button', { name: 'Show my water forecast', exact: true }).click();
  await expect(page.getByText('Forecast harvestable inflow', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(/Balance residual:/)).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/desktop-watertwin.png' });
  await page.evaluate(async propertyId => {
    const session = await fetch('/api/v1/auth/session', { credentials: 'include' }).then(r => r.json());
    const response = await fetch(`/api/v1/buildings/${propertyId}`, { method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.data.csrf_token },
      body: JSON.stringify({ daily_demand_l: 150 }) });
    if (!response.ok) throw new Error(await response.text());
  }, property.id);
  await page.reload();
  await expect(page.getByText('A prior prediction needs updating', { exact: true })).toBeVisible();
  await expect(page.getByText('Forecast harvestable inflow', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Inspect prior snapshot', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prior snapshot inspection' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/stale-snapshot.png' });
  await page.getByRole('link', { name: 'My reports', exact: true }).click();
  const reportButton = page.getByRole('button', { name: /generate|create/i }).first();
  await reportButton.click();
  await expect(page.getByRole('link', { name: /pdf/i }).first()).toBeVisible();
  const pdfUrl = await page.getByRole('link', { name: /pdf/i }).first().getAttribute('href');
  expect(pdfUrl).toBeTruthy();
  const pdf = await page.request.get(pdfUrl!);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/property');
    await expect(page.getByRole('heading', { name: 'AUTOMATED TEST Property', exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/browser/property-${viewport.width}x${viewport.height}.png` });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth+1);
    expect(overflow, `horizontal page overflow at ${viewport.width}`).toBe(false);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  }
  expect(errors).toEqual([]);
  expect(property.measurement_status).toBe('user_entered');
});

test('UI registration, roof evidence, water ledgers, maintenance and quality persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create account|register|sign up/i }).first().click();
  await page.getByLabel(/full name|your name|name/i).first().fill('AUTOMATED TEST UI Owner');
  await page.getByLabel(/email/i).fill(`ui-fixture-${Date.now()}@example.com`);
  await page.getByLabel(/^password/i).fill('AUTOMATED-TEST-password-2026');
  await page.getByRole('button', { name: /create.*account|create.*workspace|register/i }).last().click();
  await expect(page.getByRole('link', { name: 'My overview', exact: true })).toBeVisible();
  await page.goto('/#/register');
  await page.locator('[name="name"]').fill('AUTOMATED TEST UI Apartment');
  await page.locator('[name="property_type"]').selectOption('apartment');
  await page.locator('[name="district"]').fill('Chhatrapati Sambhajinagar');
  await page.locator('[name="city"]').fill('Chhatrapati Sambhajinagar');
  await page.locator('[name="locality"]').fill('AUTOMATED TEST CIDCO');
  await page.locator('[name="latitude"]').fill('19.8762');
  await page.locator('[name="longitude"]').fill('75.3433');
  await page.locator('[name="effective_catchment_m2"]').fill('100');
  await page.locator('[name="runoff_coefficient"]').fill('0.8');
  await page.locator('[name="coefficient_source"]').fill('AUTOMATED TEST fixture assumption');
  await page.locator('[name="first_flush_mm"]').fill('1');
  await page.locator('[name="collection_efficiency"]').fill('0.9');
  await page.locator('[name="tank_capacity_l"]').fill('1000');
  await page.locator('[name="current_storage_l"]').fill('200');
  await page.locator('[name="daily_demand_l"]').fill('100');
  await page.getByRole('button', { name: 'Register real property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Measure the roof that collects.' })).toBeVisible();
  await page.locator('[name="method"]').fill('AUTOMATED TEST tape measurement');
  await page.locator('[name="evidence_note"]').fill('AUTOMATED TEST fixture evidence only, no real property claim');
  await page.locator('[name="status"]').selectOption('field_verified');
  await page.getByRole('button', { name: 'Save measurement evidence' }).click();
  await expect(page.getByText('Measurement recorded', { exact: true })).toBeVisible();

  const localDate = (hours: number) => new Date(Date.now() - hours*3600000 - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  for (const route of ['water-sources', 'consumption']) {
    await page.goto(`/#/${route}`);
    await page.locator('[name="volume_l"]').fill('125');
    await page.locator('[name="interval_start"]').fill(localDate(3));
    await page.locator('[name="interval_end"]').fill(localDate(2));
    await page.locator('[name="method"]').fill('AUTOMATED TEST meter reading');
    await page.getByRole('button', { name: route === 'consumption' ? 'Save consumption record' : 'Save supply record' }).click();
    await expect(page.getByRole('cell', { name: 'AUTOMATED TEST meter reading', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('cell', { name: '125 L', exact: true })).toBeVisible();
  }
  await page.goto('/#/maintenance');
  await page.locator('[name="condition"]').selectOption('needs_attention');
  await page.locator('[name="notes"]').fill('AUTOMATED TEST roof obstruction inspection');
  await page.getByRole('button', { name: 'Save performed task' }).click();
  await expect(page.getByRole('cell', { name: 'AUTOMATED TEST roof obstruction inspection' })).toBeVisible();
  await page.goto('/#/quality');
  await page.locator('[name="ph"]').fill('7.2');
  await page.locator('[name="laboratory"]').fill('AUTOMATED TEST Lab');
  await page.locator('[name="method"]').fill('AUTOMATED TEST instrument');
  await page.locator('[name="treatment_status"]').fill('Unknown fixture treatment');
  await page.getByRole('button', { name: /save.*test|save.*quality/i }).click();
  await expect(page.getByRole('cell', { name: /AUTOMATED TEST Lab/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: /AUTOMATED TEST Lab/ })).toBeVisible();

  for (const route of ['locations', 'map', 'water-sources', 'consumption', 'maintenance', 'quality', 'groundwater', 'community-budget']) {
    await page.goto(`/#/${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Loading your water workspace…')).toBeHidden();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), route).toEqual([]);
  }

  // Synthetic quotations are submitted only in this isolated test database.
  await page.goto('/#/community-budget');
  await page.getByLabel('Available budget (₹)').fill('10000');
  const historicalYear = new Date().getFullYear() - 1;
  await page.getByLabel('Historical start', { exact: true }).fill(`${historicalYear}-01-01`);
  await page.getByLabel('Historical end', { exact: true }).fill(`${historicalYear}-12-31`);
  await page.getByRole('button', { name: 'Add quoted option' }).click();
  await page.getByLabel('Candidate tank capacity (L)').fill('2000');
  await page.getByLabel('Actual quoted installation cost (₹)').fill('5000');
  await page.getByLabel('Quotation / installation-space evidence').fill('AUTOMATED TEST fixture quotation and space; no actual vendor');
  await page.getByLabel('Installation space is confirmed for this candidate').check();
  await page.getByRole('button', { name: 'Optimise community budget', exact: true }).click();
  await expect(page.getByText('Selected option cost', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('heading', { name: 'Selected investments', exact: true })).toBeVisible();
  await page.getByText('Historical sources and property evidence', { exact: true }).click();
  await expect(page.getByText('ERA5', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/community-budget-result.png' });

  // Live place search stays distinct from the registered synthetic property.
  await page.goto('/#/locations');
  await page.getByLabel('City, locality, address or postcode').fill('Pune');
  await page.getByRole('button', { name: 'Search actual locations' }).click();
  await expect(page.getByRole('button', { name: 'Select place' }).first()).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Select place' }).first().click();
  await expect(page.getByRole('heading', { name: 'Find the roof. Start the connection.' })).toBeVisible();
  const lat = Number(await page.getByLabel('Lookup latitude', { exact: true }).inputValue());
  const lon = Number(await page.getByLabel('Lookup longitude', { exact: true }).inputValue());
  expect(Math.abs(lat - 18.52)).toBeLessThan(1);
  expect(Math.abs(lon - 73.86)).toBeLessThan(1);
  await page.goto('/#/forecast');
  await expect(page.getByText('Unregistered place preview', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Weather data by Open-Meteo.com' }).first()).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'artifacts/browser/location-forecast-preview.png' });

  await page.goto('/#/municipal');
  await expect(page.getByText(/Municipal access required|Municipal access is required|authorised municipal/i).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/permission-state.png' });
  await page.goto('/#/groundwater');
  await expect(page.getByRole('heading', { name: 'No groundwater record available' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/partial-state.png' });

  await page.route('**/api/v1/weather/forecast?**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'AUTOMATED TEST provider failure' } }) });
  });
  await page.goto('/#/forecast');
  await expect(page.getByText('Retrieving the real forecast for your property…', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/loading-state.png' });
  await expect(page.getByText('AUTOMATED TEST provider failure', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/error-state.png' });
  await page.unroute('**/api/v1/weather/forecast?**');
  await page.goto('/#/maintenance');
  await page.screenshot({ path: 'artifacts/browser/success-state.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My overview', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: 'artifacts/browser/landing-reduced-motion.png' });
});
