import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteJourney } from "../src/api/journey-mutation";
import { DeletionRepository } from "../src/deletion/repository";
import { type DeletionSagaPorts, runDeletionSaga } from "../src/deletion/saga";
import { InMemorySessionRepository, SessionService } from "../src/security/session";
import { hmacDigest, importHmacKey } from "../src/security/tokens";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";
import { cleanupTemporaryPaths } from "./support/feedback-deletion-fixture";

describe("Todo13 feedback deletion", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    cleanupTemporaryPaths(temporaryPaths);
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

  it("refreshes a durable tombstone throughout an incomplete delete retry", async () => {
    // Given: a persisted saga whose first Durable Object deletion attempt fails.
    let stage: "pending" | "fenced" | "tombstoned" | "object-deleted" | "cleaned" = "pending";
    let deleteAttempts = 0;
    let tombstoneWrites = 0;
    const ports: DeletionSagaPorts = {
      advance: async (nextStage) => {
        stage = nextStage;
      },
      beginDeletion: async () => "fenced",
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
      finalizeCompletion: async () => {
        tombstoneWrites += 1;
      },
      writeTombstone: async () => {
        tombstoneWrites += 1;
      },
    };

    // When: the same deletion intent is retried after the incomplete object step.
    const first = await runDeletionSaga(ports);
    const second = await runDeletionSaga(ports);

    // Then: each resume and final completion refreshes the tombstone before its next side effect.
    expect(first).toEqual({ kind: "incomplete", stage: "tombstoned" });
    expect(second).toEqual({ kind: "complete" });
    expect(tombstoneWrites).toBe(4);
    expect(deleteAttempts).toBe(2);
  });

  it("resumes a prepared intent before honoring its durable tombstone replay", async () => {
    // Given: a DELETE whose tombstone committed but whose first stage advance failed.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-delete-replay-order-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    for (const migration of [
      "migrations/0001_v2.sql",
      "migrations/0003_feedback_deletion.sql",
      "migrations/0004_operations_control.sql",
      "migrations/0005_operations_epoch_extensions.sql",
      "migrations/0006_journey_deletion_fence.sql",
    ]) {
      executeSql(path, readFileSync(resolve(process.cwd(), migration), "utf8"));
    }
    const database = new SqliteDatabase(path);
    const requestedAt = 1_785_283_200_000;
    const requestStartedAt = requestedAt + 48 * 60 * 60 * 1_000 + 1;
    const completionAt = requestStartedAt + 60_000;
    const hmacKey = await importHmacKey(new Uint8Array(32).fill(13));
    const sessions = new SessionService(new InMemorySessionRepository(), hmacKey);
    const issued = await sessions.issueOrRefresh(undefined, requestStartedAt);
    const journeyId = `j_v1.${"A".repeat(22)}`;
    const idempotencyKey = `ik_v1.${"B".repeat(43)}`;
    const journeyDigest = await hmacDigest(hmacKey, journeyId);
    const deleteRequestDigest = await hmacDigest(hmacKey, idempotencyKey);
    const repository = new DeletionRepository(database);
    const intent = await repository.prepare({
      deleteRequestDigest,
      expectedSequence: 1,
      journeyDigest,
      now: requestedAt,
      sessionBindingDigest: issued.bindingDigest,
    });
    await repository.advance(intent, "fenced");
    await repository.writeTombstone(intent, 1, requestedAt);
    await repository.advance(intent, "tombstoned");
    await repository.advance(intent, "object-deleted");
    await repository.advance(intent, "cleaned");
    let objectDeletes = 0;
    const environment = {
      DB: database,
      JOURNEYS: {
        getByName: () => ({
          deleteAfterTombstone: async () => {
            objectDeletes += 1;
          },
          snapshot: async () => {
            throw new Error("prepared deletion must not load a new snapshot");
          },
        }),
      },
    };
    let nowReads = 0;
    const dependencies = {
      hmacKey,
      now: () => {
        const current = nowReads === 0 ? requestStartedAt : completionAt;
        nowReads += 1;
        return current;
      },
      requestPolicy: {
        canonicalHost: "127.0.0.1:8787",
        canonicalOrigin: "http://127.0.0.1:8787",
        kind: "valid" as const,
      },
      sessionService: sessions,
      writeEpoch: 1,
    };
    const request = () =>
      new Request(`http://127.0.0.1:8787/api/v1/journeys/${journeyId}`, {
        headers: {
          cookie: issued.cookie,
          "content-type": "application/json",
          host: "127.0.0.1:8787",
          "idempotency-key": idempotencyKey,
          origin: "http://127.0.0.1:8787",
          "sec-fetch-site": "same-origin",
          "x-csrf-token": issued.csrfToken,
          "x-expected-sequence": "1",
        },
        method: "DELETE",
      });

    // When: the same DELETE resumes after tombstone retention and then replays.
    const resumed = await deleteJourney(
      request(),
      environment as unknown as Env,
      dependencies,
      journeyId,
    );
    const replayed = await deleteJourney(
      request(),
      environment as unknown as Env,
      dependencies,
      journeyId,
    );

    // Then: final completion refreshes both barriers before the completed retry replays.
    expect([resumed.status, replayed.status]).toEqual([204, 204]);
    expect(objectDeletes).toBe(0);
    expect(queryJson(path, "SELECT * FROM pending_delete_intents")).toEqual([]);
    expect(queryJson(path, "SELECT expires_at, replay_expires_at FROM journey_tombstones")).toEqual(
      [
        {
          expires_at: completionAt + 48 * 60 * 60 * 1_000,
          replay_expires_at: completionAt + 24 * 60 * 60 * 1_000,
        },
      ],
    );
    expect(
      queryJson(
        path,
        "SELECT occurred_at FROM audit_events WHERE audit_event_id = '" +
          intent.audit_event_id +
          "'",
      ),
    ).toEqual([{ occurred_at: completionAt }]);
  });
});
