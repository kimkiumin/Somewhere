import { describe, expect, test } from "vitest";
import { createBrowserVisibilitySource, createBrowserWakeLockSource } from "./browser-lifecycle";

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
});
