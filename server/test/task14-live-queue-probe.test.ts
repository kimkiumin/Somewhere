import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePoisonMessage } from "../src/async/message";
import { consumeQueueBatch } from "../src/async/worker";
import * as runtimeProbe from "../src/operations/local-runtime-probe";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const temporaryPaths: string[] = [];

describe("Task 14 live Queue and DLQ probe", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("drives a valid receipt and a redacted fifth-attempt poison receipt", async () => {
    // Given: the local probe emits one valid and one intentionally invalid Queue body.
    const sent: unknown[] = [];
    await runtimeProbe.enqueueLocalQueueProbes(
      {
        sendBatch: async (entries) => {
          sent.push(...[...entries].map((entry) => entry.body));
        },
      },
      1_000,
    );
    const dlq: unknown[] = [];

    // When: the invalid body reaches its fifth delivery and the local DLQ consumer records it.
    await consumeQueueBatch({
      batch: batch("somewhere-events-local", sent[1], 5),
      dlq: { send: async (body) => void dlq.push(body) },
      now: 1_001,
      repository: {
        async consume() {
          throw new Error("invalid probe must not reach D1 consumption");
        },
      },
    });
    const fixture = migratedDatabase();
    await runtimeProbe.recordLocalDlqDelivery(
      batch("somewhere-events-dlq-local", dlq[0], 1),
      fixture.database,
      1_002,
    );

    // Then: the durable receipt binds the poison digest without retaining the poison payload.
    const poison = parsePoisonMessage(dlq[0]);
    expect(sent).toHaveLength(2);
    expect(
      queryJson(fixture.path, "SELECT audit_event_id, action_code, result_code FROM audit_events"),
    ).toEqual([
      {
        action_code: "dlq-delivery",
        audit_event_id: `audit_v1.${poison.originalEventDigest}`,
        result_code: "poison-received",
      },
    ]);
  });

  it("binds every local retry observation to the invalid body digest", async () => {
    // Given: Miniflare delivers the governed invalid body for its third attempt.
    const invalidBody = { probe: "task14-invalid-queue", schemaVersion: 0 };

    // When: local-only queue attempt evidence is derived from the real message.
    const evidence = await runtimeProbe.localQueueAttemptEvidence(
      batch("somewhere-events-local", invalidBody, 3),
    );

    // Then: the observed attempt is causally keyed to the eventual poison identity.
    expect(evidence).toEqual([
      {
        attempt: 3,
        originalEventDigest: "93b5de90d771043691ceaa77a4b614b8c89a6959b3fd51d5594561cac143e6a8",
      },
    ]);
  });
});

function batch(queue: string, body: unknown, attempts: number): MessageBatch<unknown> {
  return {
    ackAll() {},
    metadata: {
      metrics: {
        backlogBytes: 0,
        backlogCount: 1,
      },
    },
    messages: [
      {
        ack() {},
        attempts,
        body,
        id: "cloudflare-task14-probe",
        retry() {},
        timestamp: new Date(1_000),
      },
    ],
    queue,
    retryAll() {},
  };
}

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-live-queue-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
  ]) {
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations", migration), "utf8"));
  }
  return { database: new SqliteDatabase(path), path };
}
