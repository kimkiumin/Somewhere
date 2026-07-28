import { describe, expect, test } from "vitest";
import { normalizeBrowserHeadingEvent, requestOrientationPermission } from "./browser-heading";

describe("browser heading adapter", () => {
  test("prefers iOS WebKit magnetic heading and exposes measured accuracy", () => {
    expect(
      normalizeBrowserHeadingEvent(
        {
          webkitCompassHeading: 42,
          webkitCompassAccuracy: 7,
          alpha: 180,
          absolute: true,
        },
        1_000,
      ),
    ).toEqual({
      ok: true,
      sample: {
        degrees: 42,
        reference: "magnetic",
        accuracyDeg: 7,
        capturedAtMs: 1_000,
      },
    });
  });

  test("rejects iOS uncalibrated data and relative alpha", () => {
    expect(
      normalizeBrowserHeadingEvent({ webkitCompassHeading: 42, webkitCompassAccuracy: -1 }, 1_000),
    ).toEqual({ ok: false, failure: { reason: "uncalibrated" } });
    expect(normalizeBrowserHeadingEvent({ alpha: 30, absolute: false }, 1_000)).toEqual({
      ok: false,
      failure: { reason: "unavailable" },
    });
  });

  test("uses absolute alpha as a true-north fallback on supporting devices", () => {
    expect(normalizeBrowserHeadingEvent({ alpha: 90, absolute: true }, 1_000)).toEqual({
      ok: true,
      sample: {
        degrees: 270,
        reference: "true",
        accuracyDeg: null,
        capturedAtMs: 1_000,
      },
    });
  });

  test("normalizes permission results without guessing", async () => {
    await expect(requestOrientationPermission(undefined)).resolves.toEqual({
      status: "unsupported",
    });
    await expect(
      requestOrientationPermission({ requestPermission: () => Promise.resolve("denied") }),
    ).resolves.toEqual({ status: "denied" });
  });
});
