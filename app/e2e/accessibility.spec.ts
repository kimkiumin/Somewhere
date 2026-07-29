import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { harnessCommand } from "./harness";

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("has no automated WCAG A/AA violations across core journey states", async ({ page }) => {
  await page.goto(".");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Start adventure" }).click();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Begin walk" }).click();
  await harnessCommand(page, "emitDistance", 250, 10);
  await expectAccessible(page);
  await harnessCommand(page, "emitDistance", 240, 90);
  await expectAccessible(page);
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expectAccessible(page);
});

test("keeps keyboard focus visible and respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(".");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("button", { name: "Open field diagnostics" })).toBeFocused();
  await expect(page.locator(":focus-visible")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Start adventure" })).toBeFocused();
});

test("moves focus through user-triggered phases without replacing the live region", async ({
  page,
}) => {
  await page.goto(".");
  const liveRegion = await page.locator('[aria-live="polite"]').elementHandle();
  expect(liveRegion).not.toBeNull();

  await page.getByRole("button", { name: "Start adventure" }).click();
  await expect(page.getByRole("heading", { name: "Your destination is hidden." })).toBeFocused();
  expect(await liveRegion?.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Begin walk" }).click();
  await expect(page.getByRole("heading", { name: "Finding your direction…" })).toBeFocused();
  expect(await liveRegion?.evaluate((node) => node.isConnected)).toBe(true);

  await harnessCommand(page, "emitDistance", 250, 10);
  await page.getByRole("button", { name: "Reveal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "가족마당" })).toBeFocused();
  expect(await liveRegion?.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
});

test("focuses diagnostics and restores its opener on close", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Open field diagnostics" }).click();
  await expect(page.getByRole("heading", { name: "Field diagnostics" })).toBeFocused();
  const undersizedControls = await page.locator("button, select").evaluateAll((controls) =>
    controls
      .map((control) => ({
        name: control.textContent?.trim() ?? control.getAttribute("aria-label") ?? control.tagName,
        height: control.getBoundingClientRect().height,
      }))
      .filter((control) => control.height < 48),
  );
  expect(undersizedControls).toEqual([]);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Open field diagnostics" })).toBeFocused();
});

test("does not steal focus for automatic proximity or arrival", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "Start adventure" }).click();
  await page.getByRole("button", { name: "Begin walk" }).click();
  await page.getByRole("button", { name: "Give up", exact: true }).focus();

  await harnessCommand(page, "emitDistance", 100, 10);
  await expect(page.getByRole("button", { name: "Give up", exact: true })).toBeFocused();
  await harnessCommand(page, "emitDistance", 20, 10);
  await harnessCommand(page, "emitDistance", 20, 10);
  await harnessCommand(page, "emitDistance", 20, 10);
  await harnessCommand(page, "advanceMs", 3_000);
  await harnessCommand(page, "emitDistance", 20, 10);
  await expect(page.getByRole("button", { name: "Give up", exact: true })).toBeFocused();
});
