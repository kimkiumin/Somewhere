import type { SensorControllerPorts } from "../application/ports";
import { createBrowserHeadingSource, type OrientationPermissionProvider } from "./browser-heading";
import {
  createBrowserVisibilitySource,
  createBrowserWakeLockSource,
  type WakeLockEnvironment,
  type WakeLockSentinelLike,
} from "./browser-lifecycle";
import { createBrowserLocationSource } from "./browser-location";

function orientationPermissionProvider(): OrientationPermissionProvider | undefined {
  const orientationEventClass = globalThis.DeviceOrientationEvent;
  if (typeof orientationEventClass !== "function") {
    return undefined;
  }
  const requestPermission = Reflect.get(orientationEventClass, "requestPermission");
  if (typeof requestPermission !== "function") {
    return { requestPermission: () => Promise.resolve("granted") };
  }
  return {
    requestPermission: () =>
      Promise.resolve(Reflect.apply(requestPermission, orientationEventClass, [])),
  };
}

function wakeLockSentinel(input: unknown): WakeLockSentinelLike {
  if (typeof input !== "object" || input === null) {
    throw new Error("Wake Lock returned a malformed sentinel.");
  }
  const release = Reflect.get(input, "release");
  const addEventListener = Reflect.get(input, "addEventListener");
  const removeEventListener = Reflect.get(input, "removeEventListener");
  if (
    typeof release !== "function" ||
    typeof addEventListener !== "function" ||
    typeof removeEventListener !== "function"
  ) {
    throw new Error("Wake Lock sentinel is missing lifecycle methods.");
  }
  const listenerMap = new Map<() => void, EventListener>();
  return {
    released: Reflect.get(input, "released") === true,
    release: async () => {
      await Promise.resolve(Reflect.apply(release, input, []));
    },
    addReleaseListener(listener) {
      const browserListener: EventListener = () => listener();
      listenerMap.set(listener, browserListener);
      Reflect.apply(addEventListener, input, ["release", browserListener]);
    },
    removeReleaseListener(listener) {
      const browserListener = listenerMap.get(listener);
      if (browserListener !== undefined) {
        Reflect.apply(removeEventListener, input, ["release", browserListener]);
        listenerMap.delete(listener);
      }
    },
  };
}

function wakeLockEnvironment(): WakeLockEnvironment | undefined {
  const manager = Reflect.get(navigator, "wakeLock");
  if (typeof manager !== "object" || manager === null) {
    return undefined;
  }
  const request = Reflect.get(manager, "request");
  if (typeof request !== "function") {
    return undefined;
  }
  return {
    async request() {
      const sentinel = await Promise.resolve(Reflect.apply(request, manager, ["screen"]));
      return wakeLockSentinel(sentinel);
    },
  };
}

export function createBrowserSensorPorts(): SensorControllerPorts {
  const headingListeners = new Map<(event: unknown) => void, EventListener>();
  const locationEnvironment = {
    watchPosition(
      onPosition: (position: unknown) => void,
      onFailure: (failure: unknown) => void,
    ): number {
      if (navigator.geolocation === undefined) {
        onFailure({ code: 2 });
        return -1;
      }
      return navigator.geolocation.watchPosition(
        (position) => onPosition(position),
        (failure) => onFailure(failure),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        },
      );
    },
    clearWatch(watchId: number): void {
      if (watchId >= 0) {
        navigator.geolocation.clearWatch(watchId);
      }
    },
  };
  const headingEnvironment = {
    add(listener: (event: unknown) => void): void {
      const browserListener: EventListener = (event) => listener(event);
      headingListeners.set(listener, browserListener);
      window.addEventListener("deviceorientation", browserListener);
      window.addEventListener("deviceorientationabsolute", browserListener);
    },
    remove(listener: (event: unknown) => void): void {
      const browserListener = headingListeners.get(listener);
      if (browserListener !== undefined) {
        window.removeEventListener("deviceorientation", browserListener);
        window.removeEventListener("deviceorientationabsolute", browserListener);
        headingListeners.delete(listener);
      }
    },
    permissionProvider: orientationPermissionProvider(),
    nowMs: () => Date.now(),
  };
  const visibilityEnvironment = {
    visibilityState: () => document.visibilityState,
    addVisibilityListener: (listener: () => void) =>
      document.addEventListener("visibilitychange", listener),
    removeVisibilityListener: (listener: () => void) =>
      document.removeEventListener("visibilitychange", listener),
  };

  return {
    location: createBrowserLocationSource(locationEnvironment),
    heading: createBrowserHeadingSource(headingEnvironment),
    visibility: createBrowserVisibilitySource(visibilityEnvironment),
    wakeLock: createBrowserWakeLockSource(wakeLockEnvironment()),
    clock: { nowMs: () => Date.now() },
  };
}
