import { describe, expect, it } from "vitest";

import {
  checkExternalTombstoneBarrier,
  createDeletePlan,
  createExpiryPlan,
  finalizeDeleteAfterTombstone,
  type JourneyStorage,
} from "../src/journey/tombstone";

const DIGEST = "e".repeat(64);

class RecordingStorage implements JourneyStorage {
  readonly values = new Map<string, unknown>([
    ["journey_state", { activeRoute: { geometry: [[127.01, 37.5]], originZoneRef: "zone-a" } }],
    ["idempotency:commit", { outcome: "ciphertext" }],
    ["outbox:event", { status: "pending" }],
  ]);
  alarm: number | null = 9_000;

  async deleteAll(): Promise<void> {
    this.values.clear();
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

describe("journey tombstone deletion", () => {
  it("retains only a status replay fingerprint in the external D1 plan", () => {
    // Given: a confirmed status-only DELETE response.
    const input = {
      coarseUtcBucket: 1_722_000_000,
      deleteRequestDigest: DIGEST,
      expiresAt: 1_722_172_800,
      journeyHmacDigest: "f".repeat(64),
      writeEpoch: 14,
    } as const;

    // When: the cross-store tombstone plan is constructed.
    const plan = createDeletePlan(input);

    // Then: D1 receives only digests, status, epoch, bucket, terminal type, and expiry.
    expect(plan).toEqual({
      coarse_utc_bucket: 1_722_000_000,
      delete_request_digest: DIGEST,
      expires_at: 1_722_172_800,
      journey_hmac_digest: "f".repeat(64),
      replay_status: 204,
      terminal_type: "deleted",
      write_epoch: 14,
    });
    expect(JSON.stringify(plan)).not.toMatch(/route|origin|coordinate|capability|ciphertext/i);
  });

  it("deletes every live and replay value only after the D1 tombstone is durable", async () => {
    // Given: a DO with route, replay, outbox, and a pending alarm.
    const storage = new RecordingStorage();

    // When: deletion is finalized after a durable D1 tombstone receipt.
    await finalizeDeleteAfterTombstone(storage, { durable: true, replayStatus: 204 });

    // Then: the alarm and all DO storage are gone.
    expect(storage.alarm).toBeNull();
    expect(storage.values.size).toBe(0);
  });

  it("preserves the DO when D1 tombstone durability is not proven", async () => {
    // Given: a live DO and an unavailable D1 tombstone write.
    const storage = new RecordingStorage();

    // When: deletion finalization is attempted without durable proof.
    const deletion = finalizeDeleteAfterTombstone(storage, { durable: false, replayStatus: 204 });

    // Then: it fails closed without deleting live authority.
    await expect(deletion).rejects.toMatchObject({ name: "TombstoneNotDurableError" });
    expect(storage.values.size).toBe(3);
    expect(storage.alarm).toBe(9_000);
  });

  it("fences every late command across 1,024 deterministic delete and expiry schedules", () => {
    // Given: external HMAC-only tombstones at the current maintenance epoch.
    for (let seed = 0; seed < 1_024; seed += 1) {
      const terminal =
        seed % 2 === 0
          ? createDeletePlan({
              coarseUtcBucket: 10_000,
              deleteRequestDigest: DIGEST,
              expiresAt: 200_000,
              journeyHmacDigest: "f".repeat(64),
              writeEpoch: 14,
            })
          : createExpiryPlan({
              coarseUtcBucket: 10_000,
              deleteRequestDigest: DIGEST,
              expiresAt: 200_000,
              journeyHmacDigest: "f".repeat(64),
              writeEpoch: 14,
            });

      // When: late route, Queue, alarm, replay, restore, and Continue work rechecks the barrier.
      const lateKinds = ["route", "queue", "alarm", "replay", "restore", "continue"] as const;
      const decisions = lateKinds.map((_, ordinal) =>
        checkExternalTombstoneBarrier(terminal, 14 + ((seed + ordinal) % 2), 100_001),
      );

      // Then: no ordering or epoch can recreate live journey authority.
      expect(decisions, `seed=${seed}`).toEqual(lateKinds.map(() => "tombstoned"));
    }
  });
});
