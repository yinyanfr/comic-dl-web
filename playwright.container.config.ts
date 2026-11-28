import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/container",
  outputDir: "test-results/container",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  use: { browserName: "chromium" },
});
