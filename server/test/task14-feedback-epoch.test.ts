import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, PreparedQuery } from "../src/db/database";
import { FeedbackRepository } from "../src/feedback/repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const temporaryPaths: string[] = [];
const CAPABILITY = "a".repeat(64);

describe("Task 14 feedback write epoch", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("atomically rejects stale feedback writes and receipts while current epoch succeeds", async () => {
    // Given: feedback eligibility is issued under the current production fence epoch.
    const fixture = migratedDatabase();
    const staleRepository = new FeedbackRepository(fixture.database, 4);
    await staleRepository.issue({
      capabilityDigest: CAPABILITY,
      consentGranted: true,
      dueAt: 10,
      expiresAt: 1_000,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      journeyDigest: "b".repeat(64),
    });
    executeSql(
      fixture.path,
      "UPDATE operations_write_fence SET write_epoch = 5 WHERE environment = 'production'",
    );
    const current = new FeedbackRepository(fixture.database, 5);

    // When: an old writer attempts consumption before the current writer retries it.
    const stale = staleRepository.consume({
      capabilityDigest: CAPABILITY,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "c".repeat(64),
      now: 11,
      reaction: "love",
      requestDigest: "d".repeat(64),
    });
    await expect(stale).rejects.toThrow(/stale feedback write epoch/u);
    const afterStale = {
      outcomes: queryJson(fixture.path, "SELECT * FROM feedback_reaction_outcomes"),
      reactions: queryJson(fixture.path, "SELECT * FROM place_reactions"),
      state: queryJson(
        fixture.path,
        "SELECT eligibility_state, write_epoch FROM feedback_eligibility",
      ),
    };
    const recorded = await current.consume({
      capabilityDigest: CAPABILITY,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "c".repeat(64),
      now: 11,
      reaction: "love",
      requestDigest: "d".repeat(64),
    });

    // Then: stale failure rolls back fully and all committed feedback records carry epoch five.
    expect(afterStale).toEqual({
      outcomes: [],
      reactions: [],
      state: [{ eligibility_state: "eligible", write_epoch: 4 }],
    });
    expect(recorded).toEqual({
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      kind: "recorded",
    });
    expect(
      queryJson(
        fixture.path,
        `SELECT
           eligibility.write_epoch AS eligibility_epoch,
           outcome.write_epoch AS outcome_epoch,
           reaction.write_epoch AS reaction_epoch
         FROM feedback_eligibility AS eligibility
         JOIN feedback_reaction_outcomes AS outcome
           ON outcome.capability_digest = eligibility.capability_digest
         JOIN place_reactions AS reaction
           ON reaction.reaction_id = 'reaction:${"c".repeat(48)}'`,
      ),
    ).toEqual([{ eligibility_epoch: 5, outcome_epoch: 5, reaction_epoch: 5 }]);
  });

  it("rechecks the current OPEN fence inside the feedback batch", async () => {
    // Given: epoch four is authorized and a due capability exists before the fence changes.
    const fixture = migratedDatabase();
    const current = new FeedbackRepository(fixture.database, 4);
    await current.issue({
      capabilityDigest: CAPABILITY,
      consentGranted: true,
      dueAt: 10,
      expiresAt: 1_000,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      journeyDigest: "b".repeat(64),
    });
    const raced = new FeedbackRepository(fenceFlippingDatabase(fixture), 4);

    // When: the write fence changes to epoch five after reads but before D1 batch execution.
    const consumption = raced.consume({
      capabilityDigest: CAPABILITY,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "c".repeat(64),
      now: 11,
      reaction: "love",
    });

    // Then: trigger-time epoch validation aborts the whole reaction transaction.
    await expect(consumption).rejects.toThrow(/stale feedback write epoch/u);
    expect(
      queryJson(fixture.path, "SELECT eligibility_state, write_epoch FROM feedback_eligibility"),
    ).toEqual([{ eligibility_state: "eligible", write_epoch: 4 }]);
    expect(queryJson(fixture.path, "SELECT * FROM place_reactions")).toEqual([]);
    expect(queryJson(fixture.path, "SELECT * FROM feedback_reaction_outcomes")).toEqual([]);
  });

  it("rejects missing, stale, future, and closed-mode write authority", async () => {
    // Given: a current epoch-four production fence and four independent capability attempts.
    const fixture = migratedDatabase();
    const inputs = [1, 3, 5].map((epoch, index) =>
      new FeedbackRepository(fixture.database, epoch).issue({
        capabilityDigest: String(index + 1).repeat(64),
        consentGranted: true,
        dueAt: 10,
        expiresAt: 1_000,
        feedbackId: `fid_v1.${String.fromCharCode(65 + index).repeat(22)}`,
        journeyDigest: String(index + 4).repeat(64),
      }),
    );

    // When: stale/future writers run, then the matching writer runs under a closed fence mode.
    for (const input of inputs) {
      await expect(input).rejects.toThrow(/stale feedback write epoch/u);
    }
    executeSql(
      fixture.path,
      "UPDATE operations_write_fence SET mode = 'ADMISSION_CLOSED' WHERE environment = 'production'",
    );
    const closed = new FeedbackRepository(fixture.database, 4).issue({
      capabilityDigest: "9".repeat(64),
      consentGranted: true,
      dueAt: 10,
      expiresAt: 1_000,
      feedbackId: "fid_v1.ZZZZZZZZZZZZZZZZZZZZZZ",
      journeyDigest: "8".repeat(64),
    });

    // Then: no unauthorized eligibility row is persisted at any epoch.
    await expect(closed).rejects.toThrow(/stale feedback write epoch/u);
    expect(queryJson(fixture.path, "SELECT * FROM feedback_eligibility")).toEqual([]);
  });

  it("converges concurrent exact-key reactions to one durable record", async () => {
    // Given: one due eligibility and two current-epoch writers with the same exact key.
    const fixture = migratedDatabase();
    const repository = new FeedbackRepository(fixture.database, 4);
    await repository.issue({
      capabilityDigest: CAPABILITY,
      consentGranted: true,
      dueAt: 10,
      expiresAt: 1_000,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      journeyDigest: "b".repeat(64),
    });
    const input = {
      capabilityDigest: CAPABILITY,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "c".repeat(64),
      now: 11,
      reaction: "love" as const,
      requestDigest: "d".repeat(64),
    };

    // When: both exact requests consume concurrently through atomic D1 batches.
    const results = await Promise.all([repository.consume(input), repository.consume(input)]);

    // Then: both converge successfully while only one minimized reaction and outcome exist.
    expect(results.every((result) => result.kind === "recorded" || result.kind === "replay")).toBe(
      true,
    );
    expect(queryJson(fixture.path, "SELECT COUNT(*) AS count FROM place_reactions")).toEqual([
      { count: 1 },
    ]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM feedback_reaction_outcomes"),
    ).toEqual([{ count: 1 }]);
  });
});

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-feedback-epoch-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
    "0005_operations_epoch_extensions.sql",
  ]) {
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations", migration), "utf8"));
  }
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
      'production', 4, 'OPEN', 'feedback-test', '${"e".repeat(64)}', 1, NULL
    );`,
  );
  return { database: new SqliteDatabase(path), path };
}

function fenceFlippingDatabase(
  fixture: Readonly<{ database: SqliteDatabase; path: string }>,
): Database {
  let flipped = false;
  return {
    batch: async (statements: readonly PreparedQuery[]) => {
      if (!flipped) {
        flipped = true;
        executeSql(
          fixture.path,
          "UPDATE operations_write_fence SET write_epoch = 5 WHERE environment = 'production'",
        );
      }
      return fixture.database.batch(statements);
    },
    prepare: (query: string) => fixture.database.prepare(query),
  };
}
