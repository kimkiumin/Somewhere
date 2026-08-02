import { describe, expect, test } from "vitest";
import type { TrustedRoute } from "../domain/polyline";
import { initialRouteProgressState } from "../domain/route-progress";
import { deriveJourneyGuidance, type JourneyGuidanceInput } from "./journey-guidance";

const METERS_PER_DEGREE = (Math.PI / 180) * 6_371_000;
const degreesForMeters = (meters: number) => meters / METERS_PER_DEGREE;

function trustedInput(
  overrides: Partial<Extract<JourneyGuidanceInput, { readonly route: TrustedRoute | null }>> = {},
): Extract<JourneyGuidanceInput, { readonly route: TrustedRoute | null }> {
  const nowMs = overrides.nowMs ?? 1_000;
  return {
    journey: { phase: "following", destinationId: "destination-a" } as never,
    sensors: {
      started: true,
      visibility: "visible",
      location: {
        status: "live",
        sample: {
          coordinates: { latitude: degreesForMeters(10), longitude: 0 },
          accuracyM: 10,
          capturedAtMs: nowMs,
          movementHeadingTrueDeg: 180,
        },
      },
      heading: {
        status: "live",
        sample: {
          degrees: 350,
          reference: "magnetic",
          accuracyDeg: 8,
          capturedAtMs: nowMs,
        },
      },
      wakeLock: { status: "active" },
      guidance: { status: "live" },
      subscriptionCounts: { location: 1, heading: 1, visibility: 1, wakeRelease: 1 },
    },
    route: {
      geometry: [
        { latitude: 0, longitude: 0 },
        { latitude: degreesForMeters(200), longitude: 0 },
      ],
      routeDigest: `sha256:${"a".repeat(64)}`,
      routeVersion: "route-v1",
      expiresAt: 2_000_000,
      receivedAtMs: 0,
      validatedAtMs: 1_000,
    },
    routeProgressState: initialRouteProgressState(),
    declinationDegreesEast: 10,
    visibleSinceMs: null,
    ...overrides,
    nowMs,
  };
}

describe("Todo16 trusted-route guidance", () => {
  test("TASK16_ROUTE_CORRIDOR_REQUIRED suppresses a destination-chord arrow without trusted route geometry", () => {
    const input: JourneyGuidanceInput = {
      journey: { phase: "following", destinationId: "destination-a" },
      sensors: {
        started: true,
        visibility: "visible",
        location: {
          status: "live",
          sample: {
            coordinates: { latitude: 37.5446, longitude: 127.0374 },
            accuracyM: 10,
            capturedAtMs: 1_000,
          },
        },
        heading: {
          status: "live",
          sample: {
            degrees: 0,
            reference: "true",
            accuracyDeg: 8,
            capturedAtMs: 1_000,
          },
        },
        wakeLock: { status: "active" },
        guidance: { status: "live" },
        subscriptionCounts: {
          location: 1,
          heading: 1,
          visibility: 1,
          wakeRelease: 1,
        },
      },
      route: null,
      routeProgressState: initialRouteProgressState(),
      declinationDegreesEast: 0,
      visibleSinceMs: null,
      nowMs: 1_000,
    };

    expect(deriveJourneyGuidance(input)).toMatchObject({
      status: "paused",
      reasons: ["route-unavailable"],
    });
  });

  test("TASK16_TRUE_NORTH_ROUTE_BEARING ignores GPS course and endpoint chord", () => {
    const input = trustedInput({
      route: {
        ...trustedInput().route,
        geometry: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: degreesForMeters(60) },
          { latitude: degreesForMeters(100), longitude: degreesForMeters(60) },
        ],
      } as TrustedRoute,
      sensors: {
        ...trustedInput().sensors,
        location: {
          status: "live",
          sample: {
            coordinates: { latitude: 0, longitude: degreesForMeters(5) },
            accuracyM: 10,
            capturedAtMs: 1_000,
            movementHeadingTrueDeg: 270,
          },
        },
      },
    });
    const result = deriveJourneyGuidance(input);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.targetBearingTrueDeg).toBeCloseTo(90, 5);
    expect(result.deviceHeadingTrueDeg).toBeCloseTo(0, 5);
    expect(result.relativeAngleDeg).toBeCloseTo(90, 5);
  });

  test("TASK16_ARROW_ALL_GATES suppresses poor GPS, stale route, visibility-old samples, and off-route", () => {
    const poorGps = trustedInput();
    if (poorGps.sensors.location.status !== "live") throw new Error("fixture");
    expect(
      deriveJourneyGuidance({
        ...poorGps,
        sensors: {
          ...poorGps.sensors,
          location: {
            status: "live",
            sample: { ...poorGps.sensors.location.sample, accuracyM: 35.001 },
          },
        },
      }),
    ).toMatchObject({ status: "paused", reasons: ["location-inaccurate"] });

    expect(
      deriveJourneyGuidance(
        trustedInput({
          nowMs: 301_001,
          sensors: {
            ...trustedInput().sensors,
            location: {
              status: "live",
              sample: {
                coordinates: { latitude: degreesForMeters(10), longitude: 0 },
                accuracyM: 10,
                capturedAtMs: 301_001,
              },
            },
            heading: {
              status: "live",
              sample: {
                degrees: 0,
                reference: "true",
                accuracyDeg: 8,
                capturedAtMs: 301_001,
              },
            },
          },
        }),
      ),
    ).toMatchObject({ status: "paused", reasons: ["route-revalidation-required"] });

    expect(deriveJourneyGuidance(trustedInput({ visibleSinceMs: 1_000 }))).toMatchObject({
      status: "paused",
      reasons: ["post-visibility-samples-required"],
    });

    const offRoute = trustedInput();
    expect(
      deriveJourneyGuidance({
        ...offRoute,
        sensors: {
          ...offRoute.sensors,
          location: {
            status: "live",
            sample: {
              coordinates: {
                latitude: degreesForMeters(10),
                longitude: degreesForMeters(35.001),
              },
              accuracyM: 10,
              capturedAtMs: 1_000,
            },
          },
        },
      }),
    ).toMatchObject({ status: "paused", reasons: ["off-route"] });
  });

  test("TASK16_GUIDANCE_BOUNDARIES allows 35m GPS and 300000ms route validation age", () => {
    const input = trustedInput({
      nowMs: 301_000,
      sensors: {
        ...trustedInput().sensors,
        location: {
          status: "live",
          sample: {
            coordinates: { latitude: degreesForMeters(10), longitude: 0 },
            accuracyM: 35,
            capturedAtMs: 301_000,
          },
        },
        heading: {
          status: "live",
          sample: {
            degrees: 0,
            reference: "true",
            accuracyDeg: 25,
            capturedAtMs: 301_000,
          },
        },
      },
    });
    expect(deriveJourneyGuidance(input).status).toBe("live");
  });
});
