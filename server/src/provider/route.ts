import { createHash } from "node:crypto";

import type { Point, RouteDocument } from "./parser";

type RouteUnavailableCode =
  | "ORIGIN_ACCURACY_UNSUPPORTED"
  | "ORIGIN_ZONE_UNSUPPORTED"
  | "ROUTE_MISSING"
  | "ROUTE_EXPIRED"
  | "ROUTE_BLOCKED"
  | "ROUTE_MATERIAL_CHANGE"
  | "ROUTE_GEOMETRY_INVALID";

type ReviewedRoute = Readonly<{
  routeId: string;
  providerId: string;
  capabilityVersion: string;
  geometry: readonly Point[];
  lengthM: number;
  expectedDurationSeconds: number;
  corridorWidthM: number;
  endpointDigest: string;
  expiresAt: string;
}>;

export type ReviewedRouteResult =
  | Readonly<{ kind: "available"; route: ReviewedRoute }>
  | Readonly<{ kind: "unavailable"; code: RouteUnavailableCode }>;

function distanceM(left: Point, right: Point): number {
  const latitudeRadians = ((left.latitude + right.latitude) / 2) * (Math.PI / 180);
  const latitudeM = (left.latitude - right.latitude) * 111_320;
  const longitudeM = (left.longitude - right.longitude) * 111_320 * Math.cos(latitudeRadians);
  return Math.hypot(latitudeM, longitudeM);
}

function isInsidePolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current++
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    if (currentPoint === undefined || previousPoint === undefined) {
      return false;
    }
    const crossesLatitude =
      currentPoint.latitude > point.latitude !== previousPoint.latitude > point.latitude;
    const crossingLongitude =
      ((previousPoint.longitude - currentPoint.longitude) *
        (point.latitude - currentPoint.latitude)) /
        (previousPoint.latitude - currentPoint.latitude) +
      currentPoint.longitude;
    if (crossesLatitude && point.longitude < crossingLongitude) {
      inside = !inside;
    }
  }
  return inside;
}

function geometryIsValid(geometry: readonly Point[], endpointDigest: string): boolean {
  const endpoint = geometry.at(-1);
  if (endpoint === undefined) {
    return false;
  }
  const hasDuplicateStep = geometry.some((point, index) => {
    const previous = geometry[index - 1];
    return (
      previous !== undefined &&
      point.latitude === previous.latitude &&
      point.longitude === previous.longitude
    );
  });
  const canonicalEndpoint = `${endpoint.latitude.toFixed(6)},${endpoint.longitude.toFixed(6)}`;
  const actualDigest = `sha256:${createHash("sha256").update(canonicalEndpoint).digest("hex")}`;
  return !hasDuplicateStep && actualDigest === endpointDigest;
}

export function getReviewedRoute(input: {
  readonly fixture: RouteDocument;
  readonly candidateId: string;
  readonly origin: Point;
  readonly accuracyM: number;
  readonly now: Date;
}): ReviewedRouteResult {
  const maximumAccuracy = Math.max(
    ...input.fixture.originZones.map((zone) => zone.maximumOriginOffsetM),
  );
  if (
    !Number.isFinite(input.accuracyM) ||
    input.accuracyM < 0 ||
    input.accuracyM > maximumAccuracy
  ) {
    return Object.freeze({ kind: "unavailable", code: "ORIGIN_ACCURACY_UNSUPPORTED" });
  }
  const approvedZone = input.fixture.originZones.find(
    (zone) =>
      isInsidePolygon(input.origin, zone.polygon) &&
      distanceM(input.origin, zone.startAnchor) + input.accuracyM <= zone.maximumOriginOffsetM,
  );
  if (approvedZone === undefined) {
    return Object.freeze({ kind: "unavailable", code: "ORIGIN_ZONE_UNSUPPORTED" });
  }
  const route = input.fixture.routes.find(
    (candidateRoute) =>
      candidateRoute.candidateId === input.candidateId &&
      candidateRoute.approvedOriginZoneIds.includes(approvedZone.zoneId),
  );
  if (route === undefined) {
    return Object.freeze({ kind: "unavailable", code: "ROUTE_MISSING" });
  }
  if (input.now.getTime() >= new Date(route.expiresAt).getTime()) {
    return Object.freeze({ kind: "unavailable", code: "ROUTE_EXPIRED" });
  }
  if (route.fieldValidation !== "reviewed") {
    return Object.freeze({ kind: "unavailable", code: "ROUTE_BLOCKED" });
  }
  if (route.materialChangeReported) {
    return Object.freeze({ kind: "unavailable", code: "ROUTE_MATERIAL_CHANGE" });
  }
  if (!geometryIsValid(route.geometry, route.endpointDigest)) {
    return Object.freeze({ kind: "unavailable", code: "ROUTE_GEOMETRY_INVALID" });
  }
  return Object.freeze({
    kind: "available",
    route: Object.freeze({
      routeId: route.routeId,
      providerId: input.fixture.providerId,
      capabilityVersion: input.fixture.capabilityVersion,
      geometry: Object.freeze([...route.geometry]),
      lengthM: route.lengthM,
      expectedDurationSeconds: route.expectedDurationSeconds,
      corridorWidthM: route.corridorWidthM,
      endpointDigest: route.endpointDigest,
      expiresAt: route.expiresAt,
    }),
  });
}
