import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeletionRepository } from "../src/deletion/repository";
import { runDeletionSaga } from "../src/deletion/saga";
import { queryJson } from "./d1-sqlite-fixture";
import {
  cleanupTemporaryPaths,
  JOURNEY_DIGEST,
  migratedFeedbackDeletionDatabase,
} from "./support/feedback-deletion-fixture";

describe("Todo13 feedback deletion retention", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    cleanupTemporaryPaths(temporaryPaths);
  });

  it("keeps SQL numeric literals compatible with the hosted SQLite parser", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/deletion/cleanup-repository.ts"),
      "utf8",
    );
    const bucketExpression = source.match(
      /CAST\(audit\.occurred_at \/ [^ ]+ AS INTEGER\) \* [^,\n]+/u,
    )?.[0];

    expect(bucketExpression).toBe("CAST(audit.occurred_at / 3600000 AS INTEGER) * 3600000");
  });

  it("anchors a resumed tombstone's retention at its successful write time", async () => {
    // Given: a fenced intent whose original request age exceeds tombstone retention.
    const fixture = migratedFeedbackDeletionDatabase(
      temporaryPaths,
      "somewhere-delete-resumed-tombstone-",
    );
    const repository = new DeletionRepository(fixture.database);
    const requestedAt = 1_785_283_200_000;
    const resumedAt = requestedAt + 48 * 60 * 60 * 1_000 + 1;
    const intent = await repository.prepare({
      deleteRequestDigest: "c".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now: requestedAt,
      sessionBindingDigest: "d".repeat(64),
    });
    await repository.advance(intent, "fenced");

    // When: deletion resumes and writes its first durable tombstone.
    await repository.writeTombstone(intent, 1, resumedAt);
    await repository.advance(intent, "tombstoned");
    const liveRetry = await repository.writeTombstone(intent, 1, resumedAt + 60_000).then(
      () => "resolved",
      () => "rejected",
    );
    const changedEpoch = await repository.writeTombstone(intent, 2, resumedAt + 60_000).then(
      () => "resolved",
      () => "rejected",
    );

    // Then: the active tombstone blocks recreation and preserves the 204 replay window.
    expect({
      changedEpoch,
      liveRetry,
      activeBarrier: queryJson(
        fixture.path,
        `SELECT journey_hmac_digest FROM journey_tombstones
         WHERE journey_hmac_digest = '${JOURNEY_DIGEST}' AND expires_at > ${resumedAt}`,
      ),
      replay: queryJson(
        fixture.path,
        `SELECT delete_request_digest, replay_expires_at FROM journey_tombstones
         WHERE journey_hmac_digest = '${JOURNEY_DIGEST}'
           AND expires_at > ${resumedAt} AND replay_expires_at > ${resumedAt}`,
      ),
      tombstones: queryJson(
        fixture.path,
        "SELECT expires_at, replay_expires_at FROM journey_tombstones",
      ),
    }).toEqual({
      changedEpoch: "rejected",
      liveRetry: "resolved",
      activeBarrier: [{ journey_hmac_digest: JOURNEY_DIGEST }],
      replay: [
        {
          delete_request_digest: intent.delete_request_digest,
          replay_expires_at: resumedAt + 24 * 60 * 60 * 1_000,
        },
      ],
      tombstones: [
        {
          expires_at: resumedAt + 48 * 60 * 60 * 1_000,
          replay_expires_at: resumedAt + 24 * 60 * 60 * 1_000,
        },
      ],
    });
  });

  it("keeps completion replay retention anchored to the first audit timestamp", async () => {
    const fixture = migratedFeedbackDeletionDatabase(
      temporaryPaths,
      "somewhere-delete-completion-anchor-",
    );
    const repository = new DeletionRepository(fixture.database);
    const requestedAt = 1_785_283_200_000;
    const firstCompletionAt = requestedAt + 48 * 60 * 60 * 1_000 + 1;
    const intent = await repository.prepare({
      deleteRequestDigest: "c".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now: requestedAt,
      sessionBindingDigest: "d".repeat(64),
    });
    await repository.advance(intent, "fenced");
    await repository.writeTombstone(intent, 1, requestedAt);
    await repository.advance(intent, "tombstoned");
    await repository.advance(intent, "object-deleted");
    await repository.advance(intent, "cleaned");

    let completionAt = firstCompletionAt;
    let completionAttempts = 0;
    const ports = {
      advance: async () => undefined,
      beginDeletion: async () => "fenced" as const,
      cleanupBindings: async () => undefined,
      complete: async () => {
        completionAttempts += 1;
        if (completionAttempts === 1) {
          throw new Error("synthetic completion outage");
        }
        await repository.complete(intent);
      },
      deleteObject: async () => undefined,
      finalizeCompletion: () => repository.finalizeCompletion(intent, 1, completionAt),
      inventory: async () => [],
      loadStage: async () => "cleaned" as const,
      writeTombstone: async () => undefined,
    };
    const first = await runDeletionSaga(ports);
    completionAt += 24 * 60 * 60 * 1_000 + 1;
    const retry = await runDeletionSaga(ports);

    expect({
      audit: queryJson(
        fixture.path,
        `SELECT occurred_at FROM audit_events WHERE audit_event_id = '${intent.audit_event_id}'`,
      ),
      tombstones: queryJson(
        fixture.path,
        "SELECT expires_at, replay_expires_at FROM journey_tombstones",
      ),
      first,
      retry,
    }).toEqual({
      audit: [{ occurred_at: firstCompletionAt }],
      tombstones: [
        {
          expires_at: firstCompletionAt + 48 * 60 * 60 * 1_000,
          replay_expires_at: firstCompletionAt + 24 * 60 * 60 * 1_000,
        },
      ],
      first: { kind: "incomplete", stage: "cleaned" },
      retry: { kind: "complete" },
    });
  });

  it("rejects a conflicting cleaned finalizer without recording an audit", async () => {
    const fixture = migratedFeedbackDeletionDatabase(
      temporaryPaths,
      "somewhere-delete-finalizer-cas-",
    );
    const repository = new DeletionRepository(fixture.database);
    const now = 1_785_283_200_000;
    const intent = await repository.prepare({
      deleteRequestDigest: "c".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now,
      sessionBindingDigest: "d".repeat(64),
    });
    await repository.advance(intent, "fenced");
    await repository.writeTombstone(intent, 1, now);
    await repository.advance(intent, "tombstoned");
    await repository.advance(intent, "object-deleted");
    await repository.advance(intent, "cleaned");

    const finalizer = await repository.finalizeCompletion(intent, 2, now).then(
      () => "resolved",
      () => "rejected",
    );

    expect({
      audit: queryJson(
        fixture.path,
        `SELECT audit_event_id FROM audit_events WHERE audit_event_id = '${intent.audit_event_id}'`,
      ),
      finalizer,
    }).toEqual({ audit: [], finalizer: "rejected" });
  });
});
