const { defineConfig, devices } = require('@playwright/test');

const serverHost = process.env.PLAYWRIGHT_SERVER_HOST || '127.0.0.1';
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT || '4173';
const baseURL = `http://${serverHost}:${serverPort}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `python server.py`,
    env: {
      ...process.env,
      SERVER_HOST: serverHost,
      SERVER_PORT: serverPort
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000
  }
});
