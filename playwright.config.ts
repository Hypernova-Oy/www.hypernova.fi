import { defineConfig, devices } from '@playwright/test';

/*
 * Where the suite runs, and against what.
 *
 * The default is a dev server on 127.0.0.1:4321 that this config starts itself unless something
 * already answers there - and on a host that runs the site, the deployed build answers there.
 * The suite would then test the deployment instead of the checkout and hide every change under
 * test. `E2E_SERVER=preview` (the `test:e2e:preview` script) starts the build in this checkout
 * with `npm start` instead, on `E2E_PORT`, and refuses to reuse a server that is already there,
 * so such a run cannot quietly test the wrong thing.
 */
const preview = process.env.E2E_SERVER === 'preview';
const port = process.env.E2E_PORT ?? '4321';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: preview
      ? `PORT=${port} HOST=127.0.0.1 npm start`
      : `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !preview,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
