import { defineConfig } from '@playwright/test';
const managedServer = process.env.CIVISCOPE_TEST_SERVER === 'true';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || (managedServer ? 'http://localhost:3099' : 'http://localhost:3001'),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: managedServer ? {
    command: 'npm start -- -p 3099',
    url: 'http://localhost:3099/api/health',
    timeout: 30000,
    reuseExistingServer: false,
    env: { CIVISCOPE_DEMO_MODE: 'true', AI_PROVIDER: 'gemini', GEMINI_API_KEY: '', OPENROUTER_API_KEY: '' },
  } : undefined,
});
