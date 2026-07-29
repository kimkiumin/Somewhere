import { describe, expect, test } from "vitest";
import { resetLocalBrowserState } from "./local-reset";

describe("local PWA reset", () => {
  test("exports one reset coordinator for journey and browser persistence", async () => {
    // Given the local reset application module
    const localReset = await import("./local-reset");

    // When its public coordinator is inspected
    const reset = Reflect.get(localReset, "resetLocalBrowserState");

    // Then deletion and reset flows can share one complete cleanup operation
    expect(reset).toBeTypeOf("function");
  });

  test("clears volatile journey and browser persistence in one reset", async () => {
    // Given independent journey and browser cleanup ports
    const completed: string[] = [];

    // When the local reset coordinator runs
    await resetLocalBrowserState({
      journey: {
        async reset() {
          completed.push("journey");
        },
      },
      browserPersistence: {
        async clear() {
          completed.push("browser");
        },
      },
    });

    // Then both state classes are removed
    expect(completed).toEqual(["journey", "browser"]);
  });

  test("still clears browser persistence when volatile journey cleanup fails", async () => {
    // Given a failing journey cleanup and a healthy browser cleanup
    let browserCleared = false;

    // When the local reset coordinator runs
    const failure = resetLocalBrowserState({
      journey: {
        async reset() {
          throw new Error("journey reset failed");
        },
      },
      browserPersistence: {
        async clear() {
          browserCleared = true;
        },
      },
    });

    // Then browser cleanup still runs and the reset reports failure
    await expect(failure).rejects.toThrow("Local reset failed");
    expect(browserCleared).toBe(true);
  });
});
