import type { HeadingSample, LocationSample } from "../domain/signals";

export type Unsubscribe = () => void;

export type PermissionOutcome =
  | { readonly status: "granted" }
  | { readonly status: "denied" }
  | { readonly status: "unsupported" }
  | { readonly status: "error"; readonly message: string };

export type LocationFailure = {
  readonly reason: "permission-denied" | "unavailable" | "timeout" | "malformed" | "unknown";
};

export type HeadingFailure = {
  readonly reason: "permission-denied" | "unavailable" | "uncalibrated" | "malformed" | "unknown";
};

export interface LocationSource {
  subscribe(
    onSample: (sample: LocationSample) => void,
    onFailure: (failure: LocationFailure) => void,
  ): Unsubscribe;
}

export interface HeadingSource {
  requestPermissionFromUserGesture(): Promise<PermissionOutcome>;
  subscribe(
    onSample: (sample: HeadingSample) => void,
    onFailure: (failure: HeadingFailure) => void,
  ): Unsubscribe;
}

export type VisibilityState = "visible" | "hidden";

export interface VisibilitySource {
  current(): VisibilityState;
  subscribe(listener: (state: VisibilityState) => void): Unsubscribe;
}

export type WakeLockOutcome =
  | { readonly status: "acquired" }
  | { readonly status: "unsupported" }
  | { readonly status: "error"; readonly message: string };

export interface WakeLockSource {
  acquire(): Promise<WakeLockOutcome>;
  release(): Promise<void>;
  subscribeToRelease(listener: () => void): Unsubscribe;
}

export interface Clock {
  nowMs(): number;
}

export interface DeadlineScheduler {
  schedule(delayMs: number, callback: () => void): Unsubscribe;
}

export type SensorControllerPorts = {
  readonly location: LocationSource;
  readonly heading: HeadingSource;
  readonly visibility: VisibilitySource;
  readonly wakeLock: WakeLockSource;
  readonly clock: Clock;
  readonly scheduler: DeadlineScheduler;
};
