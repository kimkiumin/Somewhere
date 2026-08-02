import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { harnessCommand } from "../harness";

type CaptureMetadata = Readonly<{
  cssViewport: Readonly<{ width: number; height: number }>;
  devicePixelRatio: number;
  horizontalOverflow: boolean;
  shell: Readonly<{ left: number; right: number; width: number }>;
  centerErrorCssPx: number;
  textScalePercent: number;
}>;

test("records fresh phone containment and 200 percent text evidence", async ({
  page,
}, testInfo) => {
  const evidenceDir = process.env.TASK17_VISUAL_DIR ?? testInfo.outputPath("task-17-visual");
  await mkdir(evidenceDir, { recursive: true });
  const records: Record<string, CaptureMetadata> = {};

  async function capture(width: number, height: number, textScalePercent = 100): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.goto(".");
    if (textScalePercent === 200) {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
    }
    const key = `${width}x${height}-${textScalePercent}`;
    records[key] = await page.locator("main.app-shell").evaluate(
      (shell, input): CaptureMetadata => {
        const box = shell.getBoundingClientRect();
        return {
          cssViewport: { width: input.width, height: input.height },
          devicePixelRatio: window.devicePixelRatio,
          horizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth,
          shell: { left: box.left, right: box.right, width: box.width },
          centerErrorCssPx: Math.abs(box.left - (input.width - box.right)),
          textScalePercent: input.textScalePercent,
        };
      },
      { width, height, textScalePercent },
    );
    await page.screenshot({
      path: path.join(evidenceDir, `${key}-start.png`),
      fullPage: true,
      animations: "disabled",
    });
  }

  for (const viewport of [
    { width: 320, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await capture(viewport.width, viewport.height);
  }
  await capture(320, 780, 200);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 300, 10);
  await page.screenshot({
    path: path.join(evidenceDir, "390x844-following.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await page.screenshot({
    path: path.join(evidenceDir, "390x844-stop-confirm.png"),
    fullPage: true,
    animations: "disabled",
  });

  expect(records["1280x900-100"]?.shell.width).toBeLessThanOrEqual(480);
  expect(records["1280x900-100"]?.centerErrorCssPx).toBeLessThanOrEqual(1);
  expect(records["320x780-200"]?.horizontalOverflow).toBe(false);
  await writeFile(
    path.join(evidenceDir, "viewport-metadata.json"),
    `${JSON.stringify(records, null, 2)}\n`,
  );
});

test("records no consumer console, page, or failed network errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`page:${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`network:${response.status()}:${new URL(response.url()).pathname}`);
    }
  });
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 300, 10);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  expect(errors).toEqual([]);
});
