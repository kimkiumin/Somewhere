import { describe, expect, test } from "vitest";
import config from "../../playwright.config";
import v2Config from "../../playwright.v2.config";

describe("Playwright suite boundaries", () => {
  test("keeps real Worker journeys exclusive to the dedicated V2 config", () => {
    // Given: generic harness and real-Worker browser suites have different servers.

    // When: both Playwright collection boundaries are inspected.
    const genericIgnore = Array.isArray(config.testIgnore)
      ? config.testIgnore
      : [config.testIgnore];
    const webkit = config.projects?.find((project) => project.name === "webkit-mobile");
    const webkitIgnore = Array.isArray(webkit?.testIgnore)
      ? webkit.testIgnore
      : [webkit?.testIgnore];

    // Then: the generic suite excludes V2 while the dedicated suite selects its exact spec.
    expect(genericIgnore).toContain("**/v2/**");
    expect(webkitIgnore).toContain("**/v2/**");
    expect(v2Config.testDir).toBe("./e2e/v2");
    expect(v2Config.testMatch).toBe("real-worker-journey.spec.ts");
  });
});
