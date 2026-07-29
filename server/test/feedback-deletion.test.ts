import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionRepository } from "../src/db";
import { DeletionRepository } from "../src/deletion/repository";
import { type DeletionSagaPorts, runDeletionSaga } from "../src/deletion/saga";
import { FeedbackRepository } from "../src/feedback/repository";
import { inspectDeletionSurvivors } from "../src/privacy/inventory";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const CAPABILITY_DIGEST = "a".repeat(64);
const JOURNEY_DIGEST = "b".repeat(64);

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
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
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

  it("runs the real D1 feedback boundary in workerd", async () => {
    // Given: the dedicated Todo13 Workers-runtime configuration.
    const child = spawn(
      "bunx",
      ["vitest", "run", "--config", "test/feedback-deletion-runtime.vitest.config.ts"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();

    // When: the isolated runtime suite executes.
    const exitCodePromise = new Promise<number>((resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("exit", (code) => resolveExit(code ?? 255));
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      exitCodePromise,
      stderrPromise,
      stdoutPromise,
    ]);

    // Then: the real HTTP/D1 scenario must pass.
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
  }, 30_000);

  it("resumes an incomplete delete without repeating a durable tombstone", async () => {
    // Given: a persisted saga whose first Durable Object deletion attempt fails.
    let stage: "pending" | "tombstoned" | "object-deleted" | "cleaned" = "pending";
    let deleteAttempts = 0;
    let tombstoneWrites = 0;
    const ports: DeletionSagaPorts = {
      advance: async (nextStage) => {
        stage = nextStage;
      },
      appendAudit: async () => undefined,
      cleanupBindings: async () => undefined,
      complete: async () => undefined,
      deleteObject: async () => {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          throw new Error("synthetic object outage");
        }
      },
      inventory: async () => [],
      loadStage: async () => stage,
      writeTombstone: async () => {
        tombstoneWrites += 1;
      },
    };

    // When: the same deletion intent is retried after the incomplete object step.
    const first = await runDeletionSaga(ports);
    const second = await runDeletionSaga(ports);

    // Then: the first result is retryable and the retry resumes after the durable tombstone.
    expect(first).toEqual({ kind: "incomplete", stage: "tombstoned" });
    expect(second).toEqual({ kind: "complete" });
    expect(tombstoneWrites).toBe(1);
    expect(deleteAttempts).toBe(2);
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

  it("completes a durable deletion only after bindings and pending intent are gone", async () => {
    // Given: a real migrated database with journey-bound guard and feedback rows.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-delete-d1-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0003_feedback_deletion.sql"), "utf8"),
    );
    const database = new SqliteDatabase(path);
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
      journeyDigest: JOURNEY_DIGEST,
      now,
      sessionBindingDigest,
    });

    // When: the persisted saga deletes the object and completes its cleanup.
    let objectDeletes = 0;
    const result = await runDeletionSaga({
      advance: (stage) => repository.advance(JOURNEY_DIGEST, stage),
      appendAudit: () => repository.appendAudit(intent, now),
      cleanupBindings: () => repository.cleanupBindings(intent),
      complete: () => repository.complete(JOURNEY_DIGEST),
      deleteObject: async () => {
        objectDeletes += 1;
      },
      inventory: () => repository.inventory(JOURNEY_DIGEST),
      loadStage: async () => intent.stage,
      writeTombstone: () => repository.writeTombstone(intent, 1),
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
