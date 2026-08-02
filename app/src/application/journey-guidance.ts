import { NAVIGATION_POLICY_V1 } from "@somewhere/contracts";
import { shortestAngularDelta, trueBearingDegrees } from "../domain/geo";
import type { JourneyState } from "../domain/journey";
import type { TrustedRoute } from "../domain/polyline";
import { advanceRouteProgress, type RouteProgressState } from "../domain/route-progress";
import { evaluateHeading, evaluateLocation, INITIAL_NAVIGATION_POLICY } from "../domain/signals";
import type { SensorSnapshot } from "./controller";

type GuidanceBase = {
  readonly journey: JourneyState;
  readonly sensors: SensorSnapshot;
  readonly nowMs: number;
};

export type TrustedRouteGuidanceInput = GuidanceBase & {
  readonly route: TrustedRoute | null;
  readonly routeProgressState: RouteProgressState;
  readonly declinationDegreesEast: number | null;
  readonly visibleSinceMs: number | null;
};

export type JourneyGuidanceInput = TrustedRouteGuidanceInput;

type GuidanceUnavailable = {
  readonly status: "inactive" | "acquiring";
  readonly routeProgressState?: RouteProgressState;
};

export type JourneyGuidance =
  | GuidanceUnavailable
  | {
      readonly status: "paused";
      readonly reasons: readonly string[];
      readonly routeProgressState?: RouteProgressState;
    }
  | {
      readonly status: "live";
      readonly distanceM: number;
      readonly remainingRouteM: number;
      readonly routeProgressM: number;
      readonly routeDeviationM: number;
      readonly endpointDistanceM: number;
      readonly finalCorridorDeviationM: number;
      readonly targetBearingTrueDeg: number;
      readonly deviceHeadingTrueDeg: number;
      readonly relativeAngleDeg: number;
      readonly locationAccuracyM: number;
      readonly headingAccuracyDeg: number | null;
      readonly routeProgressState: RouteProgressState;
    };

export function freshnessDeadlineMs(
  sensors: SensorSnapshot,
  route: TrustedRoute | null = null,
): number | null {
  if (sensors.location.status !== "live" || sensors.heading.status !== "live") {
    return null;
  }
  const deadlines = [
    sensors.location.sample.capturedAtMs + NAVIGATION_POLICY_V1.locationMaxAgeMs,
    sensors.heading.sample.capturedAtMs + NAVIGATION_POLICY_V1.headingMaxAgeMs,
  ];
  if (route !== null) {
    deadlines.push(
      route.validatedAtMs + NAVIGATION_POLICY_V1.routeRevalidateAfterMs,
      route.receivedAtMs + NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs,
      route.expiresAt - 1,
    );
  }
  return Math.min(...deadlines) + 1;
}

function paused(
  reasons: readonly string[],
  routeProgressState: RouteProgressState,
): JourneyGuidance {
  return { status: "paused", reasons, routeProgressState };
}

export function deriveJourneyGuidance(input: JourneyGuidanceInput): JourneyGuidance {
  const initialState = input.routeProgressState;
  if (input.journey.phase !== "following" && input.journey.phase !== "near") {
    return { status: "inactive", routeProgressState: initialState };
  }
  if (input.route === null) {
    return paused(["route-unavailable"], initialState);
  }
  if (input.sensors.guidance.status === "paused") {
    return paused(input.sensors.guidance.reasons, initialState);
  }
  if (input.sensors.location.status !== "live" || input.sensors.heading.status !== "live") {
    return { status: "acquiring", routeProgressState: initialState };
  }

  const route = input.route;
  if (
    input.nowMs >= route.expiresAt ||
    input.nowMs - route.receivedAtMs > NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs
  ) {
    return paused(["route-expired"], initialState);
  }
  if (input.nowMs - route.validatedAtMs > NAVIGATION_POLICY_V1.routeRevalidateAfterMs) {
    return paused(["route-revalidation-required"], initialState);
  }
  if (
    input.visibleSinceMs !== null &&
    (input.sensors.location.sample.capturedAtMs <= input.visibleSinceMs ||
      input.sensors.heading.sample.capturedAtMs <= input.visibleSinceMs)
  ) {
    return paused(["post-visibility-samples-required"], initialState);
  }

  const locationEvaluation = evaluateLocation(
    input.sensors.location.sample,
    input.nowMs,
    INITIAL_NAVIGATION_POLICY,
  );
  if (locationEvaluation.status === "invalid") {
    return paused([locationEvaluation.reason], initialState);
  }
  const headingEvaluation = evaluateHeading(
    input.sensors.heading.sample,
    input.nowMs,
    input.declinationDegreesEast,
    INITIAL_NAVIGATION_POLICY,
  );
  if (headingEvaluation.status === "invalid") {
    return paused([headingEvaluation.reason], initialState);
  }

  const progress = advanceRouteProgress(
    initialState,
    route.geometry,
    locationEvaluation.sample.coordinates,
    NAVIGATION_POLICY_V1,
  );
  if (progress.status === "suppressed") {
    return paused([progress.reason], progress.state);
  }
  const targetBearingTrueDeg = trueBearingDegrees(
    locationEvaluation.sample.coordinates,
    progress.forwardTarget,
  );
  if (targetBearingTrueDeg === null) {
    return paused(["guidance-invalid"], progress.state);
  }
  const relativeAngleDeg = shortestAngularDelta(
    headingEvaluation.trueDegrees,
    targetBearingTrueDeg,
  );
  if (relativeAngleDeg === null) {
    return paused(["guidance-invalid"], progress.state);
  }

  return {
    status: "live",
    distanceM: progress.remainingM,
    remainingRouteM: progress.remainingM,
    routeProgressM: progress.progressM,
    routeDeviationM: progress.deviationM,
    endpointDistanceM: progress.endpointDistanceM,
    finalCorridorDeviationM: progress.finalCorridorDeviationM,
    targetBearingTrueDeg,
    deviceHeadingTrueDeg: headingEvaluation.trueDegrees,
    relativeAngleDeg,
    locationAccuracyM: locationEvaluation.sample.accuracyM,
    headingAccuracyDeg: input.sensors.heading.sample.accuracyDeg,
    routeProgressState: progress.state,
  };
}
