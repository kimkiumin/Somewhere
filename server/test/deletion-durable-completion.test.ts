import { afterEach, describe, expect, it } from "vitest";
import { SessionRepository } from "../src/db";
import { DeletionRepository } from "../src/deletion/repository";
import { runDeletionSaga } from "../src/deletion/saga";
import { queryJson } from "./d1-sqlite-fixture";
import {
  CAPABILITY_DIGEST,
  cleanupTemporaryPaths,
  JOURNEY_DIGEST,
  migratedFeedbackDeletionDatabase,
} from "./support/feedback-deletion-fixture";

describe("Todo13 feedback deletion", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    cleanupTemporaryPaths(temporaryPaths);
  });

  it("completes a durable deletion only after bindings and pending intent are gone", async () => {
    // Given: a real migrated database with journey-bound guard and feedback rows.
    const fixture = migratedFeedbackDeletionDatabase(temporaryPaths, "somewhere-delete-d1-");
    const { database, path } = fixture;
    const now = 1_785_283_200_000;
    const sessionBindingDigest = "d".repeat(64);
    await new SessionRepository(database, 1).putGuard({
      active_journey_digest: JOURNEY_DIGEST,
      create_request_digest: "e".repeat(64),
      expires_at: now + 86_400_000,
      guard_version: 1,
      last_stopped_at: null,
      previous_candidate_digest: null,
      recovery_capability_digest: null,
      recovery_consumed_at: null,
      session_binding_digest: sessionBindingDigest,
    });
    await database
      .prepare(
        "INSERT INTO feedback_eligibility (eligibility_id, journey_hmac_digest, capability_digest, eligibility_state, due_at, expires_at, consumed_at, feedback_id, prompt_version, consent_granted, consumption_digest) VALUES (?, ?, ?, 'eligible', ?, ?, NULL, ?, 'feedback-prompt-v1', 1, NULL)",
      )
      .bind(
        "eligibility_todo13_delete",
        JOURNEY_DIGEST,
        CAPABILITY_DIGEST,
        now,
        now + 86_400_000,
        "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      )
      .run();
    const repository = new DeletionRepository(database);
    const intent = await repository.prepare({
      deleteRequestDigest: "f".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now,
      sessionBindingDigest,
    });

    // When: the persisted saga deletes the object and completes its cleanup.
    let objectDeletes = 0;
    const result = await runDeletionSaga({
      advance: (stage) => repository.advance(intent, stage),
      beginDeletion: async () => "fenced",
      cleanupBindings: () => repository.cleanupBindings(intent),
      complete: () => repository.complete(intent),
      deleteObject: async () => {
        objectDeletes += 1;
      },
      inventory: () => repository.inventory(intent),
      loadStage: async () => intent.stage,
      finalizeCompletion: () => repository.finalizeCompletion(intent, 1, now),
      writeTombstone: () => repository.writeTombstone(intent, 1, now),
    });

    // Then: 204 eligibility conditions exist with only the disclosed survivors.
    expect(result).toEqual({ kind: "complete" });
    expect(objectDeletes).toBe(1);
    expect(queryJson(path, "SELECT * FROM pending_delete_intents")).toEqual([]);
    expect(queryJson(path, "SELECT * FROM feedback_eligibility")).toEqual([]);
    expect(queryJson(path, "SELECT * FROM browser_session_guards")).toEqual([]);
    expect(
      queryJson(
        path,
        "SELECT delete_request_digest, expires_at, replay_expires_at, write_epoch FROM journey_tombstones",
      ),
    ).toEqual([
      {
        delete_request_digest: "f".repeat(64),
        expires_at: now + 48 * 60 * 60 * 1_000,
        replay_expires_at: now + 24 * 60 * 60 * 1_000,
        write_epoch: 1,
      },
    ]);
    expect(
      queryJson(
        path,
        "SELECT action_code, result_code, expires_at FROM audit_events WHERE action_code = 'journey-delete'",
      ),
    ).toEqual([
      {
        action_code: "journey-delete",
        expires_at: now + 7 * 24 * 60 * 60 * 1_000,
        result_code: "complete",
      },
    ]);
  });
});
