import { describe, expect, test } from "vitest";
import {
  advanceArrivalGate,
  evaluateHeading,
  evaluateLocation,
  INITIAL_NAVIGATION_POLICY,
  initialArrivalGate,
  nextProximity,
} from "./signals";

describe("signal quality", () => {
  test("pauses for stale and inaccurate locations", () => {
    const sample = {
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
      accuracyM: 12,
      capturedAtMs: 1_000,
    };

    expect(evaluateLocation(sample, 11_001, INITIAL_NAVIGATION_POLICY)).toEqual({
      status: "invalid",
      reason: "location-stale",
    });
    expect(
      evaluateLocation({ ...sample, accuracyM: 51 }, 2_000, INITIAL_NAVIGATION_POLICY),
    ).toEqual({
      status: "invalid",
      reason: "location-inaccurate",
    });
  });

  test("normalizes magnetic and true headings without accepting uncalibrated iOS data", () => {
    const magneticResult = evaluateHeading(
      {
        degrees: 10,
        reference: "magnetic",
        accuracyDeg: 8,
        capturedAtMs: 1_000,
      },
      1_000,
      -9.011_45,
      INITIAL_NAVIGATION_POLICY,
    );
    expect(magneticResult.status).toBe("valid");
    if (magneticResult.status === "valid") {
      expect(magneticResult.trueDegrees).toBeCloseTo(0.988_55, 5);
    }
    expect(
      evaluateHeading(
        {
          degrees: 10,
          reference: "magnetic",
          accuracyDeg: -1,
          capturedAtMs: 1_000,
        },
        1_000,
        -9.011_45,
        INITIAL_NAVIGATION_POLICY,
      ),
    ).toEqual({ status: "invalid", reason: "heading-uncalibrated" });
    expect(
      evaluateHeading(
        {
          degrees: 275,
          reference: "true",
          accuracyDeg: null,
          capturedAtMs: 1_000,
        },
        1_000,
        null,
        INITIAL_NAVIGATION_POLICY,
      ),
    ).toEqual({ status: "valid", trueDegrees: 275 });
  });

  test("keeps heading fresh at the boundary and expires it one millisecond later", () => {
    const sample = {
      degrees: 275,
      reference: "true" as const,
      accuracyDeg: 8,
      capturedAtMs: 1_000,
    };

    expect(evaluateHeading(sample, 11_000, null, INITIAL_NAVIGATION_POLICY)).toEqual({
      status: "valid",
      trueDegrees: 275,
    });
    expect(evaluateHeading(sample, 11_001, null, INITIAL_NAVIGATION_POLICY)).toEqual({
      status: "invalid",
      reason: "heading-stale",
    });
    expect(evaluateHeading(sample, 999, null, INITIAL_NAVIGATION_POLICY)).toEqual({
      status: "invalid",
      reason: "heading-invalid",
    });
  });
});

describe("arrival and proximity policy", () => {
  test("uses hysteresis at the Near boundary", () => {
    expect(nextProximity("following", 120, INITIAL_NAVIGATION_POLICY)).toBe("near");
    expect(nextProximity("following", 120.001, INITIAL_NAVIGATION_POLICY)).toBe("following");
    expect(nextProximity("near", 149.999, INITIAL_NAVIGATION_POLICY)).toBe("near");
    expect(nextProximity("near", 150, INITIAL_NAVIGATION_POLICY)).toBe("following");
  });

  test("requires four accurate arrival samples spanning at least twelve seconds", () => {
    const first = advanceArrivalGate(
      initialArrivalGate(),
      { distanceM: 20, accuracyM: 10, capturedAtMs: 0 },
      INITIAL_NAVIGATION_POLICY,
    );
    const second = advanceArrivalGate(
      first,
      { distanceM: 24, accuracyM: 12, capturedAtMs: 4_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    const third = advanceArrivalGate(
      second,
      { distanceM: 29, accuracyM: 20, capturedAtMs: 8_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    const fourth = advanceArrivalGate(
      third,
      { distanceM: 29, accuracyM: 20, capturedAtMs: 12_000 },
      INITIAL_NAVIGATION_POLICY,
    );

    expect(first.arrived).toBe(false);
    expect(second.arrived).toBe(false);
    expect(third.arrived).toBe(false);
    expect(fourth.arrived).toBe(true);
  });

  test("does not arrive from a single GPS jump and latches a real arrival", () => {
    const jump = advanceArrivalGate(
      initialArrivalGate(),
      { distanceM: 2, accuracyM: 5, capturedAtMs: 1_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    expect(jump.arrived).toBe(false);

    const first = advanceArrivalGate(
      initialArrivalGate(),
      { distanceM: 20, accuracyM: 10, capturedAtMs: 0 },
      INITIAL_NAVIGATION_POLICY,
    );
    const second = advanceArrivalGate(
      first,
      { distanceM: 20, accuracyM: 10, capturedAtMs: 4_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    const third = advanceArrivalGate(
      second,
      { distanceM: 20, accuracyM: 10, capturedAtMs: 8_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    const arrived = advanceArrivalGate(
      third,
      { distanceM: 20, accuracyM: 10, capturedAtMs: 12_000 },
      INITIAL_NAVIGATION_POLICY,
    );
    const afterBadSample = advanceArrivalGate(
      arrived,
      { distanceM: 800, accuracyM: 100, capturedAtMs: 20_000 },
      INITIAL_NAVIGATION_POLICY,
    );

    expect(afterBadSample.arrived).toBe(true);
  });
});
