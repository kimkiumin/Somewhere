import type { LocationFailure, LocationSource, Unsubscribe } from "../application/ports";
import { normalizeDegrees } from "../domain/geo";
import type { LocationSample } from "../domain/signals";

export type BrowserLocationResult =
  | { readonly ok: true; readonly sample: LocationSample }
  | { readonly ok: false; readonly failure: LocationFailure };

function property(input: object, name: string): unknown {
  return Reflect.get(input, name);
}

export function normalizeGeolocationPosition(input: unknown): BrowserLocationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, failure: { reason: "malformed" } };
  }
  const timestamp = property(input, "timestamp");
  const coords = property(input, "coords");
  if (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    typeof coords !== "object" ||
    coords === null
  ) {
    return { ok: false, failure: { reason: "malformed" } };
  }

  const latitude = property(coords, "latitude");
  const longitude = property(coords, "longitude");
  const accuracy = property(coords, "accuracy");
  const rawHeading = property(coords, "heading");
  const rawSpeed = property(coords, "speed");
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    typeof accuracy !== "number" ||
    !Number.isFinite(accuracy)
  ) {
    return { ok: false, failure: { reason: "malformed" } };
  }

  const movementHeadingTrueDeg =
    typeof rawHeading === "number" ? normalizeDegrees(rawHeading) : null;
  const speedMps =
    typeof rawSpeed === "number" && Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed : null;
  if (
    (typeof rawHeading === "number" && movementHeadingTrueDeg === null) ||
    (rawHeading !== null && rawHeading !== undefined && typeof rawHeading !== "number") ||
    (rawSpeed !== null && rawSpeed !== undefined && typeof rawSpeed !== "number")
  ) {
    return { ok: false, failure: { reason: "malformed" } };
  }

  return {
    ok: true,
    sample: {
      coordinates: { latitude, longitude },
      accuracyM: accuracy,
      capturedAtMs: timestamp,
      movementHeadingTrueDeg,
      speedMps,
    },
  };
}

function normalizeGeolocationFailure(input: unknown): LocationFailure {
  if (typeof input === "object" && input !== null) {
    const code = property(input, "code");
    if (code === 1) {
      return { reason: "permission-denied" };
    }
    if (code === 2) {
      return { reason: "unavailable" };
    }
    if (code === 3) {
      return { reason: "timeout" };
    }
  }
  return { reason: "unknown" };
}

export type GeolocationEnvironment = {
  readonly watchPosition: (
    onPosition: (position: unknown) => void,
    onFailure: (failure: unknown) => void,
  ) => number;
  readonly clearWatch: (watchId: number) => void;
};

export function createBrowserLocationSource(environment: GeolocationEnvironment): LocationSource {
  return {
    subscribe(onSample, onFailure): Unsubscribe {
      let watchId: number;
      try {
        watchId = environment.watchPosition(
          (position) => {
            const result = normalizeGeolocationPosition(position);
            if (result.ok) {
              onSample(result.sample);
            } else {
              onFailure(result.failure);
            }
          },
          (failure) => {
            onFailure(normalizeGeolocationFailure(failure));
          },
        );
      } catch {
        onFailure({ reason: "unavailable" });
        return () => undefined;
      }

      let active = true;
      return () => {
        if (active) {
          active = false;
          environment.clearWatch(watchId);
        }
      };
    },
  };
}
