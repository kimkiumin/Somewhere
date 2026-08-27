import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const defaultEvidenceDir = fileURLToPath(new URL("../.omo/evidence/task-19", import.meta.url));
const evidenceDir = path.resolve(process.env.V2_EVIDENCE_DIR ?? defaultEvidenceDir);
if (process.env.V2_EVIDENCE_DIR === undefined) {
  process.env.V2_EVIDENCE_DIR = evidenceDir;
}
const preparedBaseUrl = process.env.SOMEWHERE_PREPARED_BASE_URL;
const preparedMode = preparedBaseUrl !== undefined;
const projects = preparedMode
  ? [
      {
        name: "chromium-mobile",
        use: {
          ...devices["iPhone 15 Pro Max"],
          browserName: "chromium" as const,
          launchOptions: { args: ["--ignore-certificate-errors"] },
          viewport: { height: 844, width: 390 },
        },
      },
      {
        name: "webkit-mobile",
        use: {
          ...devices["iPhone 15 Pro Max"],
          browserName: "webkit" as const,
          viewport: { height: 844, width: 390 },
        },
      },
    ]
  : [
      {
        name: "chromium-mobile",
        use: {
          ...devices["iPhone 15 Pro Max"],
          browserName: "chromium" as const,
          launchOptions: { args: ["--ignore-certificate-errors"] },
          viewport: { height: 844, width: 390 },
        },
      },
      {
        name: "webkit-handshake",
        grep: /real browser session handshake/,
        use: {
          ...devices["iPhone 15 Pro Max"],
          browserName: "webkit" as const,
          viewport: { height: 844, width: 390 },
        },
      },
    ];

export default defineConfig({
  testDir: "./e2e/v2",
  testMatch: "real-worker-journey.spec.ts",
  ...(preparedMode ? {} : { globalTeardown: "./qa/browser/v2/validator/global-teardown.ts" }),
  outputDir: `${evidenceDir}/playwright-output`,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  workers: 1,
  reporter: [
    ["line"],
    ["json", { outputFile: `${evidenceDir}/playwright-results.json` }],
    ["html", { open: "never", outputFolder: `${evidenceDir}/playwright-report` }],
  ],
  use: {
    ...devices["iPhone 15 Pro Max"],
    baseURL: preparedBaseUrl ?? "https://127.0.0.1:8787/",
    geolocation: { accuracy: 8, latitude: 37.54385, longitude: 127.03695 },
    ignoreHTTPSErrors: true,
    permissions: ["geolocation"],
    serviceWorkers: "allow",
    screenshot: "only-on-failure",
    trace: "on",
    viewport: { height: 844, width: 390 },
  },
  projects,
  ...(preparedMode
    ? {}
    : {
        webServer: {
          command: "bun run --cwd .. local:v2:start-for-qa",
          env: {
            ...process.env,
            V2_EVIDENCE_DIR: evidenceDir,
          },
          reuseExistingServer: false,
          timeout: 120_000,
          url: "https://127.0.0.1:8787/api/v1/health",
          ignoreHTTPSErrors: true,
        },
      }),
});
