import { expect, type Page, test } from "@playwright/test";
import { harnessCommand, harnessSnapshot } from "./harness";

async function following(page: Page): Promise<void> {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
}

test("removes stale guidance while keeping every safety control", async ({ page }) => {
  await following(page);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await harnessCommand(page, "emitDistance", 240, 90);
  await expect(page.getByRole("heading", { name: "방향을 다시 확인하고 있어요." })).toBeVisible();
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "안내 복구 살펴보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "목적지 확인", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "중단", exact: true })).toBeVisible();
});

test("does not reuse pre-background samples after returning visible", async ({ page }) => {
  await following(page);
  await harnessCommand(page, "setVisibility", "hidden");
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await harnessCommand(page, "setVisibility", "visible");
  await harnessCommand(page, "emitLocationOnly", 220, 10);
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await harnessCommand(page, "emitHeadingOnly", 180, 8);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
});

test("permission denial remains a safe reveal path", async ({ page }) => {
  await page.goto(".");
  await harnessCommand(page, "setHeadingPermission", "denied");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await page.getByRole("button", { name: "중단 확정" }).click();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.getByRole("button", { name: "목적지 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "조용한 정원" })).toBeVisible();
});

test("expires silent guidance and reacquires a system-released Wake Lock", async ({ page }) => {
  await following(page);
  await harnessCommand(page, "advanceMs", 10_001);
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await harnessCommand(page, "releaseWakeLock");
  await expect
    .poll(async () => (await harnessSnapshot(page)).sensors.wakeLock.status)
    .toBe("active");
});
