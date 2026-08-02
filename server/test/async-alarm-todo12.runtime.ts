import {
  createExecutionContext,
  createMessageBatch,
  evictDurableObject,
  getQueueResult,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { buildAsyncMessage } from "../src/async/message";
import worker from "../src/index";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("Todo12 Durable Object alarm recovery", () => {
  it("keeps the exact journey expiry alarm across restart and cannot resurrect after tombstone delete", async () => {
    const now = Date.now();
    const expiresAt = now + 86_400_000;
    const stub = env.JOURNEYS.getByName(`todo12-expiry-${now}`);
    await stub.initialize({
      browserBindingDigest: DIGEST_A,
      expiresAt,
      journeyId: "journey_todo12_expiry_0001",
      selectedSnapshot: {
        destinationSnapshotCiphertext: "ciphertext.destination.runtime.todo12",
        disclosure: { category: "cafe", hint: "quiet courtyard" },
        selectionReceiptId: "receipt_todo12_expiry_0001",
      },
      sequence: 0,
      writeEpoch: 1,
    });

    const beforeRestart = await runInDurableObject(stub, (_instance, state) =>
      state.storage.getAlarm(),
    );
    await evictDurableObject(stub);
    const repair = await stub.reconcileAlarm(now);
    const afterRestart = await runInDurableObject(stub, (_instance, state) =>
      state.storage.getAlarm(),
    );

    expect(await beforeRestart).toBe(expiresAt);
    expect(repair).toEqual({ alarmAt: expiresAt, kind: "scheduled" });
    expect(await afterRestart).toBe(expiresAt);
    await expect(stub.reconcileAlarm(expiresAt - 1)).resolves.toEqual({
      alarmAt: expiresAt,
      kind: "scheduled",
    });
    await expect(stub.reconcileAlarm(expiresAt)).resolves.toEqual({ kind: "terminal" });
    expect(
      await runInDurableObject(
        stub,
        (_instance, state) =>
          state.storage.sql
            .exec<{ count: number }>(
              "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'journey_%'",
            )
            .one().count,
      ),
    ).toBe(0);

    const deletedStub = env.JOURNEYS.getByName(`todo12-deleted-${now}`);
    await deletedStub.initialize({
      browserBindingDigest: DIGEST_A,
      expiresAt,
      journeyId: "journey_todo12_deleted_0001",
      selectedSnapshot: {
        destinationSnapshotCiphertext: "ciphertext.destination.deleted.todo12",
        disclosure: { category: "cafe", hint: "quiet courtyard" },
        selectionReceiptId: "receipt_todo12_deleted_0001",
      },
      sequence: 0,
      writeEpoch: 1,
    });
    await deletedStub.beginDeletion({ deleteRequestDigest: DIGEST_B, expectedSequence: 0 });
    await deletedStub.deleteAfterTombstone({
      deleteRequestDigest: DIGEST_B,
      durable: true,
      replayStatus: 204,
    });
    await evictDurableObject(deletedStub);
    expect(await runDurableObjectAlarm(deletedStub)).toBe(false);
    await expect(deletedStub.reconcileAlarm(now + 1)).resolves.toEqual({ kind: "terminal" });
    expect(
      await runInDurableObject(deletedStub, (_instance, state) => ({
        gate: state.storage.sql
          .exec<{ delete_request_digest: string }>(
            "SELECT delete_request_digest FROM journey_deletion_gate",
          )
          .one().delete_request_digest,
        privateRows: state.storage.sql
          .exec<{ count: number }>(
            `SELECT
                (SELECT COUNT(*) FROM journey_state) +
                (SELECT COUNT(*) FROM journey_outbox) +
                (SELECT COUNT(*) FROM journey_inbox) AS count`,
          )
          .one().count,
      })),
    ).toEqual({ gate: DIGEST_B, privateRows: 0 });
  });

  it("runs the real Queue handler against D1 and acknowledges late tombstoned work", async () => {
    const now = Date.now();
    const schema = [
      `CREATE TABLE IF NOT EXISTS inbox_events (
        event_id TEXT PRIMARY KEY,
        event_digest TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        result_code TEXT NOT NULL,
        write_epoch INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS outbox_events (
        event_id TEXT PRIMARY KEY,
        aggregate_digest TEXT NOT NULL,
        event_digest TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        delivery_state TEXT NOT NULL,
        write_epoch INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        acknowledged_at INTEGER,
        expires_at INTEGER NOT NULL
      ) STRICT`,
      `CREATE TABLE IF NOT EXISTS journey_tombstones (
        journey_hmac_digest TEXT PRIMARY KEY,
        delete_request_digest TEXT NOT NULL,
        terminal_type TEXT NOT NULL,
        coarse_utc_bucket INTEGER NOT NULL,
        write_epoch INTEGER NOT NULL,
        replay_status INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT`,
    ];
    for (const statement of schema) {
      await env.DB.prepare(statement).run();
    }
    await env.DB.prepare(
      "INSERT OR REPLACE INTO journey_tombstones VALUES (?, ?, 'deleted', ?, 2, 204, ?)",
    )
      .bind(DIGEST_A, DIGEST_B, now, now + 48 * 60 * 60 * 1_000)
      .run();
    const message = await buildAsyncMessage({
      eventType: "journey.expire",
      occurredAt: now,
      subjectDigest: DIGEST_A,
      writeEpoch: 1,
    });
    const batch = createMessageBatch("somewhere-events-local", [
      {
        attempts: 1,
        body: message,
        id: "cloudflare-runtime-todo12",
        timestamp: new Date(now),
      },
    ]);
    const ctx = createExecutionContext();

    await worker.queue(batch, env);
    const result = await getQueueResult(batch, ctx);
    const inbox = await env.DB.prepare(
      "SELECT result_code, received_at, expires_at FROM inbox_events WHERE event_id = ?",
    )
      .bind(message.eventId)
      .first<{ expires_at: number; received_at: number; result_code: string }>();

    expect(result).toMatchObject({ explicitAcks: ["cloudflare-runtime-todo12"] });
    expect(inbox?.result_code).toBe("tombstoned");
    expect((inbox?.expires_at ?? 0) - (inbox?.received_at ?? 0)).toBe(48 * 60 * 60 * 1_000);
  });
});
