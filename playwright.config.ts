import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/playwright.json" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    headless: true,
    viewport: { width: 360, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/browser-artifacts",
});
