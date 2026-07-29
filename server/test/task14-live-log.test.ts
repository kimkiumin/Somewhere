import { describe, expect, it, vi } from "vitest";
import type { Database } from "../src/db/database";
import { OperationsRuntimeControl } from "../src/operations/runtime-control";

describe("Task 14 live operational log", () => {
  it("emits an allowlisted admission record for the local verification runtime", async () => {
    // Given: the local runtime uses no production control-plane database.
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const unusedDatabase: Database = {
      prepare: () => {
        throw new Error("Local authorization must not access D1");
      },
    };
    const control = new OperationsRuntimeControl(unusedDatabase);

    // When: a local request crosses the same HTTP operations boundary.
    const lease = await control.authorize(
      new Request("http://127.0.0.1:8787/api/v1/journeys", { method: "POST" }),
      "local",
      1,
    );
    await Promise.resolve();

    // Then: it is allowed and emits a real structured record without the request URL.
    expect(lease).toEqual({ allowed: true, writeEpoch: 1 });
    const serialized = String(log.mock.calls[0]?.[0] ?? "");
    expect(JSON.parse(serialized)).toEqual({
      admissionState: "OPEN",
      environment: "local",
      event: "admission_decision",
      outcome: "allowed",
      schemaVersion: 1,
      writeEpoch: 1,
    });
    expect(serialized).not.toContain("127.0.0.1");
  });
});
