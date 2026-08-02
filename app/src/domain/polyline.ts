import type { Coordinates } from "./geo";
import { isValidCoordinates } from "./geo";

const ROUTE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_ROUTE_POINTS = 2_048;
const MAX_ENCODED_BYTES = 256 * 1024;

export type RouteGuidanceEnvelope = {
  readonly encodedPolyline: string;
  readonly routeDigest: string;
  readonly routeVersion: string;
  readonly expiresAt: number;
};

export type TrustedRoute = {
  readonly geometry: readonly Coordinates[];
  readonly routeDigest: string;
  readonly routeVersion: string;
  readonly expiresAt: number;
  readonly receivedAtMs: number;
  readonly validatedAtMs: number;
};

export type RouteValidationResult =
  | { readonly ok: true; readonly route: TrustedRoute }
  | {
      readonly ok: false;
      readonly reason:
        | "route-envelope-invalid"
        | "route-geometry-invalid"
        | "route-digest-invalid"
        | "route-expired"
        | "route-too-old";
    };

function decodeBase64Url(encoded: string): string | null {
  if (
    encoded.length === 0 ||
    encoded.length > MAX_ENCODED_BYTES ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    return null;
  }
  const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
  try {
    return atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + padding);
  } catch {
    return null;
  }
}

export function decodeRouteGeometry(encoded: string): readonly Coordinates[] | null {
  const binary = decodeBase64Url(encoded);
  if (binary === null) {
    return null;
  }
  try {
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(decoded) || decoded.length < 2 || decoded.length > MAX_ROUTE_POINTS) {
      return null;
    }
    const geometry: Coordinates[] = [];
    for (const point of decoded) {
      if (!Array.isArray(point) || point.length !== 2) {
        return null;
      }
      const [longitude, latitude] = point;
      const coordinates = { latitude, longitude };
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        !isValidCoordinates(coordinates)
      ) {
        return null;
      }
      const previous = geometry.at(-1);
      if (
        previous !== undefined &&
        previous.latitude === coordinates.latitude &&
        previous.longitude === coordinates.longitude
      ) {
        return null;
      }
      geometry.push(Object.freeze(coordinates));
    }
    return Object.freeze(geometry);
  } catch {
    return null;
  }
}

export async function routeEndpointDigest(
  endpoint: Coordinates,
): Promise<`sha256:${string}` | null> {
  if (!isValidCoordinates(endpoint)) {
    return null;
  }
  try {
    const canonical = `${endpoint.latitude.toFixed(6)},${endpoint.longitude.toFixed(6)}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `sha256:${hexadecimal}`;
  } catch {
    return null;
  }
}

export async function validateRouteGuidance(
  envelope: RouteGuidanceEnvelope,
  timing: {
    readonly nowMs: number;
    readonly receivedAtMs: number;
    readonly routeAbsoluteMaxAgeMs: number;
  },
): Promise<RouteValidationResult> {
  if (
    typeof envelope.encodedPolyline !== "string" ||
    typeof envelope.routeVersion !== "string" ||
    envelope.routeVersion.trim().length === 0 ||
    !ROUTE_DIGEST.test(envelope.routeDigest) ||
    !Number.isSafeInteger(envelope.expiresAt) ||
    envelope.expiresAt < 0 ||
    !Number.isSafeInteger(timing.nowMs) ||
    timing.nowMs < 0 ||
    !Number.isSafeInteger(timing.receivedAtMs) ||
    timing.receivedAtMs < 0 ||
    timing.receivedAtMs > timing.nowMs ||
    !Number.isSafeInteger(timing.routeAbsoluteMaxAgeMs) ||
    timing.routeAbsoluteMaxAgeMs < 0
  ) {
    return { ok: false, reason: "route-envelope-invalid" };
  }
  if (envelope.expiresAt <= timing.nowMs) {
    return { ok: false, reason: "route-expired" };
  }
  if (timing.nowMs - timing.receivedAtMs > timing.routeAbsoluteMaxAgeMs) {
    return { ok: false, reason: "route-too-old" };
  }
  const geometry = decodeRouteGeometry(envelope.encodedPolyline);
  if (geometry === null) {
    return { ok: false, reason: "route-geometry-invalid" };
  }
  const endpoint = geometry.at(-1);
  if (endpoint === undefined || (await routeEndpointDigest(endpoint)) !== envelope.routeDigest) {
    return { ok: false, reason: "route-digest-invalid" };
  }
  return {
    ok: true,
    route: Object.freeze({
      geometry,
      routeDigest: envelope.routeDigest,
      routeVersion: envelope.routeVersion,
      expiresAt: envelope.expiresAt,
      receivedAtMs: timing.receivedAtMs,
      validatedAtMs: timing.nowMs,
    }),
  };
}
