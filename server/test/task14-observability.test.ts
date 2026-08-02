import { describe, expect, it } from "vitest";
import { scanCanarySurface } from "../src/observability/canary-scanner";
import { RedactedOperationalLogger } from "../src/observability/redacted-logger";

describe("Task 14 exact allowlisted observability", () => {
  it("emits only the typed operational allowlist", async () => {
    // Given: an in-memory sink and a complete admission decision.
    const records: string[] = [];
    const logger = new RedactedOperationalLogger({ write: (record) => records.push(record) });

    // When: the logger serializes the typed record.
    logger.write({
      admissionState: "WARN",
      durationMs: 51,
      environment: "staging",
      event: "admission_decision",
      outcome: "allowed",
      requestId: "req_v1.ABCDEFGHIJKLMNOP",
      writeEpoch: 4,
    });
    await Promise.resolve();

    // Then: duration is bucketed and no accidental context object can cross the boundary.
    expect(JSON.parse(records[0] ?? "{}")).toEqual({
      admissionState: "WARN",
      durationBucket: "lt250",
      environment: "staging",
      event: "admission_decision",
      outcome: "allowed",
      requestId: "req_v1.ABCDEFGHIJKLMNOP",
      schemaVersion: 1,
      writeEpoch: 4,
    });
  });

  it("isolates request latency and failures from the nonblocking log sink", async () => {
    // Given: a sink that records invocation and then throws.
    let invoked = false;
    const logger = new RedactedOperationalLogger({
      write: () => {
        invoked = true;
        throw new Error("logging unavailable");
      },
    });

    // When: the admission path emits an allowlisted operational record.
    const write = () =>
      logger.write({
        environment: "production",
        event: "admission_decision",
        outcome: "allowed",
        writeEpoch: 4,
      });

    // Then: the request path returns before the sink and its later failure remains isolated.
    expect(write).not.toThrow();
    expect(invoked).toBe(false);
    await Promise.resolve();
    expect(invoked).toBe(true);
  });

  it("TASK14-LOG-URL-CANARY rejects URLs and query secrets in log artifacts", () => {
    // Given: a log line containing a complete request URL and a sensitive query value.
    const artifact = "request=https://api.example.test/api/v1/journeys?token=secret";

    // When: the log-specific canary registry scans it.
    const findings = scanCanarySurface("log", artifact);

    // Then: the immutable URL and query detectors both fire.
    expect(findings).toEqual([
      { detectorId: "url", surface: "log" },
      { detectorId: "query", surface: "log" },
    ]);
  });

  it.each(["build", "http", "d1", "do", "queue", "dlq", "test-artifact"] as const)(
    "scans the %s surface with the common deny registry",
    (surface) => {
      // Given: the same location canary is propagated to an independent surface.
      const artifact = "SOMEWHERE_CANARY_LOCATION";

      // When: the shared registry scans the artifact.
      const findings = scanCanarySurface(surface, artifact);

      // Then: every surface rejects the canary rather than assuming another layer caught it.
      expect(findings).toContainEqual({ detectorId: "canary-secret", surface });
    },
  );
});
