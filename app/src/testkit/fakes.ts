import type {
  HeadingFailure,
  HeadingSource,
  LocationFailure,
  LocationSource,
  PermissionOutcome,
  SensorControllerPorts,
  Unsubscribe,
  VisibilitySource,
  VisibilityState,
  WakeLockOutcome,
  WakeLockSource,
} from "../application/ports";
import type { HeadingSample, LocationSample } from "../domain/signals";

export interface ScriptedSensorRig {
  readonly ports: SensorControllerPorts;
  setHeadingPermission(outcome: PermissionOutcome): void;
  emitLocation(sample: LocationSample): void;
  emitHeading(sample: HeadingSample): void;
  failLocation(failure: LocationFailure): void;
  failHeading(failure: HeadingFailure): void;
  setVisibility(state: VisibilityState): void;
  releaseWakeLockFromSystem(): void;
  advanceMs(milliseconds: number): void;
  nowMs(): number;
}

export function createScriptedSensorRig(initialNowMs = 1_000): ScriptedSensorRig {
  let nowMs = initialNowMs;
  let visibility: VisibilityState = "visible";
  let permission: PermissionOutcome = { status: "granted" };
  let onLocation: ((sample: LocationSample) => void) | null = null;
  let onLocationFailure: ((failure: LocationFailure) => void) | null = null;
  let onHeading: ((sample: HeadingSample) => void) | null = null;
  let onHeadingFailure: ((failure: HeadingFailure) => void) | null = null;
  const visibilityListeners = new Set<(state: VisibilityState) => void>();
  const wakeReleaseListeners = new Set<() => void>();
  const deadlines = new Map<number, { readonly dueAtMs: number; readonly callback: () => void }>();
  let nextDeadlineId = 1;

  const location: LocationSource = {
    subscribe(onSample, onFailure): Unsubscribe {
      onLocation = onSample;
      onLocationFailure = onFailure;
      let active = true;
      return () => {
        if (active) {
          active = false;
          onLocation = null;
          onLocationFailure = null;
        }
      };
    },
  };
  const heading: HeadingSource = {
    requestPermissionFromUserGesture: () => Promise.resolve(permission),
    subscribe(onSample, onFailure): Unsubscribe {
      onHeading = onSample;
      onHeadingFailure = onFailure;
      let active = true;
      return () => {
        if (active) {
          active = false;
          onHeading = null;
          onHeadingFailure = null;
        }
      };
    },
  };
  const visibilitySource: VisibilitySource = {
    current: () => visibility,
    subscribe(listener): Unsubscribe {
      visibilityListeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          visibilityListeners.delete(listener);
        }
      };
    },
  };
  const wakeLock: WakeLockSource = {
    acquire() {
      const outcome: WakeLockOutcome = { status: "acquired" };
      return Promise.resolve(outcome);
    },
    release: () => Promise.resolve(),
    subscribeToRelease(listener): Unsubscribe {
      wakeReleaseListeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          wakeReleaseListeners.delete(listener);
        }
      };
    },
  };

  return {
    ports: {
      location,
      heading,
      visibility: visibilitySource,
      wakeLock,
      clock: { nowMs: () => nowMs },
      scheduler: {
        schedule(delayMs, callback) {
          const id = nextDeadlineId;
          nextDeadlineId += 1;
          deadlines.set(id, {
            dueAtMs: nowMs + Math.max(0, delayMs),
            callback,
          });
          return () => {
            deadlines.delete(id);
          };
        },
      },
    },
    setHeadingPermission(outcome) {
      permission = outcome;
    },
    emitLocation(sample) {
      onLocation?.(sample);
    },
    emitHeading(sample) {
      onHeading?.(sample);
    },
    failLocation(failure) {
      onLocationFailure?.(failure);
    },
    failHeading(failure) {
      onHeadingFailure?.(failure);
    },
    setVisibility(state) {
      visibility = state;
      for (const listener of visibilityListeners) {
        listener(state);
      }
    },
    releaseWakeLockFromSystem() {
      for (const listener of wakeReleaseListeners) {
        listener();
      }
    },
    advanceMs(milliseconds) {
      if (Number.isFinite(milliseconds) && milliseconds >= 0) {
        nowMs += milliseconds;
        while (true) {
          const due = [...deadlines.entries()]
            .filter(([, deadline]) => deadline.dueAtMs <= nowMs)
            .sort(
              ([firstId, first], [secondId, second]) =>
                first.dueAtMs - second.dueAtMs || firstId - secondId,
            )[0];
          if (due === undefined) {
            break;
          }
          deadlines.delete(due[0]);
          due[1].callback();
        }
      }
    },
    nowMs: () => nowMs,
  };
}
