import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type BrowserContext, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.SOMEWHERE_PREPARED_BASE_URL ?? "https://127.0.0.1:8787/";
const CONTROL_URL = new URL("/api/test/v2-control", BASE_URL).href;
const CONTROL_KEY = "somewhere-v2-local-qa";
const EVIDENCE_DIR = process.env.V2_EVIDENCE_DIR ?? "../.omo/evidence/task-19";
const LOCAL_SENSOR_CONTROL = "__somewhereV2LocalSensorControl";

type LocationCoordinates = {
  readonly accuracy: number;
  readonly latitude: number;
  readonly longitude: number;
};

export async function capture(page: Page, name: string): Promise<void> {
  const project =
    page.context().browser()?.browserType().name() === "webkit"
      ? "webkit-mobile"
      : "chromium-mobile";
  const evidenceName =
    process.env.SOMEWHERE_PREPARED_BASE_URL === undefined
      ? name
      : `${project}-${name.replace(/^real-(chromium-mobile|webkit-mobile)-/, "real-")}`;
  await mkdir(path.join(EVIDENCE_DIR, "visual"), { recursive: true });
  await page.evaluate(() => scrollTo({ behavior: "instant", left: 0, top: 0 }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const metadataPath = path.join(EVIDENCE_DIR, "visual-metadata.json");
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  metadata[evidenceName] = await page.evaluate(() => ({
    devicePixelRatio,
    headerPresent: document.querySelector(".instrument-header") !== null,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollY,
    viewport: { height: innerHeight, width: innerWidth },
  }));
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.join(EVIDENCE_DIR, "visual", `${evidenceName}.png`),
  });
}

export async function emitHeading(page: Page, degrees: number): Promise<void> {
  await page.evaluate((heading) => {
    const event = new Event("deviceorientation");
    Reflect.defineProperty(event, "webkitCompassHeading", { value: heading });
    Reflect.defineProperty(event, "webkitCompassAccuracy", { value: 5 });
    window.dispatchEvent(event);
  }, degrees);
}

export async function installDeterministicLocation(
  context: BrowserContext,
  initial: LocationCoordinates,
): Promise<void> {
  await context.addInitScript(
    ({ coordinates, controlName }) => {
      let nextWatchId = 1;
      let current = coordinates;
      const watchers = new Map<number, PositionCallback>();
      const position = (): GeolocationPosition => ({
        coords: {
          accuracy: current.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          latitude: current.latitude,
          longitude: current.longitude,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
      const publish = (next: LocationCoordinates): void => {
        current = next;
        const sample = position();
        for (const watcher of watchers.values()) {
          watcher(sample);
        }
      };
      const geolocation: Geolocation = {
        clearWatch(watchId) {
          watchers.delete(watchId);
        },
        getCurrentPosition(success) {
          queueMicrotask(() => success(position()));
        },
        watchPosition(success) {
          const watchId = nextWatchId++;
          watchers.set(watchId, success);
          queueMicrotask(() => success(position()));
          return watchId;
        },
      };
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: geolocation,
      });
      Object.defineProperty(window, controlName, {
        configurable: false,
        value: publish,
      });
    },
    { controlName: LOCAL_SENSOR_CONTROL, coordinates: initial },
  );
}

export async function emitLocation(page: Page, coordinates: LocationCoordinates): Promise<void> {
  await page.evaluate(
    ({ controlName, next }) => {
      const control = Reflect.get(window, controlName);
      if (typeof control !== "function") {
        throw new TypeError("Local sensor control is unavailable");
      }
      Reflect.apply(control, window, [next]);
    },
    { controlName: LOCAL_SENSOR_CONTROL, next: coordinates },
  );
}

export async function installDeterministicClock(page: Page): Promise<void> {
  // Freeze the browser at the current wall-clock epoch so its seven-day
  // feedback-retention bound stays aligned with the live local Worker clock.
  await page.clock.install({ time: Date.now() });
}

export async function driveCredibleArrival(page: Page): Promise<void> {
  const routeSamples = [
    [37.54365, 127.0385, 98],
    [37.54345, 127.0402, 98],
    [37.54325, 127.042, 98],
    [37.54305, 127.044, 98],
    [37.54295, 127.046, 95],
    [37.54293, 127.048, 90],
    [37.54292, 127.05, 90],
    [37.54292, 127.052, 90],
    [37.542915, 127.0542, 90],
  ] as const;
  for (const [latitude, longitude, heading] of routeSamples) {
    await emitLocation(page, { accuracy: 8, latitude, longitude });
    await emitHeading(page, heading);
    await page.clock.fastForward(150);
  }
  for (let sample = 0; sample < 5; sample += 1) {
    await emitLocation(page, {
      accuracy: 8,
      latitude: 37.542915,
      longitude: 127.05467 + sample * 0.00001,
    });
    await emitHeading(page, 90);
    if (sample < 4) {
      await page.clock.fastForward(4_100);
    }
  }
}

export async function ready(page: Page): Promise<void> {
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
}

export async function verifyOfflineShell(page: Page): Promise<readonly string[]> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  if (page.context().browser()?.browserType().name() === "webkit") {
    // Playwright WebKit aborts offline navigations internally, so its offline proof inspects the exact precache.
    await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  } else {
    await page.reload();
    await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  }
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        urls.push(request.url);
      }
    }
    return urls;
  });
}

export function control(page: Page, clockOffsetMs: number, grantFeedbackConsent: boolean) {
  return page.evaluate(
    async ({ clockOffsetMs: offset, grantFeedbackConsent: grant, key, url }) => {
      const response = await fetch(url, {
        body: JSON.stringify({ clockOffsetMs: offset, grantFeedbackConsent: grant }),
        headers: { "content-type": "application/json", "x-somewhere-v2-control": key },
        method: "PUT",
      });
      return { body: await response.text(), status: response.status };
    },
    { clockOffsetMs, grantFeedbackConsent, key: CONTROL_KEY, url: CONTROL_URL },
  );
}
