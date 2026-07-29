import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  capture,
  control,
  driveCredibleArrival,
  emitHeading,
  emitLocation,
  installDeterministicClock,
  installDeterministicLocation,
  ready,
  verifyOfflineShell,
} from "../../qa/browser/v2/fixtures/real-worker";

const BASE_URL = process.env.SOMEWHERE_PREPARED_BASE_URL ?? "https://127.0.0.1:8787/";

test("real browser session handshake reaches the Worker", async ({ page }, testInfo) => {
  // Given: an unmodified Chromium or WebKit same-origin browser request shape.
  const session = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/session") && response.status() === 200,
  );
  const journey = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/journeys") &&
      response.request().method() === "POST" &&
      response.status() === 201,
  );

  // When: the user starts a real hidden journey with browser geolocation.
  await ready(page);

  // Then: both API handshakes succeed and the Worker renders its ready projection.
  expect((await session).status()).toBe(200);
  expect((await journey).status()).toBe(201);
  const layout = await page.locator("main.app-shell").evaluate((shell) => {
    const button = shell.querySelector<HTMLElement>('[data-action="commit"]');
    const panel = shell.querySelector<HTMLElement>(".hidden-place");
    const marker = shell.querySelector<HTMLElement>(".hidden-mark");
    const rows = shell.querySelector<HTMLElement>(".info-rows");
    if (button === null || panel === null || marker === null || rows === null) {
      throw new TypeError("ready surface is incomplete");
    }
    const buttonBox = button.getBoundingClientRect();
    const markerBox = marker.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const rowsBox = rows.getBoundingClientRect();
    return {
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      markerContained:
        markerBox.left >= panelBox.left &&
        markerBox.right <= panelBox.right &&
        markerBox.width <= 80 &&
        markerBox.height <= 80,
      markerRowsOverlap: markerBox.bottom > rowsBox.top,
      overlap: panelBox.bottom > buttonBox.top,
      viewport: { height: innerHeight, width: innerWidth },
    };
  });
  expect(layout).toEqual({
    horizontalOverflow: false,
    markerContained: true,
    markerRowsOverlap: false,
    overlap: false,
    viewport: { height: 844, width: 390 },
  });
  await capture(page, `real-${testInfo.project.name}-handshake-ready`);
});

test("real Worker preserves orthogonal Reveal and guarded Stop recovery", async ({
  context,
  page,
}) => {
  // Given: a production build using browser sensors and the same-origin Wrangler API.
  const failures: string[] = [];
  const apiBodies: string[] = [];
  page.on("console", (message) => message.type() === "error" && failures.push(message.text()));
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      response.text().then(
        (body) => apiBodies.push(body),
        (error) => failures.push(error.message),
      );
    }
  });
  await installDeterministicLocation(context, {
    accuracy: 8,
    latitude: 37.54385,
    longitude: 127.03695,
  });
  await ready(page);
  expect(await page.evaluate(() => Reflect.has(window, "somewhereTest"))).toBe(false);
  await capture(page, "real-ready-390x844");

  // When: the user follows, crosses magnetic north, reveals, pauses, and recovers a route.
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await emitHeading(page, 359);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  const before = await page.locator("[data-compass-needle]").evaluate((node) => node.style.cssText);
  await emitHeading(page, 1);
  await expect
    .poll(() => page.locator("[data-compass-needle]").evaluate((node) => node.style.cssText))
    .not.toBe(before);
  const after = await page.locator("[data-compass-needle]").evaluate((node) => node.style.cssText);
  expect(before).not.toBe(after);
  await capture(page, "real-following-390x844");
  await expect.poll(() => apiBodies.length).toBeGreaterThanOrEqual(3);
  expect(apiBodies.join("\n")).not.toContain("센터커피 서울숲점");
  await page.getByRole("button", { name: "목적지 확인" }).click();
  await expect(page.getByText("센터커피 서울숲점")).toBeVisible();
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await capture(page, "real-revealed-following-390x844");
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await expect(page.getByRole("heading", { name: "정말 중단할까요?" })).toBeVisible();
  await capture(page, "real-stop-confirm-390x844");
  await page.getByRole("button", { name: "계속하기" }).click();
  await emitLocation(page, { accuracy: 8, latitude: 37.54386, longitude: 127.03696 });
  await emitHeading(page, 2);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();
  await emitLocation(page, { accuracy: 8, latitude: 37.55, longitude: 127.06 });
  await expect(page.getByRole("button", { name: "안내 복구 살펴보기" })).toBeVisible();
  await capture(page, "real-route-failure-390x844");
  await page.getByRole("button", { name: "안내 복구 살펴보기" }).click();
  await page.getByRole("button", { name: "확인된 경로 이어가기" }).click();
  await emitLocation(page, { accuracy: 8, latitude: 37.54387, longitude: 127.03697 });
  await emitHeading(page, 3);
  await expect(page.locator("[data-compass-needle]")).toBeVisible();

  // Then: stopping is explicit, reason/recommendation recovery is guarded, and no client fake leaks.
  await page.getByRole("button", { name: "중단", exact: true }).click();
  await page.getByRole("button", { name: "중단 확정" }).click();
  await expect(page.getByRole("heading", { name: "중단한 이유가 있나요?" })).toBeVisible();
  await capture(page, "real-stop-reason-390x844");
  await page.getByRole("button", { name: "길 안내가 불안정해요" }).click();
  await page.getByRole("button", { name: "새 장소 찾기" }).click();
  await expect(page.getByRole("heading", { name: "바꿀 조건을 확인해요." })).toBeVisible();
  await capture(page, "real-recovery-review-390x844");
  await page.getByRole("button", { name: "확인하고 다시 찾기" }).click();
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
  expect(apiBodies.join("\n")).toContain("센터커피 서울숲점");
  expect(failures).toEqual([]);
});

