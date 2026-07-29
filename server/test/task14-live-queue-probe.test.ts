import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { consumeQueueBatch } from "../src/async/worker";
import {
  enqueueLocalQueueProbes,
  recordLocalDlqDelivery,
} from "../src/operations/local-runtime-probe";
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
    await enqueueLocalQueueProbes(
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
    await recordLocalDlqDelivery(
      batch("somewhere-events-dlq-local", dlq[0], 1),
      fixture.database,
      1_002,
    );

    // Then: the Queue probe is complete and the durable receipt contains no poison payload.
    expect(sent).toHaveLength(2);
    expect(queryJson(fixture.path, "SELECT action_code, result_code FROM audit_events")).toEqual([
      { action_code: "dlq-delivery", result_code: "poison-received" },
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
