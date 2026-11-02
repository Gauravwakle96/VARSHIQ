import { defineConfig } from '@playwright/test';
import path from 'node:path';
const root = process.cwd();
const backend = path.join(root, 'backend');
const python = process.platform === 'win32' ? path.join(backend, '.venv', 'Scripts', 'python.exe') : path.join(backend, '.venv', 'bin', 'python');
const database = path.join(backend, 'data', `e2e-test-${Date.now()}.db`).replaceAll('\\', '/');
export default defineConfig({
  testDir: './tests/browser', timeout: 180000, expect: { timeout: 15000 }, workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.platform === 'win32' ? 'msedge' : undefined,
         trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8001`, cwd: backend,
      url: 'http://127.0.0.1:8001/api/v1/health', timeout: 30000, reuseExistingServer: false,
      env: { APP_ENV: 'test', DATABASE_URL: `sqlite:///${database}`, ALLOWED_ORIGINS: 'http://127.0.0.1:5174', REFRESH_INTERVAL_SECONDS: '1800' } },
    { command: 'npm run dev -- --port 5174', cwd: path.join(root, 'frontend'), url: 'http://127.0.0.1:5174',
      timeout: 30000, reuseExistingServer: false, env: { VARSHIQ_API_TARGET: 'http://127.0.0.1:8001' } },
  ],
});
