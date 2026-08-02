import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearGuard,
  consumeRecoveryDigest,
  findDeleteReplay,
  findDeleteReplayWindow,
  findGuard,
  markJourneyStopped,
  storeRecoveryDigest,
  writeDeleteTombstone,
} from "../src/api/journey-persistence";
import { executeSql, SqliteDatabase } from "./d1-sqlite-fixture";

const BINDING_DIGEST = "a".repeat(64);
const JOURNEY_DIGEST = "b".repeat(64);
const CREATE_DIGEST = "c".repeat(64);
const CANDIDATE_DIGEST = "d".repeat(64);
const RECOVERY_DIGEST = "e".repeat(64);
const DELETE_DIGEST = "f".repeat(64);
const NOW = 1_785_283_200_000;

describe("journey persistence guards", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("finds and clears only a live guard", async () => {
    // Given: one live guard and one guard expired against the wall clock.
    const database = migratedDatabase(temporaryPaths);
    await insertGuard(database, {
      activeJourneyDigest: JOURNEY_DIGEST,
      bindingDigest: BINDING_DIGEST,
      expiresAt: Date.now() + 86_400_000,
    });
    await insertGuard(database, {
      activeJourneyDigest: JOURNEY_DIGEST,
      bindingDigest: "1".repeat(64),
      expiresAt: 1,
    });

    // When: both guards are read and the live journey binding is cleared.
    const live = await findGuard(database, BINDING_DIGEST);
    const expired = await findGuard(database, "1".repeat(64));
    await clearGuard(database, BINDING_DIGEST, JOURNEY_DIGEST);
    const cleared = await findGuard(database, BINDING_DIGEST);

    // Then: expiry hides the stale row and clearing removes only active journey authority.
    expect(live).toMatchObject({ active_journey_digest: JOURNEY_DIGEST, guard_version: 1 });
    expect(expired).toBeUndefined();
    expect(cleared).toMatchObject({
      active_journey_digest: null,
      create_request_digest: null,
      guard_version: 2,
    });
  });

  it("transitions an active guard to stopped and stores a recovery digest", async () => {
    // Given: a live guard bound to an active journey.
    const database = migratedDatabase(temporaryPaths);
    await insertGuard(database, {
      activeJourneyDigest: JOURNEY_DIGEST,
      bindingDigest: BINDING_DIGEST,
      expiresAt: Date.now() + 86_400_000,
    });

    // When: the journey stops and a recovery capability is stored.
    const stopped = await markJourneyStopped({
      bindingDigest: BINDING_DIGEST,
      database,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      previousCandidateDigest: CANDIDATE_DIGEST,
    });
    const stored = await storeRecoveryDigest({
      bindingDigest: BINDING_DIGEST,
      database,
      digest: RECOVERY_DIGEST,
      issuedAt: NOW + 1,
    });
    const guard = await findGuard(database, BINDING_DIGEST);

    // Then: active authority is gone and the stopped guard holds the new recovery digest.
    expect(stopped).toBe(true);
    expect(stored).toBe(true);
    expect(guard).toMatchObject({
      active_journey_digest: null,
      guard_version: 3,
      last_stopped_at: NOW + 1,
      previous_candidate_digest: CANDIDATE_DIGEST,
      recovery_capability_digest: RECOVERY_DIGEST,
    });
  });

  it("consumes a recovery digest once", async () => {
    // Given: a stopped guard with an unconsumed recovery digest.
    const database = migratedDatabase(temporaryPaths);
    await insertStoppedGuard(database, RECOVERY_DIGEST);

    // When: the same capability is consumed twice.
    const first = await consumeRecoveryDigest({
      bindingDigest: BINDING_DIGEST,
      database,
      digest: RECOVERY_DIGEST,
      now: NOW + 1,
    });
    const replay = await consumeRecoveryDigest({
      bindingDigest: BINDING_DIGEST,
      database,
      digest: RECOVERY_DIGEST,
      now: NOW + 2,
    });

    // Then: only the first consumption acquires authority.
    expect(first).toBe(true);
    expect(replay).toBe(false);
  });

  it("rejects an expired recovery digest", async () => {
    // Given: a stopped guard whose recovery window has elapsed.
    const database = migratedDatabase(temporaryPaths);
    await insertStoppedGuard(database, RECOVERY_DIGEST);

    // When: consumption occurs beyond the two-minute recovery window.
    const consumed = await consumeRecoveryDigest({
      bindingDigest: BINDING_DIGEST,
      database,
      digest: RECOVERY_DIGEST,
      now: NOW + 120_001,
    });
    const guard = await findGuard(database, BINDING_DIGEST);

    // Then: the capability stays unconsumed.
    expect(consumed).toBe(false);
    expect(guard?.recovery_consumed_at).toBeNull();
  });

  it.each(["pending-delete", "tombstone"] as const)(
    "keeps active authority when a %s fence exists",
    async (fence) => {
      // Given: an active journey with a durable deletion fence.
      const database = migratedDatabase(temporaryPaths);
      await insertGuard(database, {
        activeJourneyDigest: JOURNEY_DIGEST,
        bindingDigest: BINDING_DIGEST,
        expiresAt: Date.now() + 86_400_000,
      });
      await insertDeletionFence(database, fence);

      // When: stopped-state persistence arrives after the deletion fence.
      const stopped = await markJourneyStopped({
        bindingDigest: BINDING_DIGEST,
        database,
        journeyDigest: JOURNEY_DIGEST,
        now: NOW,
        previousCandidateDigest: CANDIDATE_DIGEST,
      });
      const guard = await findGuard(database, BINDING_DIGEST);

      // Then: the late mutation is rejected without changing the active guard.
      expect(stopped).toBe(false);
      expect(guard).toMatchObject({ active_journey_digest: JOURNEY_DIGEST, guard_version: 1 });
    },
  );

  it("returns tombstone replay metadata only inside retention", async () => {
    // Given: an empty migrated tombstone store.
    const database = migratedDatabase(temporaryPaths);

    // When: a tombstone is written and queried before and after retention.
    await writeDeleteTombstone({
      database,
      deleteRequestDigest: DELETE_DIGEST,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      writeEpoch: 4,
    });
    const replay = await findDeleteReplay(database, JOURNEY_DIGEST, NOW);
    const window = await findDeleteReplayWindow(database, JOURNEY_DIGEST, NOW);
    const expired = await findDeleteReplay(database, JOURNEY_DIGEST, NOW + 172_800_000);

    // Then: exact replay metadata is visible only while the tombstone is retained.
    expect(replay).toBe(DELETE_DIGEST);
    expect(window).toEqual({ deleteRequestDigest: DELETE_DIGEST, replayExpiresAt: 1 });
    expect(expired).toBeUndefined();
  });
});

