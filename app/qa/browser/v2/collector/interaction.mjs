import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const outputPath =
  process.argv[2] ?? path.resolve("../.omo/evidence/task-19/interaction-timing.json");
const browser = await chromium.launch({
  args: ["--ignore-certificate-errors"],
  headless: true,
});

try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto("https://127.0.0.1:8787/");
  await page.evaluate(() => {
    const durations = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ("interactionId" in entry && entry.interactionId > 0) {
          durations.push(entry.duration);
        }
      }
    });
    observer.observe({ buffered: true, durationThreshold: 16, type: "event" });
    Reflect.set(window, "__somewhereV2InteractionDurations", durations);
  });
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).waitFor();
  await page.waitForTimeout(100);
  const durations = await page.evaluate(() => {
    const value = Reflect.get(window, "__somewhereV2InteractionDurations");
    return Array.isArray(value) ? value.filter((item) => typeof item === "number") : [];
  });
  const maxInteractionMs = Math.max(...durations, 0);
  const result = {
    budgetMs: 200,
    eventCount: durations.length,
    maxInteractionMs,
    pass: durations.length > 0 && maxInteractionMs <= 200,
    source: "PerformanceObserver event timing on production Chromium surface",
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (!result.pass) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
