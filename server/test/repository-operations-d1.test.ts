import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OperationsRepository, SessionRepository } from "../src/db";
import { executeSql, SqliteDatabase } from "./d1-sqlite-fixture";

const A_DIGEST = "a".repeat(64);
const B_DIGEST = "b".repeat(64);
const C_DIGEST = "c".repeat(64);
const D_DIGEST = "d".repeat(64);
const E_DIGEST = "e".repeat(64);
const F_DIGEST = "f".repeat(64);

describe("typed operational D1 repositories", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  function migratedDatabase(): SqliteDatabase {
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-operations-d1-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    return new SqliteDatabase(path);
  }

  it("persists only digested session guards and minimized feedback state", async () => {
    // Given: a migrated D1 database.
    const repository = new SessionRepository(migratedDatabase());

    // When: a guard, consent, eligibility, and unlinkable reaction are recorded.
    const guard = await repository.putGuard({
      session_binding_digest: A_DIGEST,
      guard_version: 1,
      active_journey_digest: B_DIGEST,
      create_request_digest: C_DIGEST,
      previous_candidate_digest: D_DIGEST,
      recovery_capability_digest: E_DIGEST,
      recovery_consumed_at: null,
      last_stopped_at: null,
      expires_at: 100,
    });
    await repository.appendConsent({
      consent_id: "consent_0000000000000001",
      session_binding_digest: A_DIGEST,
      consent_kind: "feedback",
      notice_version: 1,
      notice_digest: B_DIGEST,
      decision: "granted",
      decided_at: 1,
    });
    await repository.insertFeedbackEligibility({
      eligibility_id: "eligibility_000000000001",
      journey_hmac_digest: C_DIGEST,
      capability_digest: D_DIGEST,
      eligibility_state: "eligible",
      due_at: 2,
      expires_at: 100,
      consumed_at: null,
    });
    await repository.insertReaction({
      reaction_id: "reaction_000000000000001",
      reaction_code: "positive",
      reaction_version: 1,
      policy_digest: E_DIGEST,
      recorded_at: 3,
      expires_at: 100,
    });
    const found = await repository.findGuard(A_DIGEST, 10);

    // Then: the guard round-trips only digest-shaped identifiers.
    expect(found).toEqual(guard);
  });

  it("persists redacted operations, budgets, dedupe events, and HMAC tombstones", async () => {
    // Given: a migrated D1 database.
    const repository = new OperationsRepository(migratedDatabase());
    await repository.putBudgetWindow({
      budget_window_id: "window_00000000000000001",
      meter_code: "provider",
      window_start: 1,
      window_end: 100,
      authority_digest: A_DIGEST,
      finalized_units: 0,
    });

    // When: operational records are written through strict boundaries.
    const reservation = await repository.insertReservation({
      reservation_id: "reservation_000000000001",
      budget_window_id: "window_00000000000000001",
      request_digest: B_DIGEST,
      units: 1,
      reservation_state: "outstanding",
      reserved_at: 2,
      expires_at: 90,
    });
    await repository.appendAudit({
      audit_event_id: "audit_000000000000000001",
      actor_role: "system",
      action_code: "migration",
      result_code: "pass",
      policy_digest: C_DIGEST,
      deploy_digest: D_DIGEST,
      occurred_at: 2,
      expires_at: 100,
    });
    await repository.recordInbox({
      event_id: "inbox_000000000000000001",
      event_digest: D_DIGEST,
      event_type: "journey-stopped.v1",
      result_code: "accepted",
      write_epoch: 1,
      received_at: 2,
      expires_at: 100,
    });
    await repository.enqueueOutbox({
      event_id: "outbox_00000000000000001",
      aggregate_digest: E_DIGEST,
      event_digest: F_DIGEST,
      event_type: "journey-stopped.v1",
      delivery_state: "pending",
      write_epoch: 1,
      created_at: 2,
      acknowledged_at: null,
      expires_at: 100,
    });
    const tombstone = await repository.putTombstone({
      journey_hmac_digest: F_DIGEST,
      delete_request_digest: E_DIGEST,
      terminal_type: "deleted",
      coarse_utc_bucket: 1,
      write_epoch: 1,
      replay_status: 204,
      expires_at: 100,
    });
    const outstanding = await repository.listOutstandingReservations(
      reservation.budget_window_id,
      10,
    );
    const foundTombstone = await repository.findTombstone(F_DIGEST, 10);

    // Then: bounded reads return the typed reservation and tombstone.
    expect(outstanding).toEqual([reservation]);
    expect(foundTombstone).toEqual(tombstone);
  });
});
