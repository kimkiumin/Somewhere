import type {
  PermissionOutcome,
  SensorControllerPorts,
  Unsubscribe,
  VisibilityState,
  WakeLockOutcome,
} from "./ports";
import {
  guidanceFor,
  type HeadingState,
  headingForPermission,
  type LocationState,
  type SensorSnapshot,
  type WakeLockState,
  wakeLockFor,
} from "./sensor-state";

export type {
  GuidancePauseReason,
  SensorGuidanceState,
  SensorSnapshot,
} from "./sensor-state";

export interface SensorController {
  startFromUserGesture(): Promise<void>;
  retryFromUserGesture(): Promise<void>;
  suspend(): void;
  snapshot(): SensorSnapshot;
  subscribe(listener: (snapshot: SensorSnapshot) => void): Unsubscribe;
  settle(): Promise<void>;
  destroy(): Promise<void>;
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
    heading = headingForPermission(outcome, heading);
    if (outcome.status !== "granted") {
      stopHeading?.();
      stopHeading = null;
    }
  }

  async function applyWakeLockForCurrentVisibility(outcome: WakeLockOutcome): Promise<void> {
    if (outcome.status === "acquired" && (visibility === "hidden" || destroyed)) {
      await ports.wakeLock.release();
      wakeLock = { status: "released" };
      return;
    }
    wakeLock = wakeLockFor(outcome);
  }

  async function acquireWakeLock(): Promise<void> {
    wakeLock = { status: "acquiring" };
    const outcome = await ports.wakeLock.acquire();
    await applyWakeLockForCurrentVisibility(outcome);
    notify();
  }

  function beginAcquisitionFromUserGesture(): Promise<void> {
    location = { status: "acquiring" };
    heading = { status: "acquiring" };
    startSensors();

    const permission = ports.heading.requestPermissionFromUserGesture();
    const wake = ports.wakeLock.acquire();
    wakeLock = { status: "acquiring" };
    notify();

    pendingLifecycle = Promise.all([permission, wake]).then(
      async ([permissionOutcome, wakeOutcome]) => {
        if (!started || destroyed) {
          return;
        }
        applyPermission(permissionOutcome);
        await applyWakeLockForCurrentVisibility(wakeOutcome);
        notify();
      },
    );
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
    suspend() {
      if (!started || destroyed) {
        return;
      }
      started = false;
      stopSensors();
      location = { status: "idle" };
      heading = { status: "idle" };
      wakeLock = { status: "released" };
      const previousLifecycle = pendingLifecycle;
      pendingLifecycle = (async () => {
        try {
          await previousLifecycle;
          await ports.wakeLock.release();
          if (!started && !destroyed) {
            wakeLock = { status: "released" };
          }
        } catch (error) {
          wakeLock = {
            status: "error",
            message: error instanceof Error ? error.message : "Wake Lock release failed.",
          };
        }
        notify();
      })();
      notify();
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
