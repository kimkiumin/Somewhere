import { describe, expect, it } from "vitest";

import {
  handleV2LocalControl,
  resetV2LocalControl,
  v2RuntimeNow,
} from "../src/testing/v2-local-control";

const CONTROL_URL = "http://127.0.0.1:8787/api/test/v2-control";
const CONTROL_KEY = "somewhere-v2-local-qa";

describe("V2 local QA control boundary", () => {
  it("is unavailable outside the local deployment environment", async () => {
    // Given: the exact control request accepted by an isolated local Worker.
    const request = new Request(CONTROL_URL, {
      body: JSON.stringify({ clockOffsetMs: 3_600_000 }),
      headers: {
        "content-type": "application/json",
        "x-somewhere-v2-control": CONTROL_KEY,
      },
      method: "PUT",
    });

    // When: the same request reaches a production deployment.
    const response = await handleV2LocalControl(request, "production");

    // Then: no test-only route exists for the production request router.
    expect(response).toBeUndefined();
  });

  it("changes time only for an authenticated local request and resets cleanly", async () => {
    // Given: a stable wall clock and a local control request advancing it by one hour.
    resetV2LocalControl();
    const wallClock = 1_800_000_000_000;
    const request = new Request(CONTROL_URL, {
      body: JSON.stringify({ clockOffsetMs: 3_600_000 }),
      headers: {
        "content-type": "application/json",
        "x-somewhere-v2-control": CONTROL_KEY,
      },
      method: "PUT",
    });

    // When: the authenticated request updates the local Worker clock.
    const response = await handleV2LocalControl(request, "local");

    // Then: the runtime clock advances exactly once and reset removes the offset.
    expect(response?.status).toBe(200);
    expect(v2RuntimeNow("local", () => wallClock)).toBe(wallClock + 3_600_000);
    expect(v2RuntimeNow("production", () => wallClock)).toBe(wallClock);
    resetV2LocalControl();
    expect(v2RuntimeNow("local", () => wallClock)).toBe(wallClock);
  });
});