test("strong arrival retains one raw feedback capability across a context restart", async ({
  browser,
}) => {
  // Given: a fresh real-browser session with feedback consent seeded only through the local gate.
  const context = await browser.newContext({
    baseURL: BASE_URL,
    geolocation: { accuracy: 8, latitude: 37.54385, longitude: 127.03695 },
    ignoreHTTPSErrors: true,
    permissions: ["geolocation"],
    viewport: { height: 844, width: 390 },
  });
  await installDeterministicLocation(context, {
    accuracy: 8,
    latitude: 37.54385,
    longitude: 127.03695,
  });
  let page = await context.newPage();
  await installDeterministicClock(page);
  page.on("request", (request) => {
    if (request.url().endsWith("/arrival")) {
      console.log(`[ARRIVAL-REQUEST] ${request.method()} ${request.url()}`);
    }
  });
  await ready(page);
  expect(await control(page, 0, true)).toMatchObject({ status: 200 });
  await page.getByRole("button", { name: "이곳으로 출발" }).click();
  await emitHeading(page, 0);
  const arrivalResponse = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith("/arrival"),
  );

  // When: credible sub-100m route samples end with four strong samples over twelve seconds.
  await driveCredibleArrival(page);
  await expect(page.getByRole("heading", { name: "도착했어요." })).toBeVisible();
  const arrivalStatus = (await arrivalResponse).status();
  console.log(`[ARRIVAL-RESPONSE] ${arrivalStatus}`);
  expect(arrivalStatus).toBe(200);
  await capture(page, "real-arrived-390x844");
  const state = await context.storageState({ indexedDB: true });
  expect(JSON.stringify(state)).toContain("fb_v1.");
  expect(await control(page, 3_600_000, false)).toMatchObject({ status: 200 });
  await context.close();

  // Then: one delayed prompt survives restart, one reaction consumes it, and storage is deleted.
  const restarted = await browser.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    storageState: state,
  });
  page = await restarted.newPage();
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "이 장소는 어땠나요?" })).toBeVisible();
  await capture(page, "real-feedback-after-restart-390x844");
  await page.getByRole("button", { exact: true, name: "좋아요" }).click();
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  expect(JSON.stringify(await restarted.storageState({ indexedDB: true }))).not.toContain("fb_v1.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "이 장소는 어땠나요?" })).toHaveCount(0);
  await restarted.close();
});

test("production mobile surface is private, offline-safe, accessible, and contained", async ({
  page,
}) => {
  // Given: the exact production shell at every required viewport.
  for (const viewport of [
    { height: 780, width: 320 },
    { height: 844, width: 390 },
    { height: 932, width: 430 },
    { height: 900, width: 1280 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(".");
    const metrics = await page.locator("main.app-shell").evaluate((shell) => {
      const box = shell.getBoundingClientRect();
      return {
        centered: Math.abs(box.left - (innerWidth - box.right)),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        width: box.width,
      };
    });
    expect(metrics.overflow).toBe(false);
    expect(metrics.width).toBeLessThanOrEqual(480);
    if (viewport.width > 480) {
      expect(metrics.centered).toBeLessThanOrEqual(1);
    }
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
        .violations,
    ).toEqual([]);
    await capture(page, `real-start-${viewport.width}x${viewport.height}`);
  }

  // When: the installed service worker reloads offline and storage is inspected.
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(".");
  const cacheUrls = await verifyOfflineShell(page);

  // Then: no API/private identity is cached and no fake or direct-bearing fallback exists.
  const cachePathnames = cacheUrls.map((url) => new URL(url).pathname);
  expect(cachePathnames.some((value) => value.endsWith("/") || value.endsWith("/index.html"))).toBe(
    true,
  );
  expect(cachePathnames.some((value) => value.endsWith(".js"))).toBe(true);
  expect(cachePathnames.some((value) => value.endsWith(".css"))).toBe(true);
  expect(cacheUrls.some((url) => url.includes("/api/"))).toBe(false);
  expect(cacheUrls.join("\n")).not.toContain("센터커피 서울숲점");
  expect(await page.evaluate(() => Reflect.has(window, "somewhereTest"))).toBe(false);
  await capture(page, "real-offline-reload-390x844");
});
