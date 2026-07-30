import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeletionRepository } from "../src/deletion/repository";
import { runDeletionSaga } from "../src/deletion/saga";
import { executeSql } from "./d1-sqlite-fixture";
import {
  DELETE_DIGEST,
  JOURNEY_DIGEST,
  migratedDatabase,
  NOW,
  SESSION_DIGEST,
} from "./support/deletion-fence-fixture";

describe("journey deletion fence", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("migrates legacy intents with a nullable sequence and persists new sequences", async () => {
    const fixture = migratedDatabase(temporaryPaths, false);
    await fixture.database
      .prepare(
        "INSERT INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      )
      .bind(
        JOURNEY_DIGEST,
        DELETE_DIGEST,
        SESSION_DIGEST,
        "audit_v1.legacy_pending_0000",
        NOW,
        NOW + 1,
      )
      .run();

    executeSql(
      fixture.path,
      readFileSync(resolve(process.cwd(), "migrations/0006_journey_deletion_fence.sql"), "utf8"),
    );
    const repository = new DeletionRepository(fixture.database);
    const legacy = await repository.find(JOURNEY_DIGEST, NOW);
    const replacement = await repository.prepare({
      deleteRequestDigest: "f".repeat(64),
      expectedSequence: 7,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW + 1,
      sessionBindingDigest: SESSION_DIGEST,
    });

    expect(legacy).toMatchObject({ expected_sequence: null, stage: "pending" });
    expect(replacement).toMatchObject({ expected_sequence: 7, stage: "pending" });
  });

  it("fences the Durable Object before writing the tombstone", async () => {
    const calls: string[] = [];
    let stage: "pending" | "fenced" | "tombstoned" | "object-deleted" | "cleaned" = "pending";
    const result = await runDeletionSaga({
      advance: async (next) => {
        calls.push(`advance:${next}`);
        stage = next;
      },
      beginDeletion: async () => {
        calls.push("begin-deletion");
        return "fenced";
      },
      cleanupBindings: async () => undefined,
      complete: async () => undefined,
      deleteObject: async () => undefined,
      inventory: async () => [],
      loadStage: async () => stage,
      finalizeCompletion: async () => {
        calls.push("finalize");
      },
      writeTombstone: async () => {
        calls.push("tombstone");
      },
    });

    expect(result).toEqual({ kind: "complete" });
    expect(calls.slice(0, 4)).toEqual([
      "begin-deletion",
      "advance:fenced",
      "tombstone",
      "advance:tombstoned",
    ]);
  });

  it("returns a sequence conflict before any tombstone side effect", async () => {
    let tombstoneWrites = 0;
    const result = await runDeletionSaga({
      advance: async () => undefined,
      beginDeletion: async () => "sequence_conflict",
      cleanupBindings: async () => undefined,
      complete: async () => undefined,
      deleteObject: async () => undefined,
      inventory: async () => [],
      loadStage: async () => "pending",
      finalizeCompletion: async () => undefined,
      writeTombstone: async () => {
        tombstoneWrites += 1;
      },
    });

    expect(result).toEqual({ kind: "sequence-conflict" });
    expect(tombstoneWrites).toBe(0);
  });
});
