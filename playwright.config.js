import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4181',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        // Full Chromium in new headless mode: the separate headless shell has no Pointer Lock.
        channel: 'chromium',
        launchOptions: { args: ['--ignore-gpu-blocklist', '--use-angle=metal'] },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4181 --strictPort',
    url: 'http://localhost:4181',
    reuseExistingServer: true,
    timeout: 90000,
  },
});
