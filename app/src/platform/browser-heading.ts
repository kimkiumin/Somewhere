import type {
  HeadingFailure,
  HeadingSource,
  PermissionOutcome,
  Unsubscribe,
} from "../application/ports";
import { normalizeDegrees } from "../domain/geo";
import type { HeadingSample } from "../domain/signals";

export type BrowserHeadingResult =
  | { readonly ok: true; readonly sample: HeadingSample }
  | { readonly ok: false; readonly failure: HeadingFailure };

export type OrientationPermissionProvider = {
  readonly requestPermission: () => Promise<unknown>;
};

function property(input: object, name: string): unknown {
  return Reflect.get(input, name);
}

export function normalizeBrowserHeadingEvent(
  input: unknown,
  capturedAtMs: number,
): BrowserHeadingResult {
  if (typeof input !== "object" || input === null || !Number.isFinite(capturedAtMs)) {
    return { ok: false, failure: { reason: "malformed" } };
  }

  const webkitHeading = property(input, "webkitCompassHeading");
  const webkitAccuracy = property(input, "webkitCompassAccuracy");
  if (typeof webkitHeading === "number") {
    if (!Number.isFinite(webkitHeading)) {
      return { ok: false, failure: { reason: "malformed" } };
    }
    if (webkitAccuracy === -1) {
      return { ok: false, failure: { reason: "uncalibrated" } };
    }
    if (
      webkitAccuracy !== undefined &&
      (typeof webkitAccuracy !== "number" || !Number.isFinite(webkitAccuracy))
    ) {
      return { ok: false, failure: { reason: "malformed" } };
    }
    const degrees = normalizeDegrees(webkitHeading);
    if (degrees === null) {
      return { ok: false, failure: { reason: "malformed" } };
    }
    return {
      ok: true,
      sample: {
        degrees,
        reference: "magnetic",
        accuracyDeg: typeof webkitAccuracy === "number" ? webkitAccuracy : null,
        capturedAtMs,
      },
    };
  }

  const alpha = property(input, "alpha");
  const absolute = property(input, "absolute");
  if (absolute === true && typeof alpha === "number" && Number.isFinite(alpha)) {
    const degrees = normalizeDegrees(360 - alpha);
    if (degrees !== null) {
      return {
        ok: true,
        sample: {
          degrees,
          reference: "true",
          accuracyDeg: null,
          capturedAtMs,
        },
      };
    }
  }

  return { ok: false, failure: { reason: "unavailable" } };
}

export async function requestOrientationPermission(
  provider: OrientationPermissionProvider | undefined,
): Promise<PermissionOutcome> {
  if (provider === undefined) {
    return { status: "unsupported" };
  }
  try {
    const result = await provider.requestPermission();
    if (result === "granted") {
      return { status: "granted" };
    }
    if (result === "denied") {
      return { status: "denied" };
    }
    return { status: "error", message: "Unexpected orientation permission result." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Orientation permission failed.",
    };
  }
}

export type HeadingEventEnvironment = {
  readonly add: (listener: (event: unknown) => void) => void;
  readonly remove: (listener: (event: unknown) => void) => void;
  readonly permissionProvider: OrientationPermissionProvider | undefined;
  readonly nowMs: () => number;
};

export function createBrowserHeadingSource(environment: HeadingEventEnvironment): HeadingSource {
  return {
    requestPermissionFromUserGesture: () =>
      requestOrientationPermission(environment.permissionProvider),
    subscribe(onSample, onFailure): Unsubscribe {
      const listener = (event: unknown): void => {
        const result = normalizeBrowserHeadingEvent(event, environment.nowMs());
        if (result.ok) {
          onSample(result.sample);
        } else {
          onFailure(result.failure);
        }
      };
      environment.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          environment.remove(listener);
        }
      };
    },
  };
}
