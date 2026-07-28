import { describe, expect, test } from "vitest";
import { createSensorController } from "./controller";
import type {
  HeadingFailure,
  HeadingSource,
  LocationFailure,
  LocationSource,
  PermissionOutcome,
  SensorControllerPorts,
  VisibilitySource,
  VisibilityState,
  WakeLockOutcome,
  WakeLockSource,
} from "./ports";

type FakeSensors = {
  readonly ports: SensorControllerPorts;
  readonly activeCounts: () => { readonly location: number; readonly heading: number };
  readonly permissionCalls: () => number;
  readonly wakeAcquireCalls: () => number;
  readonly wakeReleaseCalls: () => number;
  readonly setPermission: (outcome: PermissionOutcome) => void;
  readonly emitVisibility: (state: VisibilityState) => void;
  readonly emitLocation: LocationSource["subscribe"] extends (
    onSample: infer Listener,
    onFailure: (failure: LocationFailure) => void,
  ) => () => void
    ? Listener
    : never;
  readonly emitHeading: HeadingSource["subscribe"] extends (
    onSample: infer Listener,
    onFailure: (failure: HeadingFailure) => void,
  ) => () => void
    ? Listener
    : never;
};

function fakeSensors(permission: PermissionOutcome = { status: "granted" }): FakeSensors {
  let permissionOutcome = permission;
  let locationListener: Parameters<LocationSource["subscribe"]>[0] | null = null;
  let headingListener: Parameters<HeadingSource["subscribe"]>[0] | null = null;
  let visibilityListener: ((state: VisibilityState) => void) | null = null;
  let activeLocation = 0;
  let activeHeading = 0;
  let permissionCallCount = 0;
  let wakeAcquireCallCount = 0;
  let wakeReleaseCallCount = 0;

  const location: LocationSource = {
    subscribe(onSample) {
      locationListener = onSample;
      activeLocation += 1;
      let active = true;
      return () => {
        if (active) {
          active = false;
          activeLocation -= 1;
        }
      };
    },
  };
  const heading: HeadingSource = {
    requestPermissionFromUserGesture() {
      permissionCallCount += 1;
      return Promise.resolve(permissionOutcome);
    },
    subscribe(onSample) {
      headingListener = onSample;
      activeHeading += 1;
      let active = true;
      return () => {
        if (active) {
          active = false;
          activeHeading -= 1;
        }
      };
    },
  };
  const visibility: VisibilitySource = {
    current: () => "visible",
    subscribe(listener) {
      visibilityListener = listener;
      return () => {
        visibilityListener = null;
      };
    },
  };
  const wakeLock: WakeLockSource = {
    acquire() {
      wakeAcquireCallCount += 1;
      const outcome: WakeLockOutcome = { status: "acquired" };
      return Promise.resolve(outcome);
    },
    release() {
      wakeReleaseCallCount += 1;
      return Promise.resolve();
    },
    subscribeToRelease: () => () => undefined,
  };

  return {
    ports: {
      location,
      heading,
      visibility,
      wakeLock,
      clock: { nowMs: () => 10_000 },
    },
    activeCounts: () => ({ location: activeLocation, heading: activeHeading }),
    permissionCalls: () => permissionCallCount,
    wakeAcquireCalls: () => wakeAcquireCallCount,
    wakeReleaseCalls: () => wakeReleaseCallCount,
    setPermission(outcome) {
      permissionOutcome = outcome;
    },
    emitVisibility(state) {
      if (visibilityListener !== null) {
        visibilityListener(state);
      }
    },
    emitLocation(sample) {
      if (locationListener !== null) {
        locationListener(sample);
      }
    },
    emitHeading(sample) {
      if (headingListener !== null) {
        headingListener(sample);
      }
    },
  };
}

describe("sensor controller lifecycle", () => {
  test("starts permission, subscriptions, and Wake Lock directly from one Start call", async () => {
    const fake = fakeSensors();
    const controller = createSensorController(fake.ports);

    const start = controller.startFromUserGesture();

    expect(fake.permissionCalls()).toBe(1);
    expect(fake.activeCounts()).toEqual({ location: 1, heading: 1 });
    expect(fake.wakeAcquireCalls()).toBe(1);
    await start;

    await controller.startFromUserGesture();
    expect(fake.permissionCalls()).toBe(1);
    expect(fake.activeCounts()).toEqual({ location: 1, heading: 1 });
  });

  test("stops on hidden and requires fresh location plus heading after visible", async () => {
    const fake = fakeSensors();
    const controller = createSensorController(fake.ports);
    await controller.startFromUserGesture();
    fake.emitLocation({
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
      accuracyM: 10,
      capturedAtMs: 10_000,
    });
    fake.emitHeading({
      degrees: 350,
      reference: "magnetic",
      accuracyDeg: 8,
      capturedAtMs: 10_000,
    });
    expect(controller.snapshot().guidance.status).toBe("live");

    fake.emitVisibility("hidden");
    await controller.settle();
    expect(fake.activeCounts()).toEqual({ location: 0, heading: 0 });
    expect(fake.wakeReleaseCalls()).toBe(1);
    expect(controller.snapshot().guidance).toEqual({
      status: "paused",
      reasons: ["visibility-hidden"],
    });

    fake.emitVisibility("visible");
    await controller.settle();
    expect(fake.activeCounts()).toEqual({ location: 1, heading: 1 });
    expect(fake.wakeAcquireCalls()).toBe(2);
    expect(controller.snapshot().guidance.status).toBe("acquiring");

    fake.emitLocation({
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
      accuracyM: 10,
      capturedAtMs: 10_000,
    });
    expect(controller.snapshot().guidance.status).toBe("acquiring");
    fake.emitHeading({
      degrees: 350,
      reference: "magnetic",
      accuracyDeg: 8,
      capturedAtMs: 10_000,
    });
    expect(controller.snapshot().guidance.status).toBe("live");
  });

  test("keeps a denied heading as a recoverable paused state", async () => {
    const fake = fakeSensors({ status: "denied" });
    const controller = createSensorController(fake.ports);

    await controller.startFromUserGesture();

    expect(controller.snapshot().heading.status).toBe("denied");
    expect(controller.snapshot().guidance).toEqual({
      status: "paused",
      reasons: ["heading-denied"],
    });
    expect(fake.activeCounts().heading).toBe(0);
  });

  test("retries permission and sensor subscriptions from a new user gesture", async () => {
    const fake = fakeSensors({ status: "denied" });
    const controller = createSensorController(fake.ports);
    await controller.startFromUserGesture();
    fake.setPermission({ status: "granted" });

    await controller.retryFromUserGesture();

    expect(fake.permissionCalls()).toBe(2);
    expect(fake.activeCounts()).toEqual({ location: 1, heading: 1 });
    expect(controller.snapshot().heading.status).toBe("acquiring");
  });
});
