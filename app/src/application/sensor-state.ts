import type { HeadingSample, LocationSample } from "../domain/signals";
import type {
  HeadingFailure,
  LocationFailure,
  PermissionOutcome,
  VisibilityState,
  WakeLockOutcome,
} from "./ports";

export type LocationState =
  | { readonly status: "idle" }
  | { readonly status: "acquiring" }
  | { readonly status: "live"; readonly sample: LocationSample }
  | { readonly status: "failed"; readonly failure: LocationFailure };

export type HeadingState =
  | { readonly status: "idle" }
  | { readonly status: "acquiring" }
  | { readonly status: "live"; readonly sample: HeadingSample }
  | { readonly status: "denied" }
  | { readonly status: "unsupported" }
  | { readonly status: "failed"; readonly failure: HeadingFailure };

export type WakeLockState =
  | { readonly status: "idle" }
  | { readonly status: "acquiring" }
  | { readonly status: "active" }
  | { readonly status: "released" }
  | { readonly status: "unsupported" }
  | { readonly status: "error"; readonly message: string };

export type GuidancePauseReason =
  | "visibility-hidden"
  | "heading-denied"
  | "heading-unsupported"
  | "location-failed"
  | "heading-failed";

export type SensorGuidanceState =
  | { readonly status: "inactive" }
  | { readonly status: "acquiring" }
  | { readonly status: "live" }
  | { readonly status: "paused"; readonly reasons: readonly GuidancePauseReason[] };

export type SensorSnapshot = {
  readonly started: boolean;
  readonly visibility: VisibilityState;
  readonly location: LocationState;
  readonly heading: HeadingState;
  readonly wakeLock: WakeLockState;
  readonly guidance: SensorGuidanceState;
  readonly subscriptionCounts: {
    readonly location: number;
    readonly heading: number;
    readonly visibility: number;
    readonly wakeRelease: number;
  };
};

export function headingForPermission(
  outcome: PermissionOutcome,
  current: HeadingState,
): HeadingState {
  switch (outcome.status) {
    case "granted":
      return current.status === "live" ? current : { status: "acquiring" };
    case "denied":
      return { status: "denied" };
    case "unsupported":
      return { status: "unsupported" };
    case "error":
      return { status: "failed", failure: { reason: "unknown" } };
  }
}

export function wakeLockFor(outcome: WakeLockOutcome): WakeLockState {
  switch (outcome.status) {
    case "acquired":
      return { status: "active" };
    case "unsupported":
      return { status: "unsupported" };
    case "error":
      return { status: "error", message: outcome.message };
  }
}

export function guidanceFor(snapshot: Omit<SensorSnapshot, "guidance">): SensorGuidanceState {
  if (!snapshot.started) {
    return { status: "inactive" };
  }
  if (snapshot.visibility === "hidden") {
    return { status: "paused", reasons: ["visibility-hidden"] };
  }
  if (snapshot.heading.status === "denied") {
    return { status: "paused", reasons: ["heading-denied"] };
  }
  if (snapshot.heading.status === "unsupported") {
    return { status: "paused", reasons: ["heading-unsupported"] };
  }

  const reasons: GuidancePauseReason[] = [];
  if (snapshot.location.status === "failed") {
    reasons.push("location-failed");
  }
  if (snapshot.heading.status === "failed") {
    reasons.push("heading-failed");
  }
  if (reasons.length > 0) {
    return { status: "paused", reasons };
  }
  if (snapshot.location.status === "live" && snapshot.heading.status === "live") {
    return { status: "live" };
  }

  return { status: "acquiring" };
}
