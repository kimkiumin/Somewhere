import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { harnessCommand } from "./harness";

async function expectAccessible(page: Page): Promise<void> {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

async function ready(page: Page): Promise<void> {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
}

test("has no automated WCAG A/AA violations across core V2 states", async ({ page }) => {
  await page.goto(".");
  await expectAccessible(page);
  await ready(page);
  await expectAccessible(page);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
  await expectAccessible(page);
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await expectAccessible(page);
});

test("keeps keyboard focus visible and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(".");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "시작하기" })).toBeFocused();
  await expect(page.locator(":focus-visible")).toHaveCount(1);
});

test("moves focus through user-triggered phases without replacing the live region", async ({
  page,
}) => {
  await page.goto(".");
  const live = await page.locator('[aria-live="polite"]').elementHandle();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page.getByRole("heading", { name: "포기할 수 없는 것만 정해요." })).toBeFocused();
  expect(await live?.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await expect(
    page.getByRole("heading", { name: "조건에 맞는 곳을 살펴보고 있어요." }),
  ).toBeFocused();
  expect(await live?.evaluate((node) => node.isConnected)).toBe(true);
});

test("keeps diagnostics absent from the consumer and touch controls large", async ({ page }) => {
  await ready(page);
  await expect(page.getByText(/field diagnostics|trace events/i)).toHaveCount(0);
  const undersized = await page.locator("button, select, label.choice").evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      }).length,
  );
  expect(undersized).toBe(0);
});

test("does not steal focus for automatic proximity or arrival", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await page.getByRole("button", { name: "중단", exact: true }).focus();
  await harnessCommand(page, "emitDistance", 100, 10);
  await expect(page.getByRole("button", { name: "중단", exact: true })).toBeFocused();
});
