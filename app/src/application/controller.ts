import type { HeadingSample, LocationSample } from "../domain/signals";
import type {
  HeadingFailure,
  LocationFailure,
  PermissionOutcome,
  SensorControllerPorts,
  Unsubscribe,
  VisibilityState,
  WakeLockOutcome,
} from "./ports";

type LocationState =
  | { readonly status: "idle" }
  | { readonly status: "acquiring" }
  | { readonly status: "live"; readonly sample: LocationSample }
  | { readonly status: "failed"; readonly failure: LocationFailure };

type HeadingState =
  | { readonly status: "idle" }
  | { readonly status: "acquiring" }
  | { readonly status: "live"; readonly sample: HeadingSample }
  | { readonly status: "denied" }
  | { readonly status: "unsupported" }
  | { readonly status: "failed"; readonly failure: HeadingFailure };

type WakeLockState =
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

export interface SensorController {
  startFromUserGesture(): Promise<void>;
  retryFromUserGesture(): Promise<void>;
  snapshot(): SensorSnapshot;
  subscribe(listener: (snapshot: SensorSnapshot) => void): Unsubscribe;
  settle(): Promise<void>;
  destroy(): Promise<void>;
}

function guidanceFor(snapshot: Omit<SensorSnapshot, "guidance">): SensorGuidanceState {
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

export function createSensorController(ports: SensorControllerPorts): SensorController {
  let started = false;
  let destroyed = false;
  let visibility = ports.visibility.current();
  let location: LocationState = { status: "idle" };
  let heading: HeadingState = { status: "idle" };
  let wakeLock: WakeLockState = { status: "idle" };
  let stopLocation: Unsubscribe | null = null;
  let stopHeading: Unsubscribe | null = null;
  let pendingLifecycle: Promise<void> = Promise.resolve();
  const listeners = new Set<(snapshot: SensorSnapshot) => void>();

  function baseSnapshot(): Omit<SensorSnapshot, "guidance"> {
    return {
      started,
      visibility,
      location,
      heading,
      wakeLock,
      subscriptionCounts: {
        location: stopLocation === null ? 0 : 1,
        heading: stopHeading === null ? 0 : 1,
        visibility: destroyed ? 0 : 1,
        wakeRelease: destroyed ? 0 : 1,
      },
    };
  }

  function snapshot(): SensorSnapshot {
    const base = baseSnapshot();
    return { ...base, guidance: guidanceFor(base) };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  function stopSensors(): void {
    stopLocation?.();
    stopHeading?.();
    stopLocation = null;
    stopHeading = null;
  }

  function startSensors(): void {
    if (stopLocation === null) {
      stopLocation = ports.location.subscribe(
        (sample) => {
          location = { status: "live", sample };
          notify();
        },
        (failure) => {
          location = { status: "failed", failure };
          notify();
        },
      );
    }
    if (stopHeading === null && heading.status !== "denied" && heading.status !== "unsupported") {
      stopHeading = ports.heading.subscribe(
        (sample) => {
          heading = { status: "live", sample };
          notify();
        },
        (failure) => {
          heading = { status: "failed", failure };
          notify();
        },
      );
    }
  }

  function applyPermission(outcome: PermissionOutcome): void {
    switch (outcome.status) {
      case "granted":
        if (heading.status !== "live") {
          heading = { status: "acquiring" };
        }
        break;
      case "denied":
        stopHeading?.();
        stopHeading = null;
        heading = { status: "denied" };
        break;
      case "unsupported":
        stopHeading?.();
        stopHeading = null;
        heading = { status: "unsupported" };
        break;
      case "error":
        stopHeading?.();
        stopHeading = null;
        heading = { status: "failed", failure: { reason: "unknown" } };
        break;
    }
  }

  function applyWakeLock(outcome: WakeLockOutcome): void {
    switch (outcome.status) {
      case "acquired":
        wakeLock = { status: "active" };
        break;
      case "unsupported":
        wakeLock = { status: "unsupported" };
        break;
      case "error":
        wakeLock = { status: "error", message: outcome.message };
        break;
    }
  }

  function acquireWakeLock(): Promise<void> {
    wakeLock = { status: "acquiring" };
    return ports.wakeLock.acquire().then((outcome) => {
      applyWakeLock(outcome);
      notify();
    });
  }

  function beginAcquisitionFromUserGesture(): Promise<void> {
    location = { status: "acquiring" };
    heading = { status: "acquiring" };
    startSensors();

    const permission = ports.heading.requestPermissionFromUserGesture();
    const wake = ports.wakeLock.acquire();
    wakeLock = { status: "acquiring" };
    notify();

    pendingLifecycle = Promise.all([permission, wake]).then(([permissionOutcome, wakeOutcome]) => {
      applyPermission(permissionOutcome);
      applyWakeLock(wakeOutcome);
      notify();
    });
    return pendingLifecycle;
  }

  function handleVisibility(next: VisibilityState): void {
    if (destroyed || next === visibility) {
      return;
    }
    visibility = next;
    if (!started) {
      notify();
      return;
    }

    if (next === "hidden") {
      stopSensors();
      location = { status: "acquiring" };
      if (heading.status !== "denied" && heading.status !== "unsupported") {
        heading = { status: "acquiring" };
      }
      wakeLock = { status: "released" };
      pendingLifecycle = ports.wakeLock.release().then(() => {
        notify();
      });
      notify();
      return;
    }

    location = { status: "acquiring" };
    if (heading.status !== "denied" && heading.status !== "unsupported") {
      heading = { status: "acquiring" };
    }
    startSensors();
    pendingLifecycle = acquireWakeLock();
    notify();
  }

  const stopVisibility = ports.visibility.subscribe(handleVisibility);
  const stopWakeRelease = ports.wakeLock.subscribeToRelease(() => {
    wakeLock = { status: "released" };
    notify();
    if (started && visibility === "visible" && !destroyed) {
      pendingLifecycle = acquireWakeLock();
    }
  });

  return {
    startFromUserGesture() {
      if (started || destroyed) {
        return pendingLifecycle;
      }

      started = true;
      return beginAcquisitionFromUserGesture();
    },
    retryFromUserGesture() {
      if (destroyed) {
        return pendingLifecycle;
      }
      started = true;
      stopSensors();
      return beginAcquisitionFromUserGesture();
    },
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          listeners.delete(listener);
        }
      };
    },
    settle() {
      return pendingLifecycle;
    },
    async destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      stopSensors();
      stopVisibility();
      stopWakeRelease();
      listeners.clear();
      await ports.wakeLock.release();
    },
  };
}
