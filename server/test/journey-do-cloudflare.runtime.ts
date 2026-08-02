import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

function readyInput(now: number) {
  return {
    browserBindingDigest: DIGEST_A,
    expiresAt: now + 86_400_000,
    journeyId: "journey_todo9_runtime_0001",
    selectedSnapshot: {
      destinationSnapshotCiphertext: "ciphertext.destination.runtime.todo9",
      disclosure: { category: "cafe", hint: "quiet courtyard" },
      selectionReceiptId: "receipt_todo9_runtime_0001",
    },
    sequence: 0,
    writeEpoch: 3,
  } as const;
}

function commitCommand(now: number) {
  return {
    bodyDigest: DIGEST_B,
    expectedSequence: 0,
    idempotencyKeyDigest: DIGEST_C,
    now,
    outcomeCiphertext: "ciphertext.runtime.todo9",
    type: "commit",
    writeEpoch: 3,
  } as const;
}

describe("JourneyDurableObject Cloudflare runtime", () => {
  it("persists one atomic state, outcome, and outbox across eviction and replay", async () => {
    // Given: a real SQLite Durable Object in the Workers runtime.
    const now = Date.now();
    const stub = env.JOURNEYS.getByName("todo9-runtime-atomic");
    await stub.initialize(readyInput(now));

    // When: Commit succeeds, the isolate is evicted, and the same command is replayed.
    const committed = await stub.transition(commitCommand(now));
    await evictDurableObject(stub);
    const replay = await stub.transition(commitCommand(now));
    const inventory = await runInDurableObject(stub, (_instance, state) => {
      const storedState = state.storage.sql
        .exec<{ payload: string }>("SELECT payload FROM journey_state")
        .one();
      return {
        outboxCount: state.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM journey_outbox")
          .one().count,
        state: JSON.parse(storedState.payload),
      };
    });

    // Then: the persisted sequence and outbox remain singular and replay is byte-stable.
    expect(committed).toEqual({
      kind: "applied",
      outcomeCiphertext: "ciphertext.runtime.todo9",
      phase: "committed",
      revealed: false,
      sequence: 1,
    });
    expect(replay).toEqual({ ...committed, kind: "replay" });
    expect(inventory.outboxCount).toBe(1);
    expect(inventory.state).toMatchObject({ phase: "committed", sequence: 1 });
  });

  it("removes SQLite state, replay values, outbox, and alarm after tombstone durability", async () => {
    // Given: a live DO with a committed mutation and scheduled outbox alarm.
    const now = Date.now();
    const stub = env.JOURNEYS.getByName("todo9-runtime-delete");
    await stub.initialize(readyInput(now));
    await stub.transition(commitCommand(now));

    // When: the status-only D1 tombstone is durable and DO deletion completes.
    const unfencedDelete = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.deleteAfterTombstone({
          deleteRequestDigest: DIGEST_B,
          durable: true,
          replayStatus: 204,
        });
        return "resolved";
      } catch {
        return "rejected";
      }
    });
    expect(unfencedDelete).toBe("rejected");
    await expect(
      stub.beginDeletion({ deleteRequestDigest: DIGEST_B, expectedSequence: 0 }),
    ).resolves.toBe("sequence_conflict");
    await expect(
      stub.beginDeletion({ deleteRequestDigest: DIGEST_B, expectedSequence: 1 }),
    ).resolves.toBe("fenced");
    await evictDurableObject(stub);
    await expect(stub.snapshot(DIGEST_A)).resolves.toBeUndefined();
    await expect(stub.transition(commitCommand(now))).resolves.toMatchObject({
      kind: "sequence_conflict",
    });
    const wrongDelete = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.deleteAfterTombstone({
          deleteRequestDigest: DIGEST_C,
          durable: true,
          replayStatus: 204,
        });
        return "resolved";
      } catch {
        return "rejected";
      }
    });
    expect(wrongDelete).toBe("rejected");
    const response = await stub.deleteAfterTombstone({
      deleteRequestDigest: DIGEST_B,
      durable: true,
      replayStatus: 204,
    });
    const inventory = await runInDurableObject(stub, (_instance, state) => ({
      alarm: state.storage.getAlarm(),
      gate: state.storage.sql
        .exec<{ delete_request_digest: string }>(
          "SELECT delete_request_digest FROM journey_deletion_gate",
        )
        .one(),
      privateRows: state.storage.sql
        .exec<{ count: number }>(
          `SELECT
            (SELECT COUNT(*) FROM journey_state) +
            (SELECT COUNT(*) FROM journey_outbox) +
            (SELECT COUNT(*) FROM journey_inbox) AS count`,
        )
        .one().count,
    }));
    await evictDurableObject(stub);
    const wrongRetry = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.deleteAfterTombstone({
          deleteRequestDigest: DIGEST_C,
          durable: true,
          replayStatus: 204,
        });
        return "resolved";
      } catch {
        return "rejected";
      }
    });
    const exactRetry = await stub.deleteAfterTombstone({
      deleteRequestDigest: DIGEST_B,
      durable: true,
      replayStatus: 204,
    });
    const alarmRan = await runDurableObjectAlarm(stub);

    // Then: all private rows are gone, the identity gate remains, and no late alarm can run.
    expect(response).toEqual({ status: 204 });
    expect(await inventory.alarm).toBeNull();
    expect(inventory.gate).toEqual({ delete_request_digest: DIGEST_B });
    expect(inventory.privateRows).toBe(0);
    expect(wrongRetry).toBe("rejected");
    expect(exactRetry).toEqual({ status: 204 });
    expect(alarmRan).toBe(false);
  });
});
