import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = "4173";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    browserName: "chromium",
  },
  webServer: {
    command: "npm run start",
    env: { HOST: host, PORT: port, NODE_ENV: "production" },
    url: baseURL,
  },
});
