import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { harnessCommand } from "./harness";

const viewports = [
  { width: 320, height: 780 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
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
    fullPage: true,
    animations: "disabled",
  });
}

async function findReady(page: Page): Promise<void> {
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
}

test("captures every V2 product state and target viewport", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(".");
    await capture(page, testInfo, viewport, "start");
    await page.getByRole("button", { name: "시작하기" }).click();
    await capture(page, testInfo, viewport, "constraints");
    await findReady(page);
    await capture(page, testInfo, viewport, "ready");
    await page.getByRole("button", { name: "이곳으로 출발" }).click();
    await harnessCommand(page, "emitDistance", 300, 10);
    await capture(page, testInfo, viewport, "following");
    await page.getByRole("button", { name: "목적지 확인" }).click();
    await capture(page, testInfo, viewport, "revealed-following");
    await harnessCommand(page, "emitDistance", 290, 90);
    await capture(page, testInfo, viewport, "degraded");
    await page.getByRole("button", { name: "안내 복구 살펴보기" }).click();
    await capture(page, testInfo, viewport, "route-recovery");
    await page.getByRole("button", { name: "나침반 다시 맞추기" }).click();
    for (const distance of [210, 120, 100]) {
      await harnessCommand(page, "emitDistance", distance, 10);
    }
    await capture(page, testInfo, viewport, "near");

    await page.goto(".");
    await page.getByRole("button", { name: "시작하기" }).click();
    await findReady(page);
    await page.getByRole("button", { name: "중단", exact: true }).click();
    await capture(page, testInfo, viewport, "stop-confirm");
    await page.getByRole("button", { name: "중단 확정" }).click();
    await capture(page, testInfo, viewport, "stop-reason");
    await page.getByRole("button", { name: "건너뛰기" }).click();
    await capture(page, testInfo, viewport, "completed");
    await page.getByRole("button", { name: "새 장소 찾기" }).click();
    await capture(page, testInfo, viewport, "recovery-review");
  }
});
