import { expect, type Page, test } from "@playwright/test";
import { harnessCommand, harnessSnapshot } from "./harness";

async function ready(page: Page): Promise<void> {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
}

test("completes a hidden V2 journey without leaking identity", async ({ page }) => {
  await ready(page);
  await expect(page.getByText("조용한 정원")).toHaveCount(0);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  for (const distance of [300, 210, 120, 100, 20, 22, 18]) {
    await harnessCommand(page, "emitDistance", distance, 10);
  }
  await harnessCommand(page, "advanceMs", 3_000);
  await harnessCommand(page, "emitDistance", 19, 10);
  await expect(page.getByRole("heading", { name: "도착했어요." })).toBeVisible();
  await expect(page.getByText("조용한 정원")).toHaveCount(0);
  expect((await harnessSnapshot(page)).guidance.status).toBe("inactive");
});

test("keeps Reveal and Stop in the first viewport on target phones", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.getByRole("button", { name: "이곳으로 출발" }).click();
    await harnessCommand(page, "emitDistance", 180, 10);
    for (const name of ["목적지 확인", "중단"] as const) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 10_000) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
    }
  }
});

test("has no Reroll and exits through confirm plus optional reason", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("button", { name: /reroll|다시 뽑/i })).toHaveCount(0);
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await page.getByRole("button", { name: "중단 확정" }).click();
  await expect(page.getByRole("heading", { name: "중단한 이유가 있나요?" })).toBeVisible();
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await expect(page.getByRole("heading", { name: "안전하게 마쳤어요." })).toBeVisible();
});
