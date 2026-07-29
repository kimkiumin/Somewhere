import { distanceMeters, shortestAngularDelta, trueBearingDegrees } from "../domain/geo";
import type { JourneyState } from "../domain/journey";
import { evaluateHeading, evaluateLocation, INITIAL_NAVIGATION_POLICY } from "../domain/signals";
import type { CuratedDestination, DestinationBundle } from "../platform/curated-destinations";
import { resolveDeclination } from "../platform/curated-destinations";
import type { SensorSnapshot } from "./controller";

export type JourneyGuidance =
  | { readonly status: "inactive" }
  | { readonly status: "acquiring" }
  | { readonly status: "paused"; readonly reasons: readonly string[] }
  | {
      readonly status: "live";
      readonly distanceM: number;
      readonly targetBearingTrueDeg: number;
      readonly deviceHeadingTrueDeg: number;
      readonly relativeAngleDeg: number;
      readonly locationAccuracyM: number;
      readonly headingAccuracyDeg: number | null;
    };

export type JourneyGuidanceInput = {
  readonly journey: JourneyState;
  readonly sensors: SensorSnapshot;
  readonly destination: CuratedDestination | null;
  readonly fieldArea: DestinationBundle["fieldArea"];
  readonly nowMs: number;
  readonly todayIsoDate: string;
};

export function freshnessDeadlineMs(sensors: SensorSnapshot): number | null {
  if (sensors.location.status !== "live" || sensors.heading.status !== "live") {
    return null;
  }
  return (
    Math.min(
      sensors.location.sample.capturedAtMs + INITIAL_NAVIGATION_POLICY.locationMaxAgeMs,
      sensors.heading.sample.capturedAtMs + INITIAL_NAVIGATION_POLICY.headingMaxAgeMs,
    ) + 1
  );
}

export function deriveJourneyGuidance(input: JourneyGuidanceInput): JourneyGuidance {
  if (input.journey.phase !== "following" && input.journey.phase !== "near") {
    return { status: "inactive" };
  }
  if (input.sensors.guidance.status === "paused") {
    return {
      status: "paused",
      reasons: input.sensors.guidance.reasons,
    };
  }
  if (input.sensors.location.status !== "live" || input.sensors.heading.status !== "live") {
    return { status: "acquiring" };
  }
  if (input.destination === null) {
    return { status: "paused", reasons: ["destination-unavailable"] };
  }

  const locationEvaluation = evaluateLocation(
    input.sensors.location.sample,
    input.nowMs,
    INITIAL_NAVIGATION_POLICY,
  );
  if (locationEvaluation.status === "invalid") {
    return { status: "paused", reasons: [locationEvaluation.reason] };
  }
  const declination = resolveDeclination(
    input.fieldArea,
    locationEvaluation.sample.coordinates,
    input.todayIsoDate,
  );
  const headingEvaluation = evaluateHeading(
    input.sensors.heading.sample,
    input.nowMs,
    declination,
    INITIAL_NAVIGATION_POLICY,
  );
  if (headingEvaluation.status === "invalid") {
    return { status: "paused", reasons: [headingEvaluation.reason] };
  }

  const distanceM = distanceMeters(
    locationEvaluation.sample.coordinates,
    input.destination.coordinates,
  );
  const targetBearingTrueDeg = trueBearingDegrees(
    locationEvaluation.sample.coordinates,
    input.destination.coordinates,
  );
  if (distanceM === null || targetBearingTrueDeg === null) {
    return { status: "paused", reasons: ["guidance-invalid"] };
  }
  const relativeAngleDeg = shortestAngularDelta(
    headingEvaluation.trueDegrees,
    targetBearingTrueDeg,
  );
  if (relativeAngleDeg === null) {
    return { status: "paused", reasons: ["guidance-invalid"] };
  }

  return {
    status: "live",
    distanceM,
    targetBearingTrueDeg,
    deviceHeadingTrueDeg: headingEvaluation.trueDegrees,
    relativeAngleDeg,
    locationAccuracyM: locationEvaluation.sample.accuracyM,
    headingAccuracyDeg: input.sensors.heading.sample.accuracyDeg,
  };
}
