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
