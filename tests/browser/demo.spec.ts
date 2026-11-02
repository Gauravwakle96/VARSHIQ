import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('demo real map, core-engine timeline, scenarios and guided purpose work without registration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const demo = page.getByRole('link', { name: 'Explore Demo', exact: true });
  await expect(demo).toBeVisible();
  const modelResponse = page.waitForResponse(response => response.url().includes('/api/v1/demo/simulate') && response.ok());
  await demo.click();
  const response = await modelResponse;
  const model = (await response.json()).data;
  expect((await response.request().allHeaders()).cookie).toBeUndefined();
  await expect(page.getByTestId('demo-model-status')).toContainText('Simulation ready');
  await expect(page.getByText('Simulated demonstration data.', { exact: true })).toBeVisible();
  await page.getByRole('slider', { name: 'Simulation hour', exact: true }).press('End');
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-hour', '48');
  const storage = Number(await page.getByTestId('demo-scene').getAttribute('data-storage'));
  expect(storage).toBeCloseTo(model.calculation.final_storage_l, 6);

  const footprints = page.waitForResponse(response => response.url().includes('/api/v1/demo/footprints') && response.ok());
  await page.getByRole('button', { name: 'Find real buildings here' }).click();
  const geography = (await (await footprints).json()).data;
  expect(geography.data_kind).toBe('real_public_geography');
  expect(geography.features.length).toBeGreaterThan(0);
  const selector = page.getByLabel('Actual building outline', { exact: true });
  await expect(selector).toBeVisible();
  await selector.selectOption(String(geography.features[0].id));
  await expect(page.getByText(/outline selected/).first()).toBeVisible();
  await expect(page.locator('.demo-map-mini-twin strong')).toHaveText('SIMULATION');
  await expect(page.locator('.demo-map-mini-twin small')).toHaveText(`${(model.calculation.final_storage_l / model.calculation.capacity_l * 100).toFixed(1)}% · hour 48`);
  await page.locator('.demo-real-map path[stroke="#047965"]').click();
  await expect(selector).toHaveValue(String(geography.features[0].id));
  await expect(page.getByRole('slider', { name: 'Illustrative connected roof area' })).toHaveValue('120');
  await expect.poll(async () => page.locator('.demo-real-map img.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await mkdir('artifacts/demo', { recursive: true });
  await page.locator('.demo-workbench').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/demo/real-map-1440x900.png' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await page.locator('.demo-real-map').scrollIntoViewIfNeeded();
    await expect.poll(async () => page.locator('.demo-map-twin-marker').evaluate(element => {
      const marker = element.getBoundingClientRect();
      const map = document.querySelector('.demo-real-map')!.getBoundingClientRect();
      return marker.left >= map.left && marker.right <= map.right && marker.top >= map.top && marker.bottom <= map.bottom;
    })).toBe(true);
    await page.screenshot({ path: `artifacts/demo/real-map-${viewport.width}x${viewport.height}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Next simulation hour' }).isEnabled();
  await page.getByRole('button', { name: 'Reset simulation timeline' }).click();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  const hour = await page.getByTestId('demo-scene').getAttribute('data-hour');
  await page.getByRole('button', { name: 'Next simulation hour' }).click();
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-hour', String(Number(hour) + 1));
  await expect(page.locator('.demo-map-mini-twin small')).toContainText(`hour ${Number(hour) + 1}`);

  for (const step of ['Who benefits', 'Follow the water', 'Compare storage', 'Community choices', 'Know the limits']) {
    await page.getByRole('navigation', { name: 'Guided tour steps' }).getByRole('button', { name: new RegExp(step) }).click();
    await expect(page.getByRole('navigation', { name: 'Guided tour steps' }).getByRole('button', { name: new RegExp(step) })).toHaveAttribute('aria-current', 'step');
  }
  await expect(page.getByRole('heading', { name: 'Useful intelligence begins with honest evidence.' })).toBeVisible();

  const heavyResponse = page.waitForResponse(response => response.url().includes('/demo/simulate') && response.request().postDataJSON()?.rainfall_mm === 90 && response.ok());
  await page.getByRole('button', { name: 'Heavy bursts' }).click();
  const heavy = (await (await heavyResponse).json()).data;
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-capacity', String(heavy.inputs.capacity_l));
  expect(heavy.calculation.overflow_l).toBeGreaterThan(0);

  const dryResponse = page.waitForResponse(response => response.url().includes('/demo/simulate') && response.request().postDataJSON()?.weather === 'dry' && response.ok());
  await page.getByRole('button', { name: 'Dry spell', exact: true }).click();
  const dry = (await (await dryResponse).json()).data;
  expect(dry.calculation.net_inflow_l).toBe(0);
  await expect(page.getByText(/No upgrade selected: the current rainfall/)).toBeVisible();
  await expect(page.locator('.demo-result-grid')).toBeVisible();
  await page.getByRole('link', { name: 'Create your real water picture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start with your real property.', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your name', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to VARSHIQ.', exact: true })).toBeVisible();
});

test('changing map location clears outlines and changing inputs hides stale simulated tank readings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Explicitly synthetic provider geometry, restricted to this automated test.
  await page.route('**/api/v1/demo/footprints?**', route => route.fulfill({
    json: { data: {
      data_kind: 'real_public_geography', water_inputs: 'simulated_unverified', persisted: false,
      provider: 'osm', retrieved_at: '2026-01-01T00:00:00+00:00', attribution: 'AUTOMATED TEST geometry', limitations: [],
      features: [{ type: 'Feature', id: '999', geometry: { type: 'Polygon', coordinates: [[[75.3433,19.8762],[75.3434,19.8762],[75.3434,19.8763],[75.3433,19.8762]]] },
        properties: { name: 'AUTOMATED TEST outline', footprint_area_m2: 50, centroid: { latitude: 19.87623, longitude: 75.34337 } } }],
    } },
  }));
  await page.goto('/#/demo');
  await expect(page.getByTestId('demo-model-status')).toContainText('Simulation ready');
  await page.getByRole('button', { name: 'Find real buildings here' }).click();
  await page.getByLabel('Actual building outline', { exact: true }).selectOption('999');
  const reading = page.locator('.demo-map-mini-twin small');
  await expect(reading).toHaveText('25.0% · hour 0');
  const tank = page.locator('.demo-map-mini-tank > span');
  await tank.evaluate(element => { element.setAttribute('data-qa-original-node', 'true'); });
  await page.getByRole('button', { name: 'Next simulation hour' }).click();
  await expect(reading).toContainText('hour 1');
  await expect(tank).toHaveAttribute('data-qa-original-node', 'true');

  let releaseSlow!: () => void;
  let finishSlow!: () => void;
  const gate = new Promise<void>(resolve => { releaseSlow = resolve; });
  const slowDone = new Promise<void>(resolve => { finishSlow = resolve; });
  await page.route('**/api/v1/demo/simulate', async route => {
    const response = await route.fetch();
    const slow = route.request().postDataJSON().rainfall_mm === 24;
    if (slow) await gate;
    await route.fulfill({ response });
    if (slow) finishSlow();
  });
  try {
    const slowStarted = page.waitForRequest(request => request.url().includes('/demo/simulate') && request.postDataJSON()?.rainfall_mm === 24);
    await page.getByRole('button', { name: 'Steady rain', exact: true }).click();
    await slowStarted;
    await expect(page.locator('.demo-map-twin-marker')).not.toBeVisible();
    await expect(page.locator('.demo-result-grid')).toHaveCount(0);
    const latestResponse = page.waitForResponse(response => response.url().includes('/demo/simulate') && response.request().postDataJSON()?.rainfall_mm === 90 && response.ok());
    await page.getByRole('button', { name: 'Heavy bursts', exact: true }).click();
    const latest = (await (await latestResponse).json()).data;
    await expect(reading).toHaveText('25.0% · hour 0');
    releaseSlow();
    await slowDone;
    const expected = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(latest.calculation.net_inflow_l);
    await expect(page.locator('.demo-result-grid')).toContainText(expected);
  } finally { releaseSlow(); }
  await page.getByLabel('Map location', { exact: true }).selectOption('Pune');
  await expect(page.locator('.demo-map-twin-marker')).toHaveCount(0);
  await expect(page.getByLabel('Actual building outline', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Illustrative connected roof area' })).toHaveValue('120');
});

test('demo accessibility, reduced motion and service failures preserve explanation and private boundary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const privateRequests: string[] = [];
  page.on('request', request => { if (/\/api\/v1\/(auth|buildings|dashboard)/.test(request.url())) privateRequests.push(request.url()); });
  await page.goto('/#/demo');
  await expect(page.getByTestId('demo-model-status')).toContainText('Simulation ready');
  expect(privateRequests).toEqual([]);
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-hour', '0');
  await expect(page.getByRole('button', { name: 'Reduced motion', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next simulation hour' }).click();
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-hour', '1');

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/demo/tour-${viewport.width}x${viewport.height}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) })), `${viewport.width}`).toEqual([]);
  }
  await page.route('**/api/v1/demo/footprints?**', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'AUTOMATED TEST geography unavailable' } }) }));
  await page.getByRole('button', { name: 'Find real buildings here' }).click();
  await expect(page.getByText('AUTOMATED TEST geography unavailable', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry building lookup' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/demo/partial-geography.png' });

  await page.route('**/api/v1/demo/simulate', async route => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'AUTOMATED TEST simulation unavailable' } }) });
  });
  await page.reload();
  await expect(page.getByTestId('demo-model-status')).toContainText('Updating');
  await page.screenshot({ path: 'artifacts/demo/loading.png' });
  await expect(page.getByText('AUTOMATED TEST simulation unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry simulation', exact: true })).toBeVisible();
  expect(await page.locator('.demo-result-grid').count()).toBe(0);
  await page.screenshot({ path: 'artifacts/demo/error.png' });
  await page.unroute('**/api/v1/demo/simulate');
  await page.getByRole('button', { name: 'Retry simulation', exact: true }).click();
  await expect(page.getByTestId('demo-model-status')).toContainText('Simulation ready');
  await page.getByRole('link', { name: 'Exit demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible();
});
