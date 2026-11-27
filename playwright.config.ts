import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = "4173";
const baseURL = `http://${host}:${port}`;
const fixturePort = "4174";
export const fixtureURL = `http://${host}:${fixturePort}`;
export const fixtureDirectory = "test-results/comic-fixture";
export const archiveDirectory = "test-results/manual-downloads";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    browserName: "chromium",
  },
  webServer: [
    {
      command: "npm run start",
      env: { HOST: host, PORT: port, NODE_ENV: "production" },
      url: baseURL,
    },
    {
      command: "npm run start",
      env: {
        HOST: host,
        PORT: fixturePort,
        NODE_ENV: "test",
        COMIC_DL_WEB_FIXTURE: "1",
        COMIC_DL_WEB_FIXTURE_DIR: fixtureDirectory,
        COMIC_DL_WEB_OUTPUT: archiveDirectory,
      },
      url: fixtureURL,
    },
  ],
});
