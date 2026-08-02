import { describe, expect, test } from "vitest";
import { wakeLockSentinel } from "./browser-composition";

describe("browser Wake Lock composition", () => {
  test("reads the native sentinel release state live", () => {
    let released = false;
    const sentinel = wakeLockSentinel({
      get released() {
        return released;
      },
      release: () => Promise.resolve(),
      addEventListener() {},
      removeEventListener() {},
    });

    expect(sentinel.released).toBe(false);
    released = true;
    expect(sentinel.released).toBe(true);
  });
});
