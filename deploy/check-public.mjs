// Read-only public release check. No accounts, properties or measurements created.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = new URL(process.argv[2] || 'https://varshiq.vercel.app').origin;
const output = new URL('../artifacts/deploy/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
page.setDefaultTimeout(45000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  assert.ok(response.headers()['content-security-policy']);
  await expect(page.getByRole('heading', { name: 'Welcome to VARSHIQ.' })).toBeVisible();
  const modelResponse = page.waitForResponse(r => r.url().includes('/demo/simulate') && r.ok());
  await page.getByRole('link', { name: 'Explore Demo', exact: true }).click();
  const model = (await (await modelResponse).json()).data;
  assert.equal(model.data_kind, 'simulated_demonstration');
  assert.equal(model.persisted, false);
  assert.ok(Math.abs(model.calculation.balance_error_l) < 1e-6);
  await page.getByRole('slider', { name: 'Simulation hour', exact: true }).press('End');
  await expect(page.getByTestId('demo-scene')).toHaveAttribute('data-hour', '48');
  assert.ok(Math.abs(Number(await page.getByTestId('demo-scene').getAttribute('data-storage')) - model.calculation.final_storage_l) < 1e-6);
  const mapResponse = page.waitForResponse(r => r.url().includes('/demo/footprints') && r.ok(), { timeout: 90000 });
  await page.getByRole('button', { name: 'Find real buildings here' }).click();
  const geography = (await (await mapResponse).json()).data;
  assert.equal(geography.data_kind, 'real_public_geography');
  assert.ok(geography.features.length > 0);
  await page.getByLabel('Actual building outline', { exact: true }).selectOption(String(geography.features[0].id));
  await expect(page.locator('.demo-map-mini-twin strong')).toHaveText('SIMULATION');
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  const layouts = [];
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.demo-real-map').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(a11y.violations.map(v => v.id), []);
    await page.screenshot({ path: fileURLToPath(new URL(`public-map-${width}.png`, output)) });
    layouts.push({ width, height, accessibilityViolations: 0 });
  }
  const health = await page.request.get(base + '/api/v1/health');
  assert.equal((await health.json()).data.database, 'postgresql');
  assert.equal((await page.request.get(base + '/api/v1/buildings')).status(), 401);
  const report = await page.request.post(base + '/api/v1/demo/report', { data: {} });
  assert.equal(report.status(), 200);
  assert.equal((await report.body()).subarray(0, 5).toString(), '%PDF-');
  assert.equal(report.headers()['x-varshiq-data-kind'], 'simulated_demonstration');
  assert.deepEqual(errors, []);
  const result = { base, checkedAt: new Date().toISOString(), status: 'passed', realOutlines: geography.features.length, layouts, demoPdf: true, privateAccessDenied: true };
  await writeFile(new URL('public-browser-check.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
