import type {
  Unsubscribe,
  VisibilitySource,
  WakeLockOutcome,
  WakeLockSource,
} from "../application/ports";

export type VisibilityEnvironment = {
  readonly visibilityState: () => string;
  readonly addVisibilityListener: (listener: () => void) => void;
  readonly removeVisibilityListener: (listener: () => void) => void;
};

export function createBrowserVisibilitySource(
  environment: VisibilityEnvironment,
): VisibilitySource {
  function current(): "visible" | "hidden" {
    return environment.visibilityState() === "hidden" ? "hidden" : "visible";
  }

  return {
    current,
    subscribe(listener): Unsubscribe {
      const browserListener = (): void => {
        listener(current());
      };
      environment.addVisibilityListener(browserListener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          environment.removeVisibilityListener(browserListener);
        }
      };
    },
  };
}

export type WakeLockSentinelLike = {
  readonly released: boolean;
  readonly release: () => Promise<void>;
  readonly addReleaseListener: (listener: () => void) => void;
  readonly removeReleaseListener: (listener: () => void) => void;
};

export type WakeLockEnvironment = {
  readonly request: () => Promise<WakeLockSentinelLike>;
};

export function createBrowserWakeLockSource(
  environment: WakeLockEnvironment | undefined,
): WakeLockSource {
  let sentinel: WakeLockSentinelLike | null = null;
  let sentinelListener: (() => void) | null = null;
  let pendingAcquire: Promise<WakeLockOutcome> | null = null;
  let desiredActive = false;
  const listeners = new Set<() => void>();

  function detachSentinelListener(): void {
    if (sentinel !== null && sentinelListener !== null) {
      sentinel.removeReleaseListener(sentinelListener);
    }
    sentinelListener = null;
  }

  return {
    acquire(): Promise<WakeLockOutcome> {
      desiredActive = true;
      if (environment === undefined) {
        return Promise.resolve({ status: "unsupported" });
      }
      if (sentinel !== null && !sentinel.released) {
        return Promise.resolve({ status: "acquired" });
      }
      if (pendingAcquire !== null) {
        return pendingAcquire;
      }

      pendingAcquire = (async () => {
        try {
          const nextSentinel = await environment.request();
          detachSentinelListener();
          sentinel = nextSentinel;
          sentinelListener = () => {
            for (const listener of listeners) {
              listener();
            }
          };
          sentinel.addReleaseListener(sentinelListener);
          if (!desiredActive) {
            await sentinel.release();
            detachSentinelListener();
            sentinel = null;
          }
          return { status: "acquired" };
        } catch (error) {
          return {
            status: "error",
            message: error instanceof Error ? error.message : "Wake Lock request failed.",
          };
        } finally {
          pendingAcquire = null;
        }
      })();
      return pendingAcquire;
    },
    async release(): Promise<void> {
      desiredActive = false;
      const acquiring = pendingAcquire;
      if (acquiring !== null) {
        await Promise.all([acquiring]);
      }
      if (desiredActive) {
        return;
      }
      const currentSentinel = sentinel;
      if (currentSentinel === null) {
        return;
      }
      await currentSentinel.release();
      detachSentinelListener();
      sentinel = null;
    },
    subscribeToRelease(listener): Unsubscribe {
      listeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          listeners.delete(listener);
        }
      };
    },
  };
}
