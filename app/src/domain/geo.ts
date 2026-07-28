export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

const EARTH_RADIUS_M = 6_371_000;
const DEGREES_PER_HALF_TURN = 180;
const DEGREES_PER_TURN = 360;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / DEGREES_PER_HALF_TURN;
}

function toDegrees(radians: number): number {
  return (radians * DEGREES_PER_HALF_TURN) / Math.PI;
}

export function isValidCoordinates(coordinates: Coordinates): boolean {
  return (
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= -90 &&
    coordinates.latitude <= 90 &&
    coordinates.longitude >= -180 &&
    coordinates.longitude <= 180
  );
}

export function normalizeDegrees(degrees: number): number | null {
  if (!Number.isFinite(degrees)) {
    return null;
  }

  return ((degrees % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number | null {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    return null;
  }

  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toLatitude - fromLatitude;
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const distance = EARTH_RADIUS_M * centralAngle;

  return Number.isFinite(distance) ? distance : null;
}

export function trueBearingDegrees(from: Coordinates, to: Coordinates): number | null {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    return null;
  }

  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const x = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const y =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

  return normalizeDegrees(toDegrees(Math.atan2(x, y)));
}

export function magneticToTrueDegrees(
  magneticDegrees: number,
  declinationDegreesEast: number,
): number | null {
  if (!Number.isFinite(declinationDegreesEast)) {
    return null;
  }

  return normalizeDegrees(magneticDegrees + declinationDegreesEast);
}

export function shortestAngularDelta(fromDegrees: number, toDegrees: number): number | null {
  const from = normalizeDegrees(fromDegrees);
  const to = normalizeDegrees(toDegrees);
  if (from === null || to === null) {
    return null;
  }

  return ((to - from + 540) % DEGREES_PER_TURN) - DEGREES_PER_HALF_TURN;
}
