import { describe, expect, test } from "vitest";
import { createBrowserLocationSource, normalizeGeolocationPosition } from "./browser-location";

describe("browser location adapter", () => {
  test("normalizes finite Geolocation samples and movement course", () => {
    expect(
      normalizeGeolocationPosition({
        timestamp: 1_000,
        coords: {
          latitude: 37.544_6,
          longitude: 127.037_4,
          accuracy: 12,
          heading: 90,
          speed: 1.2,
        },
      }),
    ).toEqual({
      ok: true,
      sample: {
        coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
        accuracyM: 12,
        capturedAtMs: 1_000,
        movementHeadingTrueDeg: 90,
        speedMps: 1.2,
      },
    });
  });

  test("rejects malformed browser values", () => {
    expect(
      normalizeGeolocationPosition({
        timestamp: 1_000,
        coords: { latitude: "bad", longitude: 127, accuracy: 10 },
      }),
    ).toEqual({ ok: false, failure: { reason: "malformed" } });
  });

  test("cleans a geolocation watch exactly once", () => {
    let clearCount = 0;
    const source = createBrowserLocationSource({
      watchPosition: () => 17,
      clearWatch(id) {
        expect(id).toBe(17);
        clearCount += 1;
      },
    });

    const unsubscribe = source.subscribe(
      () => undefined,
      () => undefined,
    );
    unsubscribe();
    unsubscribe();

    expect(clearCount).toBe(1);
  });
});
