import { describe, expect, test } from "vitest";
import { createDiagnosticTrace } from "./diagnostics";

describe("memory-only diagnostics", () => {
  test("exports versioned sensitive session data only on demand", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });
    trace.record({
      type: "location",
      capturedAtMs: 1_000,
      values: { latitude: 37.544_6, longitude: 127.037_4, accuracyM: 12 },
    });

    const exported = JSON.parse(
      trace.exportJson({
        browserMode: "safari",
        environmentLabel: "open-sky",
        userAgent: "test-agent",
      }),
    );

    expect(exported).toMatchObject({
      schemaVersion: 1,
      buildSha: "abc123",
      policyVersion: "field-v1",
      session: {
        browserMode: "safari",
        environmentLabel: "open-sky",
      },
    });
    expect(exported.events[0].values.latitude).toBe(37.544_6);
  });

  test("caps heading trace storage at five hertz and discards in memory", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });
    trace.record({ type: "heading", capturedAtMs: 1_000, values: { degrees: 10 } });
    trace.record({ type: "heading", capturedAtMs: 1_100, values: { degrees: 11 } });
    trace.record({ type: "heading", capturedAtMs: 1_200, values: { degrees: 12 } });

    expect(trace.snapshot()).toHaveLength(2);
    trace.discard();
    expect(trace.snapshot()).toEqual([]);
  });
});
