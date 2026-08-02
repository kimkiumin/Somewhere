import { afterEach, describe, expect, it } from "vitest";
import { DeletionRepository } from "../src/deletion/repository";
import { inspectDeletionSurvivors } from "../src/privacy/inventory";
import { executeSql, queryJson } from "./d1-sqlite-fixture";
import {
  cleanupTemporaryPaths,
  JOURNEY_DIGEST,
  migratedFeedbackDeletionDatabase,
} from "./support/feedback-deletion-fixture";

describe("Todo13 feedback deletion", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    cleanupTemporaryPaths(temporaryPaths);
  });

  it("allows only the disclosed minimized deletion survivors", () => {
    // Given: the exact tombstone and audit fields disclosed by the deletion policy.
    const allowed = [
      {
        fields: [
          "journey_hmac_digest",
          "delete_request_digest",
          "terminal_type",
          "coarse_utc_bucket",
          "write_epoch",
          "replay_status",
          "expires_at",
          "replay_expires_at",
        ],
        store: "journey_tombstones",
      },
      {
        fields: [
          "audit_event_id",
          "actor_role",
          "action_code",
          "result_code",
          "policy_digest",
          "deploy_digest",
          "occurred_at",
          "expires_at",
        ],
        store: "audit_events",
      },
    ] as const;

    // When: the privacy inventory inspects an allowed and a leaking inventory.
    const disclosed = inspectDeletionSurvivors(allowed);
    const leaking = inspectDeletionSurvivors([
      ...allowed,
      { fields: ["journey_id"], store: "place_reactions" },
    ]);

    // Then: recovery histories are disclosed and an identity leak is rejected.
    expect(disclosed).toEqual({
      d1RecoveryHistoryDays: 7,
      doRecoveryHistoryDays: 30,
      violations: [],
    });
    expect(leaking.violations).toEqual(["place_reactions.journey_id"]);
  });

  it("atomically replaces an expired pending deletion intent", async () => {
    // Given: an expired intent still occupies the journey's unique row.
    const fixture = migratedFeedbackDeletionDatabase(temporaryPaths, "somewhere-delete-expired-");
    const { database, path } = fixture;
    const now = 1_785_283_200_000;
    await database
      .prepare(
        "INSERT INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      )
      .bind(
        JOURNEY_DIGEST,
        "c".repeat(64),
        "d".repeat(64),
        "audit_v1.expired_intent_000000",
        now - 48 * 60 * 60 * 1_000,
        now,
      )
      .run();

    // When: a fresh deletion request is prepared after the prior intent expired.
    const intent = await new DeletionRepository(database).prepare({
      deleteRequestDigest: "e".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now,
      sessionBindingDigest: "f".repeat(64),
    });

    // Then: the expired row is removed and exactly one fresh durable intent remains.
    expect(intent).toMatchObject({
      delete_request_digest: "e".repeat(64),
      expires_at: now + 48 * 60 * 60 * 1_000,
      journey_hmac_digest: JOURNEY_DIGEST,
      requested_at: now,
      session_binding_digest: "f".repeat(64),
      stage: "pending",
    });
    expect(queryJson(path, "SELECT * FROM pending_delete_intents")).toEqual([
      expect.objectContaining({
        audit_event_id: intent.audit_event_id,
        delete_request_digest: "e".repeat(64),
        journey_hmac_digest: JOURNEY_DIGEST,
      }),
    ]);
  });

  it("keeps an expired progressed deletion resumable", async () => {
    // Given: object deletion completed but the remaining D1 cleanup outlived its intent window.
    const fixture = migratedFeedbackDeletionDatabase(
      temporaryPaths,
      "somewhere-delete-progressed-",
    );
    const { database } = fixture;
    const now = 1_785_283_200_000;
    await database
      .prepare(
        "INSERT INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 'object-deleted', ?, ?)",
      )
      .bind(
        JOURNEY_DIGEST,
        "c".repeat(64),
        "d".repeat(64),
        "audit_v1.progressed_intent_000",
        now - 48 * 60 * 60 * 1_000,
        now,
      )
      .run();

    // When: the deletion endpoint looks for work that must resume.
    const intent = await new DeletionRepository(database).find(JOURNEY_DIGEST, now);

    // Then: expiry cannot hide a saga after its durable side effects began.
    expect(intent).toMatchObject({
      delete_request_digest: "c".repeat(64),
      journey_hmac_digest: JOURNEY_DIGEST,
      stage: "object-deleted",
    });
  });

  it("rejects an expired worker advancing or deleting its replacement intent", async () => {
    // Given: a worker retains an expired intent while a fresh request replaces its pending row.
    const fixture = migratedFeedbackDeletionDatabase(temporaryPaths, "somewhere-delete-cas-");
    const repository = new DeletionRepository(fixture.database);
    const now = 1_785_283_200_000;
    const expired = await repository.prepare({
      deleteRequestDigest: "c".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now,
      sessionBindingDigest: "d".repeat(64),
    });
    executeSql(
      fixture.path,
      `UPDATE pending_delete_intents SET expected_sequence = NULL, expires_at = ${now + 1}
       WHERE audit_event_id = '${expired.audit_event_id}'`,
    );
    const replacement = await repository.prepare({
      deleteRequestDigest: "e".repeat(64),
      expectedSequence: 2,
      journeyDigest: JOURNEY_DIGEST,
      now: now + 1,
      sessionBindingDigest: "f".repeat(64),
    });

    // When: the expired worker resumes its stage transition and completion.
    const staleTombstoneResult = await repository.writeTombstone(expired, 1, now + 1).then(
      () => "resolved",
      () => "rejected",
    );
    await repository.advance(replacement, "fenced");
    const replacementTombstoneResult = await repository
      .writeTombstone(replacement, 1, now + 1)
      .then(
        () => "resolved",
        () => "rejected",
      );
    const replacementTombstoneRetryResult = await repository
      .writeTombstone(replacement, 1, now + 60_001)
      .then(
        () => "resolved",
        () => "rejected",
      );
    const wrongStageResult = await repository.advance(replacement, "object-deleted").then(
      () => "resolved",
      () => "rejected",
    );
    const advanceResult = await repository.advance(expired, "tombstoned").then(
      () => "resolved",
      () => "rejected",
    );
    const completeResult = await repository.complete(expired).then(
      () => "resolved",
      () => "rejected",
    );

    // Then: both stale mutations fail and the replacement remains fenced.
    expect({
      advanceResult,
      completeResult,
      replacementTombstoneResult,
      replacementTombstoneRetryResult,
      staleTombstoneResult,
      tombstones: queryJson(
        fixture.path,
        "SELECT delete_request_digest FROM journey_tombstones WHERE journey_hmac_digest = '" +
          JOURNEY_DIGEST +
          "'",
      ),
      wrongStageResult,
      rows: queryJson(
        fixture.path,
        "SELECT audit_event_id, delete_request_digest, stage FROM pending_delete_intents",
      ),
    }).toEqual({
      advanceResult: "rejected",
      completeResult: "rejected",
      replacementTombstoneResult: "resolved",
      replacementTombstoneRetryResult: "resolved",
      staleTombstoneResult: "rejected",
      tombstones: [{ delete_request_digest: replacement.delete_request_digest }],
      wrongStageResult: "rejected",
      rows: [
        {
          audit_event_id: replacement.audit_event_id,
          delete_request_digest: replacement.delete_request_digest,
          stage: "fenced",
        },
      ],
    });
  });
});
