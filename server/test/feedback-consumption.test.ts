import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionRepository } from "../src/db";
import { FeedbackRepository } from "../src/feedback/repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";
import {
  CAPABILITY_DIGEST,
  cleanupTemporaryPaths,
  JOURNEY_DIGEST,
} from "./support/feedback-deletion-fixture";

type ConsumeFeedback = (
  input: Readonly<{
    capabilityDigest: string;
    feedbackId: string;
    idempotencyDigest: string;
    now: number;
    reaction: "dislike" | "like" | "love" | "did_not_visit";
  }>,
) => Promise<Readonly<{ kind: string }>>;

function isConsumeFeedback(value: unknown): value is ConsumeFeedback {
  return typeof value === "function";
}

describe("Todo13 feedback deletion", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    cleanupTemporaryPaths(temporaryPaths);
  });

  it("consumes one consented reaction without retaining a journey identity", async () => {
    // Given: a due feedback eligibility in a fully migrated real SQLite database.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-feedback-d1-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    const todo13Migration = resolve(process.cwd(), "migrations/0003_feedback_deletion.sql");
    if (existsSync(todo13Migration)) {
      executeSql(path, readFileSync(todo13Migration, "utf8"));
    }
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0004_operations_control.sql"), "utf8"),
    );
    executeSql(
      path,
      readFileSync(
        resolve(process.cwd(), "migrations/0005_operations_epoch_extensions.sql"),
        "utf8",
      ),
    );
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0006_journey_deletion_fence.sql"), "utf8"),
    );
    const repository = new SessionRepository(new SqliteDatabase(path), 1);
    await repository.insertFeedbackEligibility({
      capability_digest: CAPABILITY_DIGEST,
      consumed_at: null,
      due_at: 3_600_001,
      eligibility_id: "eligibility_todo13_000001",
      eligibility_state: "eligible",
      expires_at: 604_800_001,
      journey_hmac_digest: JOURNEY_DIGEST,
    });

    // When: the repository is asked to atomically consume a consented reaction.
    const consume = Reflect.get(repository, "consumeFeedback");
    expect(isConsumeFeedback(consume)).toBe(true);
    if (!isConsumeFeedback(consume)) {
      return;
    }
    const result = await consume.call(repository, {
      capabilityDigest: CAPABILITY_DIGEST,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "c".repeat(64),
      now: 3_600_001,
      reaction: "love",
    });

    // Then: one minimized reaction exists and contains no journey/capability identity.
    expect(result.kind).toBe("recorded");
    expect(queryJson(path, "SELECT * FROM place_reactions")).toEqual([
      expect.not.objectContaining({
        capability_digest: expect.anything(),
        journey_hmac_digest: expect.anything(),
      }),
    ]);
  });

  it("enforces feedback due, expiry, and journey revocation with fake time", async () => {
    // Given: two capability rows scheduled from one deterministic arrival clock.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-feedback-clock-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0003_feedback_deletion.sql"), "utf8"),
    );
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0004_operations_control.sql"), "utf8"),
    );
    executeSql(
      path,
      readFileSync(
        resolve(process.cwd(), "migrations/0005_operations_epoch_extensions.sql"),
        "utf8",
      ),
    );
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0006_journey_deletion_fence.sql"), "utf8"),
    );
    const repository = new FeedbackRepository(new SqliteDatabase(path), 1);
    const arrivalAt = 1_785_283_200_000;
    const dueAt = arrivalAt + 60 * 60 * 1_000;
    const expiresAt = arrivalAt + 7 * 24 * 60 * 60 * 1_000;
    await repository.issue({
      capabilityDigest: CAPABILITY_DIGEST,
      consentGranted: true,
      dueAt,
      expiresAt,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      journeyDigest: JOURNEY_DIGEST,
    });
    await repository.issue({
      capabilityDigest: "1".repeat(64),
      consentGranted: true,
      dueAt,
      expiresAt,
      feedbackId: "fid_v1.BBBBBBBBBBBBBBBBBBBBBB",
      journeyDigest: "2".repeat(64),
    });

    // When: one capability is used early then at expiry, while the other is revoked.
    const early = await repository.consume({
      capabilityDigest: CAPABILITY_DIGEST,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "3".repeat(64),
      now: dueAt - 1,
      reaction: "like",
    });
    const expired = await repository.consume({
      capabilityDigest: CAPABILITY_DIGEST,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "3".repeat(64),
      now: expiresAt,
      reaction: "like",
    });
    await repository.revokeJourney("2".repeat(64));
    const revoked = await repository.consume({
      capabilityDigest: "1".repeat(64),
      feedbackId: "fid_v1.BBBBBBBBBBBBBBBBBBBBBB",
      idempotencyDigest: "4".repeat(64),
      now: dueAt,
      reaction: "love",
    });

    // Then: no reaction survives any unavailable eligibility state.
    expect(early).toEqual({ kind: "not_due" });
    expect(expired).toEqual({ kind: "capability_expired" });
    expect(revoked).toEqual({ kind: "capability_invalid" });
    expect(queryJson(path, "SELECT * FROM place_reactions")).toEqual([]);
  });
});
