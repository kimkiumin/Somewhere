import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type BrowserContext, expect, type Page } from "@playwright/test";

const CONTROL_URL = "https://127.0.0.1:8787/api/test/v2-control";
const CONTROL_KEY = "somewhere-v2-local-qa";
const EVIDENCE_DIR = process.env.V2_EVIDENCE_DIR ?? "../.omo/evidence/task-19";
const LOCAL_SENSOR_CONTROL = "__somewhereV2LocalSensorControl";

type LocationCoordinates = {
  readonly accuracy: number;
  readonly latitude: number;
  readonly longitude: number;
};

export async function capture(page: Page, name: string): Promise<void> {
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
  metadata[name] = await page.evaluate(() => ({
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
    path: path.join(EVIDENCE_DIR, "visual", `${name}.png`),
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

export async function ready(page: Page): Promise<void> {
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "어딘가로 떠나볼까요?" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "한 곳 찾기" }).click();
  await expect(page.getByRole("heading", { name: "목적지는 아직 비밀이에요." })).toBeVisible();
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
