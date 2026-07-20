import { defineConfig } from "@playwright/test";

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be assigned by the browser workflow runner.");
}

const baseURL = `http://127.0.0.1:${port}`;
const testDatabaseUrl = process.env.BROWSER_TEST_DATABASE_URL;

if (testDatabaseUrl == null || testDatabaseUrl === "") {
  throw new Error("BROWSER_TEST_DATABASE_URL must be assigned by the browser workflow runner.");
}

export default defineConfig({
  testDir: "./tests/performance/browser",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".tmp/performance/playwright",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `node_modules/.bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/en/login`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      API_KEY_PEPPER: "test-pepper-for-browser-performance-only",
      OPENAI_API_KEY: "test-openai-key-for-browser-performance-only",
      AUTH_SECRET: "test-auth-secret-for-browser-performance-only",
      AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      DEV_AUTH_BYPASS: "true",
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "true",
      R2_ACCOUNT_ID: "test-account",
      R2_BUCKET_NAME: "cashier-browser-performance-test",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key",
      AI_MODEL_TEXT: "test-text-model",
      AI_MODEL_VISION: "test-vision-model",
      BROWSER_WORKFLOW_DIST_DIR: process.env.BROWSER_WORKFLOW_DIST_DIR ?? ".tmp/performance/next-dev",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
