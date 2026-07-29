import { expect, test } from "@playwright/test";
import { harnessCommand } from "./harness";

test("registers an installable manifest and restores the app shell offline", async ({
  context,
  page,
}) => {
  await page.goto(".");

  const manifestHref = await page.locator("link[rel='manifest']").getAttribute("href");
  expect(manifestHref).toContain("manifest.webmanifest");
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    if (link === null) {
      throw new Error("Manifest link is missing.");
    }
    const response = await fetch(link.href);
    return response.json();
  });
  expect(manifest).toMatchObject({
    name: "Somewhere — Hidden Compass",
    display: "standalone",
    orientation: "portrait-primary",
  });
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker is unavailable in the PWA browser project.");
    }
    await navigator.serviceWorker.ready;
  });
  const cachedUrls = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const requests = await Promise.all(
      cacheNames.map(async (name) => {
        const cache = await caches.open(name);
        return cache.keys();
      }),
    );
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((url) => /diagnostic|trace/i.test(url))).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await context.setOffline(false);
});

test("never exposes an update reload during an active journey", async ({ page }) => {
  await page.goto(".");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 240, 10);

  await harnessCommand(page, "triggerUpdate");

  await expect(page.getByRole("button", { name: "Somewhere 업데이트" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "화살표를 따라가세요." })).toBeVisible();
});

test("offers a user-controlled update while idle", async ({ page }) => {
  await page.goto(".");

  await harnessCommand(page, "triggerUpdate");

  await expect(page.getByRole("button", { name: "Somewhere 업데이트" })).toBeVisible();
});
