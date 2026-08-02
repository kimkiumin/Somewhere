import { describe, expect, it, vi } from "vitest";
import { runReservedNewWork } from "../src/api/journey-create";

describe("Task 14 create reservation settlement", () => {
  it.each([
    { expected: "finalize", status: 201 },
    { expected: "release", status: 422 },
  ] as const)("uses $expected for an application response with status $status", async (fixture) => {
    // Given: an authenticated create has already acquired a release-bound reservation.
    const finalize = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);

    // When: the controller operation finishes with the named response.
    const response = await runReservedNewWork({ finalize, release }, async () => {
      return new Response(null, { status: fixture.status });
    });

    // Then: only the outcome-appropriate settlement is persisted.
    expect(response.status).toBe(fixture.status);
    expect(finalize).toHaveBeenCalledTimes(fixture.expected === "finalize" ? 1 : 0);
    expect(release).toHaveBeenCalledTimes(fixture.expected === "release" ? 1 : 0);
  });

  it("releases the reservation before propagating an application exception", async () => {
    // Given: an authenticated create has acquired a reservation and its operation will fail.
    const finalize = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);

    // When: the controller operation throws.
    const operation = runReservedNewWork({ finalize, release }, async () => {
      throw new Error("provider unavailable");
    });

    // Then: the failure is propagated only after releasing the reserved headroom.
    await expect(operation).rejects.toThrow("provider unavailable");
    expect(release).toHaveBeenCalledOnce();
    expect(finalize).not.toHaveBeenCalled();
  });

  it("does not reinterpret a finalization failure as an application failure", async () => {
    // Given: the application succeeded but durable usage finalization fails.
    const finalize = vi.fn(async () => {
      throw new Error("finalization incomplete");
    });
    const release = vi.fn(async () => undefined);

    // When: settlement follows a successful response.
    const operation = runReservedNewWork({ finalize, release }, async () => {
      return new Response(null, { status: 201 });
    });

    // Then: the original settlement error is preserved without an invalid release attempt.
    await expect(operation).rejects.toThrow("finalization incomplete");
    expect(finalize).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });
});
