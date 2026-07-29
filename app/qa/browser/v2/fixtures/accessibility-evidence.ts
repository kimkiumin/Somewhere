import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const EVIDENCE_DIR = process.env.V2_EVIDENCE_DIR ?? "../.omo/evidence/task-19";

function projectName(page: Page): "chromium-mobile" | "webkit-mobile" {
  return page.context().browser()?.browserType().name() === "webkit"
    ? "webkit-mobile"
    : "chromium-mobile";
}

async function screenshot(page: Page, relative: string): Promise<void> {
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.join(EVIDENCE_DIR, relative),
  });
}

export async function captureAccessibilityEvidence(page: Page): Promise<void> {
  const project = projectName(page);
  const directory = path.join(EVIDENCE_DIR, "accessibility");
  await mkdir(directory, { recursive: true });

  await page.setViewportSize({ height: 780, width: 320 });
  await page.goto(".");
  const initialRootFontPx = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const textResize200 = await page.evaluate(
    ({ initialFontPx, project }) => {
      const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const clippedTextCount = [
        ...document.querySelectorAll("h1,h2,p,button,label,li,dd,dt"),
      ].filter((node) => {
        const element = node as HTMLElement;
        return (
          element.getClientRects().length > 0 &&
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1)
        );
      }).length;
      return {
        clippedTextCount,
        cssViewport: { height: innerHeight, width: innerWidth },
        horizontalOverflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        screenshot: `accessibility/${project}-text-resize-200.png`,
        textScalePercent: Math.round((rootFontPx / initialFontPx) * 100),
      };
    },
    { initialFontPx: initialRootFontPx, project },
  );
  expect(textResize200).toMatchObject({
    clippedTextCount: 0,
    horizontalOverflow: false,
    textScalePercent: 200,
  });
  await screenshot(page, textResize200.screenshot);

  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(".");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).toHaveCount(1);
  const keyboardFocus = await focused.evaluate((node, project) => {
    const style = getComputedStyle(node);
    return {
      focusVisible: node.matches(":focus-visible"),
      input: "Tab",
      outlineStyle: style.outlineStyle,
      outlineWidthCssPx: Number.parseFloat(style.outlineWidth),
      screenshot: `accessibility/${project}-keyboard-focus.png`,
      targetRole: node.tagName.toLowerCase(),
    };
  }, project);
  expect(keyboardFocus).toMatchObject({
    focusVisible: true,
    input: "Tab",
    outlineStyle: "solid",
    targetRole: "button",
  });
  expect(keyboardFocus.outlineWidthCssPx).toBeGreaterThanOrEqual(3);
  await screenshot(page, keyboardFocus.screenshot);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  const findingMark = page.locator(".finding-mark");
  await expect(findingMark).toBeVisible();
  const reducedMotion = await findingMark.evaluate((node, project) => {
    const animationName = getComputedStyle(node).animationName;
    return {
      animationName: animationName === "" ? "none" : animationName,
      mediaQueryMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      requested: "reduce",
      screenshot: `accessibility/${project}-reduced-motion.png`,
    };
  }, project);
  expect(reducedMotion).toMatchObject({
    animationName: "none",
    mediaQueryMatches: true,
    requested: "reduce",
  });
  await screenshot(page, reducedMotion.screenshot);

  const report = {
    keyboardFocus,
    project,
    reducedMotion,
    report: `accessibility/${project}.json`,
    schemaVersion: 1,
    textResize200,
  };
  await writeFile(path.join(EVIDENCE_DIR, report.report), `${JSON.stringify(report, null, 2)}\n`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
}
