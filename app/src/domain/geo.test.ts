import { describe, expect, test } from "vitest";
import {
  distanceMeters,
  magneticToTrueDegrees,
  normalizeDegrees,
  shortestAngularDelta,
  trueBearingDegrees,
} from "./geo";

describe("geographic math", () => {
  test("computes literal great-circle distances and true bearings", () => {
    expect(
      distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(111_195, -1);
    expect(
      trueBearingDegrees(
        { latitude: 37.544_644_3, longitude: 127.037_376_9 },
        { latitude: 37.545_033_8, longitude: 127.039_617_2 },
      ),
    ).toBeCloseTo(77.6, 0);
  });

  test("normalizes circular angles and crosses north by the shortest path", () => {
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-1)).toBe(359);
    expect(shortestAngularDelta(359, 1)).toBe(2);
    expect(shortestAngularDelta(1, 359)).toBe(-2);
  });

  test("converts magnetic heading with east-positive declination", () => {
    expect(magneticToTrueDegrees(10, -9.011_45)).toBeCloseTo(0.988_55, 5);
    expect(magneticToTrueDegrees(355, 9)).toBe(4);
  });

  test("rejects non-finite numbers instead of inventing guidance", () => {
    expect(normalizeDegrees(Number.NaN)).toBeNull();
    expect(
      distanceMeters(
        { latitude: Number.POSITIVE_INFINITY, longitude: 127 },
        { latitude: 37, longitude: 127 },
      ),
    ).toBeNull();
    expect(shortestAngularDelta(0, Number.NaN)).toBeNull();
  });
});
