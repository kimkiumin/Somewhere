import { afterEach, describe, expect, test, vi } from "vitest";

import { createCompassAnimator } from "./compass";

type FakeNeedle = Readonly<{
  values: Map<string, string>;
  style: Readonly<{ setProperty(name: string, value: string): void }>;
}>;

function fakeNeedle(): FakeNeedle {
  const values = new Map<string, string>();
  return {
    values,
    style: {
      setProperty(name, value) {
        values.set(name, value);
      },
    },
  };
}

function installAnimationFrameHarness() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("window", {
    cancelAnimationFrame: vi.fn(),
    matchMedia: vi.fn(() => ({ matches: false })),
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  });
  return {
    flush() {
      const callback = frames.shift();
      if (callback === undefined) {
        throw new Error("no animation frame was scheduled");
      }
      callback(0);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compass animator", () => {
  test("reuses the live needle across animation frames", () => {
    const frame = installAnimationFrameHarness();
    const needle = fakeNeedle();
    const root = {
      querySelector: vi.fn(() => needle),
    } as unknown as HTMLElement;
    const animator = createCompassAnimator(root);

    for (const degrees of [10, 20, 30]) {
      animator.update(degrees);
      frame.flush();
    }

    expect(root.querySelector).toHaveBeenCalledTimes(1);
    expect(needle.values.get("--needle-angle")).toBe("30deg");
  });

  test("refreshes the cached needle after the screen is rebuilt", () => {
    const frame = installAnimationFrameHarness();
    const first = fakeNeedle();
    const replacement = fakeNeedle();
    const root = {
      querySelector: vi.fn().mockReturnValueOnce(first).mockReturnValue(replacement),
    } as unknown as HTMLElement;
    const animator = createCompassAnimator(root);

    animator.update(25);
    frame.flush();
    animator.applyCurrent();

    expect(root.querySelector).toHaveBeenCalledTimes(2);
    expect(first.values.get("--needle-angle")).toBe("25deg");
    expect(replacement.values.get("--needle-angle")).toBe("25deg");
  });
});
