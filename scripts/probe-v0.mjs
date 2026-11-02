import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://v0.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: 'artifacts/v0-access.png', fullPage: false });
  console.log(JSON.stringify({ title: await page.title(), url: page.url(), text: (await page.locator('body').innerText()).slice(0,9000) }));
} finally { await browser.close(); }
