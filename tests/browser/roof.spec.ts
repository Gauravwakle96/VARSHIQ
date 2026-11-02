import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const outline = { type: 'Polygon', coordinates: [[[72.8777, 19.076], [72.8778, 19.076],
  [72.8778, 19.0761], [72.8777, 19.0761], [72.8777, 19.076]]] };

test('map outline confirmation, area correction and nearby water guidance are functional', async ({ page }) => {
  // All property/outline fixtures are restricted to the isolated automated-test server.
  const session = await page.request.get('/api/v1/auth/session').then(response => response.json());
  const registered = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-CSRF-Token': session.data.csrf_token }, data: {
      name: 'AUTOMATED TEST Map Owner', email: `roof-owner-${Date.now()}@example.com`, password: 'AUTOMATED-TEST-password-2026',
    },
  }).then(response => response.json());
  const headers = { 'X-CSRF-Token': registered.data.csrf_token };
  const created = await page.request.post('/api/v1/buildings', { headers, data: {
    name: 'AUTOMATED TEST Map Property', property_type: 'residential', locality: 'AUTOMATED TEST Mumbai',
    latitude: 19.076, longitude: 72.8777, runoff_coefficient: .8,
    coefficient_source: 'AUTOMATED TEST assumption', first_flush_mm: 1, collection_efficiency: .9,
    tank_capacity_l: 2000, current_storage_l: 500, daily_demand_l: 100,
  }}).then(response => response.json());
  const id = created.data.id;
  await page.route('**/api/v1/buildings/lookup?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {
    provider: 'osm', retrieved_at: new Date().toISOString(), attribution: 'AUTOMATED TEST synthetic outline',
    limitations: ['AUTOMATED TEST response only'], features: [{ type: 'Feature', id: 'test-roof', geometry: outline,
      properties: { name: 'AUTOMATED TEST roof outline' } }],
  } }) }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/map');
  // Building outlines load without a search click.
  await expect(page.getByText('1 building outline found', { exact: true })).toBeVisible();
  await page.getByLabel('Choose a building outline').selectOption('0');
  await expect(page.getByText(/m² map-estimated area/)).toBeVisible();
  const save = page.getByRole('button', { name: 'Use this estimate for my property', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('checkbox', { name: 'This is my building and the outline looks correct', exact: true }).check();
  await save.click();
  await expect(page).toHaveURL(/#\/property$/);
  await expect(page.getByText('Map estimate · confirmed by you', { exact: true })).toBeVisible();
  const mapped = await page.request.get(`/api/v1/buildings/${id}`).then(response => response.json());
  const fullArea = mapped.data.effective_catchment_m2;
  expect(fullArea).toBeGreaterThan(100);
  expect(mapped.data.measurement_status).toBe('map_estimated');
  expect(mapped.data.roof_area_provenance.field_verified).toBe(false);
  expect(mapped.data.measurements.filter(item => item.status === 'field_verified')).toEqual([]);
  await page.getByRole('button', { name: 'Estimate from this outline', exact: true }).click();
  await expect(page.getByText('m² for collection', { exact: true })).toBeVisible();
  const google = page.getByRole('link', { name: 'Check in Google Maps', exact: false });
  await expect(google).toHaveAttribute('href', /google\.com\/maps\/search/);
  await page.getByText('Only part of my roof collects rain', { exact: true }).click();
  await page.getByLabel('Roof area connected (%)', { exact: false }).fill('50');
  await page.getByRole('checkbox', { name: 'This is my building and the outline looks correct', exact: true }).check();
  await page.getByRole('button', { name: 'Save property changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'How much water could I collect?', exact: true })).toBeEnabled();
  const half = await page.request.get(`/api/v1/buildings/${id}`).then(response => response.json());
  expect(half.data.effective_catchment_m2).toBeCloseTo(fullArea / 2);
  await page.getByRole('button', { name: 'Estimate from this outline', exact: true }).click();
  await mkdir('artifacts/roof', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.screenshot({ path: `artifacts/roof/estimate-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Enter my own area', exact: true }).click();
  await page.locator('[name="effective_catchment_m2"]').fill('90');
  await expect(page.getByRole('button', { name: 'How much water could I collect?', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save property changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'How much water could I collect?', exact: true })).toBeEnabled();
  const corrected = await page.request.get(`/api/v1/buildings/${id}`).then(response => response.json());
  expect(corrected.data.effective_catchment_m2).toBe(90);
  expect(corrected.data.roof_area_provenance).toEqual({});
  const answerPromise = page.waitForResponse(response => response.url().endsWith('/assistant/chat'));
  await page.getByRole('button', { name: 'Suggest improvements', exact: true }).click();
  const answerResponse = await answerPromise;
  expect(answerResponse.ok()).toBe(true);
  const answer = (await answerResponse.json()).data;
  await expect(page.locator('.roof-advice-answer')).toContainText(answer.answer);
  expect(answer.answer).toContain('drains and filters');
  expect(answer.sources.some(item => item.type === 'backend_recommendation')).toBe(true);
  // A real external supplier can be contacted without creating a booking or leaking saved details.
  await page.goto('/#/recommendations');
  await expect(page.getByRole('heading', { name: 'No harvesting system yet?', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse & order parts', exact: false })).toHaveAttribute('href', 'https://shop.rainyfilters.com/');
  await page.getByRole('button', { name: 'Ask about installation', exact: true }).click();
  await expect(page.getByLabel('City or locality', { exact: false })).toHaveValue('');
  await page.getByLabel('City or locality', { exact: false }).fill('Pune');
  const request = await page.getByLabel('Your request draft', { exact: true }).inputValue();
  expect(request).toContain('in Pune');
  expect(request).not.toContain(id);
  expect(request).not.toContain('AUTOMATED TEST');
  const whatsapp = await page.getByRole('link', { name: 'Review on WhatsApp', exact: false }).getAttribute('href');
  expect(new URL(whatsapp!).searchParams.get('text')).toBe(request);
  await expect(page.getByRole('link', { name: 'Use contact form', exact: false })).toHaveAttribute('href', 'https://www.rainyfilters.com/contact-us/enquire');
  await page.getByLabel('What do you need?', { exact: true }).selectOption('repair or an upgrade of a rainwater harvesting system');
  await expect(page.getByLabel('Your request draft', { exact: true })).toHaveValue(/repair or an upgrade/);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => item.id)).toEqual([]);
    await page.screenshot({ path: `artifacts/roof/installation-${viewport.width}.png`, fullPage: true });
  }
});
