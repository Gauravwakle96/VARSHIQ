import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

test('automatic map search preserves roof selection, follows properties and rejects stale results', async ({ page }) => {
  // Synthetic properties and provider responses only in the isolated test database.
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = await page.request.get('/api/v1/auth/session').then(r => r.json());
  const owner = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-CSRF-Token': session.data.csrf_token }, data: {
      name: 'AUTOMATED TEST map navigation', email: `map-${Date.now()}@example.com`, password: 'AUTOMATED-TEST-password-2026',
    },
  }).then(r => r.json());
  const ids: string[] = [];
  for (const [index, latitude, longitude] of [[1, 19.076, 72.8777], [2, 18.5204, 73.8567]]) {
    const response = await page.request.post('/api/v1/buildings', {
      headers: { 'X-CSRF-Token': owner.data.csrf_token }, data: {
        name: `AUTOMATED TEST building ${index}`, property_type: 'residential', locality: 'AUTOMATED TEST', latitude, longitude,
      },
    });
    expect(response.ok()).toBe(true);
    ids.push((await response.json()).data.id);
  }
  let mode = 'normal';
  const calls: URL[] = [];
  let release: () => void = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/buildings/lookup?**', async route => {
    const url = new URL(route.request().url());
    calls.push(url);
    const requestMode = mode;
    if (requestMode === 'delayed') await delayed;
    if (requestMode === 'failure') {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { message: 'AUTOMATED TEST provider unavailable' } }) });
      return;
    }
    const latitude = Number(url.searchParams.get('latitude'));
    const longitude = Number(url.searchParams.get('longitude'));
    const name = requestMode === 'delayed' ? 'AUTOMATED TEST stale roof' : `AUTOMATED TEST outline ${latitude}`;
    const data = { provider: 'osm', search_scope: 'neighbourhood', retrieved_at: new Date().toISOString(),
      attribution: 'AUTOMATED TEST geography', limitations: ['Synthetic provider response'], features: requestMode === 'empty' ? [] : [{
        type: 'Feature', id: name, properties: { name }, geometry: { type: 'Polygon', coordinates: [[
          [longitude + .001, latitude], [longitude + .0012, latitude], [longitude + .0012, latitude + .0002],
          [longitude + .001, latitude + .0002], [longitude + .001, latitude],
        ]] },
      }],
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) }).catch(() => {});
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/map');
  await expect(page.getByText('1 building outline found', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].searchParams.get('provider')).toBe('auto');
  await expect(page.getByLabel('Lookup longitude', { exact: true })).toHaveValue('72.8777');
  await expect(page.locator('.map-coverage-note')).toContainText('Your original pin has not moved');
  await page.getByLabel('Choose a building outline').selectOption('0');
  await expect(page.getByText(/m² map-estimated area/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'This is my building and the outline looks correct', exact: true }).check();
  // Wait beyond the debounce: picking a roof must not look up its corner and lose confirmation.
  await page.waitForTimeout(900);
  expect(calls).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Use this estimate for my property', exact: true })).toBeEnabled();

  await page.getByLabel('Active property', { exact: true }).selectOption(ids[1]);
  await expect(page.getByLabel('Lookup latitude', { exact: true })).toHaveValue('18.5204');
  await expect(page.getByRole('checkbox', { name: 'This is my building and the outline looks correct', exact: true })).toHaveCount(0);
  await expect(page.getByText('1 building outline found', { exact: true })).toBeVisible();
  expect(calls.at(-1)!.searchParams.get('longitude')).toBe('73.8567');

  mode = 'delayed';
  await page.getByLabel('Lookup latitude', { exact: true }).fill('18.53');
  await expect.poll(() => calls.at(-1)!.searchParams.get('latitude')).toBe('18.53');
  mode = 'normal';
  await page.getByLabel('Lookup latitude', { exact: true }).fill('18.54');
  await expect(page.getByText('1 building outline found', { exact: true })).toBeVisible();
  release();
  await page.getByLabel('Choose a building outline').selectOption('0');
  await expect(page.locator('.selected-footprint')).toContainText('AUTOMATED TEST outline 18.54');
  await expect(page.getByText('AUTOMATED TEST stale roof', { exact: true })).toHaveCount(0);

  mode = 'empty';
  await page.getByLabel('Lookup latitude', { exact: true }).fill('18.55');
  await expect(page.getByText('No mapped outlines here yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose a building outline')).toHaveCount(0);
  const checkMapUrl = await page.getByRole('link', { name: 'Check in Google Maps', exact: false }).getAttribute('href');
  expect(new URL(checkMapUrl!).searchParams.get('query')).toBe(`18.55,${await page.getByLabel('Lookup longitude', { exact: true }).inputValue()}`);

  mode = 'failure';
  await page.getByRole('button', { name: 'Find nearby buildings', exact: true }).click();
  await expect(page.getByText('AUTOMATED TEST provider unavailable', { exact: true })).toBeVisible();
  mode = 'normal';
  await page.getByRole('button', { name: 'Find nearby buildings', exact: true }).click();
  await expect(page.getByText('1 building outline found', { exact: true })).toBeVisible();

  await mkdir('artifacts/map', { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `artifacts/map/automatic-${viewport.width}.png`, fullPage: true });
  }
  // Drawing remains usable and is not mistaken for a request to move the search pin.
  await page.getByRole('button', { name: 'Draw building polygon', exact: true }).click();
  const map = page.locator('.building-map');
  const beforeDrawing = calls.length;
  await map.click({ position: { x: 220, y: 260 } });
  await map.click({ position: { x: 250, y: 260 } });
  await map.click({ position: { x: 250, y: 290 } });
  await page.getByRole('button', { name: 'Finish polygon', exact: true }).click();
  await expect(page.getByText(/m² footprint estimate/)).toBeVisible();
  await page.waitForTimeout(900);
  expect(calls).toHaveLength(beforeDrawing);
  expect(errors).toEqual([]);
});
