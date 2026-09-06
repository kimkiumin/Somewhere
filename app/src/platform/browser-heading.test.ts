import { describe, expect, test, vi } from "vitest";
import {
  createBrowserHeadingSource,
  normalizeBrowserHeadingEvent,
  requestOrientationPermission,
} from "./browser-heading";

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

  test("coalesces orientation bursts to the latest sample in one animation frame", () => {
    let listener: ((event: unknown) => void) | undefined;
    const frames: FrameRequestCallback[] = [];
    const samples: number[] = [];
    const source = createBrowserHeadingSource({
      add(next) {
        listener = next;
      },
      cancelFrame: vi.fn(),
      nowMs: () => 1_000,
      permissionProvider: undefined,
      remove: vi.fn(),
      requestFrame(callback) {
        frames.push(callback);
        return frames.length;
      },
    });
    source.subscribe((sample) => samples.push(sample.degrees), vi.fn());

    listener?.({ webkitCompassHeading: 10, webkitCompassAccuracy: 5 });
    listener?.({ webkitCompassHeading: 20, webkitCompassAccuracy: 5 });

    expect(samples).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0]?.(0);
    expect(samples).toEqual([20]);
  });
});
