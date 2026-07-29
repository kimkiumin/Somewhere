import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { harnessCommand } from "./harness";

const viewports = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
] as const;

async function capture(
  page: Page,
  testInfo: TestInfo,
  viewport: (typeof viewports)[number],
  state: string,
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${viewport.width}x${viewport.height}-${state}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

test("captures every product state and target viewport", async ({ page }, testInfo) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(".");
    await expect(page.getByRole("heading", { name: "Follow the unknown." })).toBeVisible();
    await capture(page, testInfo, viewport, "idle");

    await page.getByRole("button", { name: "Start adventure" }).click();
    await capture(page, testInfo, viewport, "hidden");
    await page.getByRole("button", { name: "Begin walk" }).click();
    await capture(page, testInfo, viewport, "acquiring");

    await harnessCommand(page, "emitDistance", 300, 10);
    await capture(page, testInfo, viewport, "following");
    await harnessCommand(page, "emitDistance", 290, 90);
    await capture(page, testInfo, viewport, "paused");
    await harnessCommand(page, "emitDistance", 100, 10);
    await capture(page, testInfo, viewport, "near");
    await harnessCommand(page, "emitDistance", 20, 10);
    await harnessCommand(page, "emitDistance", 22, 10);
    await harnessCommand(page, "emitDistance", 18, 10);
    await harnessCommand(page, "advanceMs", 3_000);
    await harnessCommand(page, "emitDistance", 19, 10);
    await capture(page, testInfo, viewport, "arrived");
    await page.getByRole("button", { name: "Reveal destination" }).click();
    await capture(page, testInfo, viewport, "revealed");

    await page.goto(".");
    await page.getByRole("button", { name: "Start adventure" }).click();
    await page.getByRole("button", { name: "Give up", exact: true }).click();
    await capture(page, testInfo, viewport, "give-up");

    await page.goto(".");
    await page.getByRole("button", { name: "Open field diagnostics" }).click();
    await capture(page, testInfo, viewport, "diagnostics");

    await page.goto("showcase.html");
    await expect(page.getByRole("heading", { name: "Primitive showcase" })).toBeVisible();
    await capture(page, testInfo, viewport, "showcase");
  }
});
