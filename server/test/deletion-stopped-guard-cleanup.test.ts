import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { type SessionGuardRecord, SessionRepository } from "../src/db";
import { DeletionRepository } from "../src/deletion/repository";
import { queryJson } from "./d1-sqlite-fixture";
import {
  advanceToObjectDeleted,
  JOURNEY_DIGEST,
  migratedDatabase,
  NOW,
  SESSION_DIGEST,
} from "./support/deletion-fence-fixture";

const CANDIDATE_DIGEST = "a".repeat(64);
const CURRENT_CREATE_DIGEST = "1".repeat(64);
const CURRENT_JOURNEY_DIGEST = "f".repeat(64);
const RECOVERY_DIGEST = "e".repeat(64);

type GuardState = Pick<
  SessionGuardRecord,
  | "active_journey_digest"
  | "create_request_digest"
  | "last_stopped_at"
  | "previous_candidate_digest"
  | "recovery_capability_digest"
  | "recovery_consumed_at"
>;

describe("journey deletion stopped guard cleanup", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  async function prepareGuard(state: GuardState, objectDeleted = true) {
    const fixture = migratedDatabase(temporaryPaths);
    await new SessionRepository(fixture.database, 1).putGuard({
      expires_at: NOW + 86_400_000,
      guard_version: 1,
      session_binding_digest: SESSION_DIGEST,
      ...state,
    });
    const repository = new DeletionRepository(fixture.database);
    const intent = await repository.prepare({
      deleteRequestDigest: "d".repeat(64),
      expectedSequence: 1,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      sessionBindingDigest: SESSION_DIGEST,
    });
    if (objectDeleted) {
      await advanceToObjectDeleted(repository, intent);
    }
    return { fixture, intent, repository };
  }

  const stoppedState = {
    active_journey_digest: null,
    create_request_digest: null,
    last_stopped_at: NOW,
    previous_candidate_digest: CANDIDATE_DIGEST,
    recovery_capability_digest: RECOVERY_DIGEST,
    recovery_consumed_at: NOW + 1,
  } as const;

  it("removes stopped journey recovery state after its deletion is authorized", async () => {
    // Given: an object-deleted intent and a stopped guard that retains recovery state.
    const { fixture, intent, repository } = await prepareGuard(stoppedState);

    // When: deletion binding cleanup runs with the authorized intent.
    expect(await repository.inventory(intent)).toEqual([
      "browser_session_guards.deleted_journey_state",
    ]);
    await repository.cleanupBindings(intent);

    // Then: neither the stopped state nor inventory can retain the deleted journey's binding.
    expect(queryJson(fixture.path, "SELECT * FROM browser_session_guards")).toEqual([]);
    expect(await repository.inventory(intent)).toEqual([]);
  });

  it("removes an active-null stale create request with stopped recovery state", async () => {
    // Given: a stopped target has retained its old create request and recovery state.
    const { fixture, intent, repository } = await prepareGuard({
      ...stoppedState,
      create_request_digest: CURRENT_CREATE_DIGEST,
    });

    // When: the exact object-deleted intent cleans the session binding.
    await repository.cleanupBindings(intent);

    // Then: no stale create or stopped guard state remains.
    expect(queryJson(fixture.path, "SELECT * FROM browser_session_guards")).toEqual([]);
  });

  it("removes an active target guard after its deletion is authorized", async () => {
    // Given: the target journey is still active in its authorized session.
    const { fixture, intent, repository } = await prepareGuard({
      ...stoppedState,
      active_journey_digest: JOURNEY_DIGEST,
      create_request_digest: CURRENT_CREATE_DIGEST,
    });

    // When: cleanup runs at object-deleted.
    await repository.cleanupBindings(intent);

    // Then: the active target guard is gone.
    expect(queryJson(fixture.path, "SELECT * FROM browser_session_guards")).toEqual([]);
  });

  it("preserves a different current journey while clearing its older stopped state", async () => {
    // Given: another active journey has inherited state stopped before this delete request.
    const { fixture, intent, repository } = await prepareGuard({
      ...stoppedState,
      active_journey_digest: CURRENT_JOURNEY_DIGEST,
      create_request_digest: CURRENT_CREATE_DIGEST,
    });

    // When: cleanup runs for the deleted journey.
    expect(await repository.inventory(intent)).toEqual([
      "browser_session_guards.deleted_journey_state",
    ]);
    await repository.cleanupBindings(intent);

    // Then: only the current journey and its request remain.
    expect(
      queryJson(
        fixture.path,
        "SELECT active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at FROM browser_session_guards",
      ),
    ).toEqual([
      {
        active_journey_digest: CURRENT_JOURNEY_DIGEST,
        create_request_digest: CURRENT_CREATE_DIGEST,
        last_stopped_at: null,
        previous_candidate_digest: null,
        recovery_capability_digest: null,
        recovery_consumed_at: null,
      },
    ]);
    expect(await repository.inventory(intent)).toEqual([]);
  });

  it("preserves a stopped state recorded after the delete request", async () => {
    // Given: a later stopped journey replaces the deleted journey in the same session.
    const { fixture, intent, repository } = await prepareGuard({
      ...stoppedState,
      create_request_digest: CURRENT_CREATE_DIGEST,
      last_stopped_at: NOW + 1,
    });

    // When: cleanup runs for the earlier deletion request.
    await repository.cleanupBindings(intent);

    // Then: the later stopped state remains and is not reported as the deleted journey.
    expect(
      queryJson(
        fixture.path,
        "SELECT create_request_digest, last_stopped_at, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at FROM browser_session_guards",
      ),
    ).toEqual([
      {
        create_request_digest: CURRENT_CREATE_DIGEST,
        last_stopped_at: NOW + 1,
        previous_candidate_digest: CANDIDATE_DIGEST,
        recovery_capability_digest: RECOVERY_DIGEST,
        recovery_consumed_at: NOW + 1,
      },
    ]);
    expect(await repository.inventory(intent)).toEqual([]);
  });

  it("does not mutate a guard before the object-deleted stage", async () => {
    // Given: the exact intent remains pending with a stopped guard.
    const { fixture, intent, repository } = await prepareGuard(stoppedState, false);

    // When: cleanup is called before its stage fence is met.
    await repository.cleanupBindings(intent);

    // Then: the guarded state is unchanged.
    expect(queryJson(fixture.path, "SELECT last_stopped_at FROM browser_session_guards")).toEqual([
      { last_stopped_at: NOW },
    ]);
  });

  it("does not let a replaced deletion intent mutate the guard", async () => {
    // Given: the original intent was replaced by a different object-deleted intent.
    const { fixture, intent, repository } = await prepareGuard(stoppedState, false);
    await fixture.database
      .prepare(
        "UPDATE pending_delete_intents SET delete_request_digest = ?, audit_event_id = ?, stage = 'object-deleted' WHERE journey_hmac_digest = ?",
      )
      .bind("f".repeat(64), "audit_v1.replacement_guard_cleanup", JOURNEY_DIGEST)
      .run();

    // When: the stale worker attempts cleanup with its original identity.
    await repository.cleanupBindings(intent);

    // Then: the replacement-owned guard state remains untouched.
    expect(queryJson(fixture.path, "SELECT last_stopped_at FROM browser_session_guards")).toEqual([
      { last_stopped_at: NOW },
    ]);
  });
});
