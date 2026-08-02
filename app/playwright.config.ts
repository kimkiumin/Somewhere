import { defineConfig, devices } from "@playwright/test";

const previewPort = 4399;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/v2/**",
  outputDir: "../output/playwright",
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${previewPort}/Somewhere/`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: {
        ...devices["iPhone 15 Pro Max"],
        browserName: "chromium",
      },
    },
    {
      name: "webkit-mobile",
      testIgnore: ["**/capture.spec.ts", "**/v2/**"],
      use: {
        ...devices["iPhone 15 Pro Max"],
        browserName: "webkit",
      },
    },
  ],
  webServer: {
    command: `bun run preview:harness --host 127.0.0.1 --port ${previewPort}`,
    url: `http://127.0.0.1:${previewPort}/Somewhere/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
