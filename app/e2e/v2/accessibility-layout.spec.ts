import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { harnessCommand } from "../harness";

async function ready(page: Page): Promise<void> {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
}

test("TASK17_V2_A11Y keeps core states semantic and keyboard reachable", async ({ page }) => {
  await page.goto(".");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expectNoAxeViolations(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "시작하기" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 300, 10);
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await expect(page.locator("[aria-labelledby=stop-title]")).toBeVisible();
  await expectNoAxeViolations(page);
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);
});

test("TASK17_V2_LAYOUT contains one phone canvas at required widths", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await ready(page);
    const metrics = await page.locator("main.app-shell").evaluate((main) => {
      const box = main.getBoundingClientRect();
      return {
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        left: box.left,
        right: box.right,
        width: box.width,
        undersized: [...main.querySelectorAll("button, select, label.choice")]
          .map((node) => node.getBoundingClientRect())
          .filter((box) => box.width < 44 || box.height < 44).length,
      };
    });
    expect(metrics.bodyOverflow).toBe(false);
    expect(metrics.undersized).toBe(0);
    expect(metrics.width).toBeLessThanOrEqual(480);
    if (viewport.width > 480) {
      expect(Math.abs(metrics.left - (viewport.width - metrics.right))).toBeLessThanOrEqual(1);
    }
  }
});

test("TASK17_V2_LAYOUT survives 200 percent text and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 780 });
  await ready(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.getByRole("button", { name: "목적지 확인", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "중단", exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await expect(page.locator(".finding-mark")).toHaveCSS("animation-name", "none");
});

test("TASK17_V2_LAYOUT wraps hostile unbroken Korean at 200 percent text", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 780 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(".");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      const hostile = "가".repeat(300);
      for (const node of document.querySelectorAll<HTMLElement>(
        "h1, h2, h3, p, span, legend, label, button",
      )) {
        if (node.childElementCount === 0) {
          node.textContent = hostile;
        }
      }
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
