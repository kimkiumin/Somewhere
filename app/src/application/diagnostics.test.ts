import { describe, expect, test } from "vitest";
import { createDiagnosticTrace } from "./diagnostics";

describe("memory-only diagnostics", () => {
  test("ignores recording until a session explicitly begins", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });

    trace.record({ type: "marker", capturedAtMs: 1, values: { phase: "disabled" } });
    expect(trace.eventCount()).toBe(0);

    trace.beginSession();
    trace.record({ type: "marker", capturedAtMs: 2, values: { phase: "enabled" } });
    trace.stopRecording();
    trace.record({ type: "marker", capturedAtMs: 3, values: { phase: "stopped" } });

    expect(trace.eventCount()).toBe(1);
  });

  test("exports versioned sensitive session data only on demand", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });
    trace.beginSession();
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
      schemaVersion: 2,
      buildSha: "abc123",
      policyVersion: "field-v1",
      session: {
        browserMode: "safari",
        environmentLabel: "open-sky",
      },
      retention: {
        maxEvents: 12_000,
        droppedEventCount: 0,
      },
    });
    expect(exported.events[0].values.latitude).toBe(37.544_6);
  });

  test("caps heading trace storage at five hertz and discards in memory", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });
    trace.beginSession();
    trace.record({ type: "heading", capturedAtMs: 1_000, values: { degrees: 10 } });
    trace.record({ type: "heading", capturedAtMs: 1_100, values: { degrees: 11 } });
    trace.record({ type: "heading", capturedAtMs: 1_200, values: { degrees: 12 } });

    expect(trace.snapshot()).toHaveLength(2);
    trace.discard();
    trace.record({ type: "heading", capturedAtMs: 1_400, values: { degrees: 14 } });
    expect(trace.snapshot()).toEqual([]);
    expect(trace.eventCount()).toBe(0);
  });

  test("retains the newest 12,000 events in order and reports truncation", () => {
    const trace = createDiagnosticTrace({
      buildSha: "abc123",
      policyVersion: "field-v1",
    });
    trace.beginSession();

    for (let index = 0; index < 12_001; index += 1) {
      trace.record({
        type: "marker",
        capturedAtMs: index,
        values: { index },
      });
    }

    const retained = trace.snapshot();
    expect(trace.eventCount()).toBe(12_000);
    expect(retained).toHaveLength(12_000);
    expect(retained[0]?.capturedAtMs).toBe(1);
    expect(retained.at(-1)?.capturedAtMs).toBe(12_000);
    const exported = JSON.parse(
      trace.exportJson({
        browserMode: "other",
        environmentLabel: "other",
        userAgent: "test-agent",
      }),
    );
    expect(exported.retention).toEqual({
      maxEvents: 12_000,
      droppedEventCount: 1,
    });
  });
});
