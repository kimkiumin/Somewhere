import { expect, type Page, test } from "@playwright/test";
import { harnessCommand } from "./harness";

async function ensureServiceWorkerControls(page: Page): Promise<void> {
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
  if (!controlled) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test("registers an installable manifest and restores the app shell offline", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit cannot navigate an offline service-worker reload on Ubuntu.",
  );
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
  });
  await ensureServiceWorkerControls(page);
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
  expect(
    cachedUrls.some((url) =>
      /(?:\/api\/|journey|route|constraint|feedback|diagnostic|field|harness|source.*map|trace)/i.test(
        url,
      ),
    ),
  ).toBe(false);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await context.setOffline(false);
});

test("never caches a private API response", async ({ page }) => {
  // Given an installed service worker and a network-only private API canary
  await page.route("**/api/v1/private-canary", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ private: true }),
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
    });
  });
  await page.goto(".");
  await ensureServiceWorkerControls(page);

  // When the page fetches the private response through the service worker scope
  const status = await page.evaluate(async () => {
    const response = await fetch("/Somewhere/api/v1/private-canary", {
      cache: "no-store",
    });
    return response.status;
  });

  // Then the response succeeds from the network but is absent from every cache
  expect(status).toBe(200);
  const privateCachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        return cache.keys();
      }),
    );
    return requests
      .flat()
      .map((request) => request.url)
      .filter((url) => url.includes("/api/"));
  });
  expect(privateCachedUrls).toEqual([]);
});

test("keeps valid active guidance only in memory while offline", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit cannot navigate an offline service-worker reload on Ubuntu.",
  );
  // Given an active journey with current in-memory guidance
  await page.goto(".");
  await ensureServiceWorkerControls(page);
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await harnessCommand(page, "emitOrigin");
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await harnessCommand(page, "emitDistance", 240, 10);

  // When the active page loses connectivity
  await context.setOffline(true);

  // Then current guidance remains, but a reload cannot resurrect the journey
  await expect(page.getByRole("heading", { name: "화살표를 따라가세요." })).toBeVisible();
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await harnessCommand(page, "advanceMs", 10_001);
  await expect(page.locator("[data-compass-needle]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "화살표를 따라가세요." })).toHaveCount(0);
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
