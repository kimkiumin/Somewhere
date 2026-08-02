import type { Coordinates } from "./geo";
import { distanceMeters, isValidCoordinates } from "./geo";

const EARTH_RADIUS_M = 6_371_000;

export type RouteProgressPolicy = {
  readonly routeCorridorEnterM: number;
  readonly routeCorridorExitM: number;
  readonly forwardTargetLookaheadM: number;
  readonly maxBackwardProgressJumpM: number;
  readonly maxForwardProgressJumpM: number;
};

export type RouteProgressState = {
  readonly corridor: "outside" | "recovering" | "inside";
  readonly acceptedProgressM: number | null;
};

export type RouteProgressResult =
  | {
      readonly status: "suppressed";
      readonly reason: "route-invalid" | "off-route" | "progress-jump" | "route-recovering";
      readonly state: RouteProgressState;
      readonly deviationM: number | null;
    }
  | {
      readonly status: "credible";
      readonly state: RouteProgressState;
      readonly deviationM: number;
      readonly progressM: number;
      readonly remainingM: number;
      readonly endpointDistanceM: number;
      readonly finalCorridorDeviationM: number;
      readonly forwardTarget: Coordinates;
    };

export function initialRouteProgressState(): RouteProgressState {
  return { corridor: "outside", acceptedProgressM: null };
}

type Projection = {
  readonly segmentIndex: number;
  readonly fraction: number;
  readonly deviationM: number;
  readonly progressM: number;
};

function projectToSegment(
  point: Coordinates,
  start: Coordinates,
  end: Coordinates,
): { readonly fraction: number; readonly deviationM: number } | null {
  if (!isValidCoordinates(point) || !isValidCoordinates(start) || !isValidCoordinates(end)) {
    return null;
  }
  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const scaleX = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(latitudeRadians);
  const scaleY = (Math.PI / 180) * EARTH_RADIUS_M;
  const ax = (start.longitude - point.longitude) * scaleX;
  const ay = (start.latitude - point.latitude) * scaleY;
  const bx = (end.longitude - point.longitude) * scaleX;
  const by = (end.latitude - point.latitude) * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (!Number.isFinite(lengthSquared) || lengthSquared <= 0) {
    return null;
  }
  const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  const projectedX = ax + fraction * dx;
  const projectedY = ay + fraction * dy;
  return { fraction, deviationM: Math.hypot(projectedX, projectedY) };
}

function segmentLengths(geometry: readonly Coordinates[]): readonly number[] | null {
  if (geometry.length < 2) {
    return null;
  }
  const lengths: number[] = [];
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const start = geometry[index];
    const end = geometry[index + 1];
    if (start === undefined || end === undefined) {
      return null;
    }
    const length = distanceMeters(start, end);
    if (length === null || length <= 0) {
      return null;
    }
    lengths.push(length);
  }
  return lengths;
}

function closestProjection(
  geometry: readonly Coordinates[],
  lengths: readonly number[],
  point: Coordinates,
): Projection | null {
  let best: Projection | null = null;
  let precedingM = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const start = geometry[index];
    const end = geometry[index + 1];
    const length = lengths[index];
    if (start === undefined || end === undefined || length === undefined) {
      return null;
    }
    const projected = projectToSegment(point, start, end);
    if (projected === null) {
      return null;
    }
    const candidate = {
      segmentIndex: index,
      fraction: projected.fraction,
      deviationM: projected.deviationM,
      progressM: precedingM + projected.fraction * length,
    };
    if (
      best === null ||
      candidate.deviationM < best.deviationM ||
      (candidate.deviationM === best.deviationM && candidate.progressM > best.progressM)
    ) {
      best = candidate;
    }
    precedingM += length;
  }
  return best;
}

function coordinateAtProgress(
  geometry: readonly Coordinates[],
  lengths: readonly number[],
  progressM: number,
): Coordinates | null {
  let precedingM = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    const start = geometry[index];
    const end = geometry[index + 1];
    if (length === undefined || start === undefined || end === undefined) {
      return null;
    }
    if (progressM <= precedingM + length || index === lengths.length - 1) {
      const fraction = Math.max(0, Math.min(1, (progressM - precedingM) / length));
      return {
        latitude: start.latitude + (end.latitude - start.latitude) * fraction,
        longitude: start.longitude + (end.longitude - start.longitude) * fraction,
      };
    }
    precedingM += length;
  }
  return null;
}

export function advanceRouteProgress(
  state: RouteProgressState,
  geometry: readonly Coordinates[],
  point: Coordinates,
  policy: RouteProgressPolicy,
): RouteProgressResult {
  const lengths = segmentLengths(geometry);
  if (lengths === null || !isValidCoordinates(point)) {
    return {
      status: "suppressed",
      reason: "route-invalid",
      state: initialRouteProgressState(),
      deviationM: null,
    };
  }
  const projection = closestProjection(geometry, lengths, point);
  if (projection === null) {
    return {
      status: "suppressed",
      reason: "route-invalid",
      state: initialRouteProgressState(),
      deviationM: null,
    };
  }
  const inside =
    state.corridor === "inside"
      ? projection.deviationM < policy.routeCorridorExitM
      : projection.deviationM <= policy.routeCorridorEnterM;
  if (!inside) {
    return {
      status: "suppressed",
      reason: "off-route",
      state:
        state.corridor === "outside"
          ? initialRouteProgressState()
          : { corridor: "recovering", acceptedProgressM: null },
      deviationM: projection.deviationM,
    };
  }
  if (state.acceptedProgressM !== null) {
    const jumpM = projection.progressM - state.acceptedProgressM;
    if (jumpM < -policy.maxBackwardProgressJumpM || jumpM > policy.maxForwardProgressJumpM) {
      return {
        status: "suppressed",
        reason: "progress-jump",
        state: { corridor: "recovering", acceptedProgressM: null },
        deviationM: projection.deviationM,
      };
    }
  }
  if (state.corridor === "recovering" && state.acceptedProgressM === null) {
    return {
      status: "suppressed",
      reason: "route-recovering",
      state: { corridor: "recovering", acceptedProgressM: projection.progressM },
      deviationM: projection.deviationM,
    };
  }
  const totalM = lengths.reduce((total, length) => total + length, 0);
  const endpoint = geometry.at(-1);
  const finalStart = geometry.at(-2);
  if (endpoint === undefined || finalStart === undefined) {
    return {
      status: "suppressed",
      reason: "route-invalid",
      state: initialRouteProgressState(),
      deviationM: null,
    };
  }
  const endpointDistanceM = distanceMeters(point, endpoint);
  const finalProjection = projectToSegment(point, finalStart, endpoint);
  const forwardTarget = coordinateAtProgress(
    geometry,
    lengths,
    Math.min(totalM, projection.progressM + policy.forwardTargetLookaheadM),
  );
  if (endpointDistanceM === null || finalProjection === null || forwardTarget === null) {
    return {
      status: "suppressed",
      reason: "route-invalid",
      state: initialRouteProgressState(),
      deviationM: null,
    };
  }
  const nextState = {
    corridor: "inside" as const,
    acceptedProgressM: projection.progressM,
  };
  return {
    status: "credible",
    state: nextState,
    deviationM: projection.deviationM,
    progressM: projection.progressM,
    remainingM: Math.max(0, totalM - projection.progressM),
    endpointDistanceM,
    finalCorridorDeviationM: finalProjection.deviationM,
    forwardTarget,
  };
}