type GuardInput = Readonly<{
  activeJourneyDigest: string | null;
  bindingDigest: string;
  expiresAt: number;
}>;

async function insertGuard(database: D1Database, input: GuardInput): Promise<void> {
  await database
    .prepare(
      "INSERT INTO browser_session_guards (session_binding_digest, guard_version, active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at, expires_at) VALUES (?, 1, ?, ?, NULL, NULL, NULL, NULL, ?)",
    )
    .bind(input.bindingDigest, input.activeJourneyDigest, CREATE_DIGEST, input.expiresAt)
    .run();
}

async function insertStoppedGuard(database: D1Database, recoveryDigest: string): Promise<void> {
  await database
    .prepare(
      "INSERT INTO browser_session_guards (session_binding_digest, guard_version, active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at, expires_at) VALUES (?, 1, NULL, NULL, ?, ?, NULL, ?, ?)",
    )
    .bind(BINDING_DIGEST, CANDIDATE_DIGEST, recoveryDigest, NOW, Date.now() + 86_400_000)
    .run();
}

async function insertDeletionFence(
  database: D1Database,
  fence: "pending-delete" | "tombstone",
): Promise<void> {
  if (fence === "tombstone") {
    await writeDeleteTombstone({
      database,
      deleteRequestDigest: DELETE_DIGEST,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      writeEpoch: 4,
    });
    return;
  }
  await database
    .prepare(
      "INSERT INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, expected_sequence, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)",
    )
    .bind(
      JOURNEY_DIGEST,
      DELETE_DIGEST,
      BINDING_DIGEST,
      "audit_guard_characterization",
      NOW,
      NOW + 86_400_000,
    )
    .run();
}

function migratedDatabase(temporaryPaths: string[]): D1Database {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-journey-guard-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
    "0005_operations_epoch_extensions.sql",
    "0006_journey_deletion_fence.sql",
  ]) {
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations", migration), "utf8"));
  }
  return new SqliteDatabase(path) as unknown as D1Database;
}
