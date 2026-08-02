import { describe, expect, test } from "vitest";
import { createBrowserVisibilitySource, createBrowserWakeLockSource } from "./browser-lifecycle";

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("browser lifecycle adapters", () => {
  test("normalizes visibility and removes the listener", () => {
    const callbacks: { visibility: () => void } = { visibility: () => undefined };
    let state = "visible";
    let removeCount = 0;
    const source = createBrowserVisibilitySource({
      visibilityState: () => state,
      addVisibilityListener(next) {
        callbacks.visibility = next;
      },
      removeVisibilityListener() {
        removeCount += 1;
        callbacks.visibility = () => undefined;
      },
    });
    const seen: string[] = [];
    const unsubscribe = source.subscribe((next) => seen.push(next));

    state = "hidden";
    callbacks.visibility();
    unsubscribe();
    unsubscribe();

    expect(seen).toEqual(["hidden"]);
    expect(removeCount).toBe(1);
  });

  test("acquires, reports system release, and explicitly releases Wake Lock", async () => {
    const callbacks: { release: () => void } = { release: () => undefined };
    let sentinelReleaseCount = 0;
    const source = createBrowserWakeLockSource({
      request: () =>
        Promise.resolve({
          released: false,
          release() {
            sentinelReleaseCount += 1;
            return Promise.resolve();
          },
          addReleaseListener(listener) {
            callbacks.release = listener;
          },
          removeReleaseListener() {
            callbacks.release = () => undefined;
          },
        }),
    });
    let observedRelease = 0;
    source.subscribeToRelease(() => {
      observedRelease += 1;
    });

    await expect(source.acquire()).resolves.toEqual({ status: "acquired" });
    callbacks.release();
    expect(observedRelease).toBe(1);

    await source.release();
    expect(sentinelReleaseCount).toBe(1);
  });

  test("reacquires after the system marks the current Wake Lock released", async () => {
    let requestCount = 0;
    let releaseListener = (): void => undefined;
    let currentReleased = false;
    const source = createBrowserWakeLockSource({
      request() {
        requestCount += 1;
        currentReleased = false;
        return Promise.resolve({
          get released() {
            return currentReleased;
          },
          release: () => Promise.resolve(),
          addReleaseListener(listener) {
            releaseListener = listener;
          },
          removeReleaseListener() {
            releaseListener = () => undefined;
          },
        });
      },
    });
    const reacquired = deferred<void>();
    source.subscribeToRelease(() => {
      void source.acquire().then(() => reacquired.resolve());
    });

    await source.acquire();
    currentReleased = true;
    releaseListener();
    await reacquired.promise;

    expect(requestCount).toBe(2);
  });

  test("deduplicates acquisition and releases a sentinel that arrives after release", async () => {
    const request = deferred<{
      readonly released: boolean;
      readonly release: () => Promise<void>;
      readonly addReleaseListener: (listener: () => void) => void;
      readonly removeReleaseListener: (listener: () => void) => void;
    }>();
    let requestCount = 0;
    let sentinelReleaseCount = 0;
    const source = createBrowserWakeLockSource({
      request() {
        requestCount += 1;
        return request.promise;
      },
    });

    const firstAcquire = source.acquire();
    const secondAcquire = source.acquire();
    const release = source.release();
    request.resolve({
      released: false,
      release() {
        sentinelReleaseCount += 1;
        return Promise.resolve();
      },
      addReleaseListener() {},
      removeReleaseListener() {},
    });

    await expect(firstAcquire).resolves.toEqual({ status: "acquired" });
    await expect(secondAcquire).resolves.toEqual({ status: "acquired" });
    await release;
    expect(requestCount).toBe(1);
    expect(sentinelReleaseCount).toBe(1);
  });

  test("keeps a shared pending acquisition when visibility immediately needs it again", async () => {
    const request = deferred<{
      readonly released: boolean;
      readonly release: () => Promise<void>;
      readonly addReleaseListener: (listener: () => void) => void;
      readonly removeReleaseListener: (listener: () => void) => void;
    }>();
    let requestCount = 0;
    let sentinelReleaseCount = 0;
    const source = createBrowserWakeLockSource({
      request() {
        requestCount += 1;
        return request.promise;
      },
    });

    const firstAcquire = source.acquire();
    const release = source.release();
    const resumedAcquire = source.acquire();
    request.resolve({
      released: false,
      release() {
        sentinelReleaseCount += 1;
        return Promise.resolve();
      },
      addReleaseListener() {},
      removeReleaseListener() {},
    });

    await Promise.all([firstAcquire, release, resumedAcquire]);
    expect(requestCount).toBe(1);
    expect(sentinelReleaseCount).toBe(0);
  });
});
