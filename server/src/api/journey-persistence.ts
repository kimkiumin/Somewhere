import type { PreparedJourney } from "./journey-composition";

type GuardRow = Readonly<{
  active_journey_digest: string | null;
  create_request_digest: string | null;
  guard_version: number;
}>;

type TombstoneRow = Readonly<{ delete_request_digest: string }>;

export async function findGuard(
  database: D1Database,
  bindingDigest: string,
): Promise<GuardRow | undefined> {
  const value = await database
    .prepare(
      "SELECT active_journey_digest, create_request_digest, guard_version FROM browser_session_guards WHERE session_binding_digest = ? AND expires_at > ?",
    )
    .bind(bindingDigest, Date.now())
    .first();
  return isGuardRow(value) ? value : undefined;
}

export async function persistPreparation(
  input: Readonly<{
    bindingDigest: string;
    bodyDigest: string;
    database: D1Database;
    journeyDigest: string;
    now: number;
    prepared: PreparedJourney;
  }>,
): Promise<boolean> {
  const policyId = "policy:manual-evidence-v1";
  const venueId = `venue:${input.prepared.receipt.selectedMemberDigest}`;
  const sourceId = `source:${input.prepared.receipt.selectedMemberDigest}`;
  const evidenceId = `evidence:${input.prepared.receipt.selectedMemberDigest}`;
  const budgetWindowId = `budget:local-day:${Math.floor(input.now / 86_400_000)}`;
  const reservationId = `reservation:${input.prepared.receipt.receiptDigest}`;
  const expiresAt = input.now + 24 * 60 * 60 * 1_000;
  const poolExpiresAt = input.now + 60 * 60 * 1_000;
  const statements = [
    input.database
      .prepare(
        "INSERT OR IGNORE INTO policy_versions (policy_id, policy_kind, version, document_digest, effective_at) VALUES (?, 'selection', 1, ?, ?)",
      )
      .bind(policyId, input.prepared.receipt.poolDigest, input.now),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO canonical_venues (venue_id, lifecycle_state, record_version, record_digest, rights_expires_at, created_at) VALUES (?, 'active', 1, ?, ?, ?)",
      )
      .bind(venueId, input.prepared.receipt.selectedMemberDigest, poolExpiresAt, input.now),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO venue_sources (source_id, venue_id, provider_code, provider_reference_digest, source_version, rights_expires_at) VALUES (?, ?, 'manual-pilot', ?, 1, ?)",
      )
      .bind(sourceId, venueId, input.prepared.receipt.selectedMemberDigest, poolExpiresAt),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO place_evidence (evidence_id, venue_id, source_id, evidence_kind, normalized_value, confidence_basis_points, review_state, evidence_version, evidence_digest, reviewed_at, evidence_expires_at) VALUES (?, ?, ?, 'merit', 'reviewed-manual-fixture', 10000, 'approved', 1, ?, ?, ?)",
      )
      .bind(
        evidenceId,
        venueId,
        sourceId,
        input.prepared.receipt.receiptDigest,
        input.now,
        poolExpiresAt,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO qualified_pools (pool_id, policy_id, pool_state, pool_version, member_count, pool_digest, sealed_at, expires_at) VALUES (?, ?, 'sealed', 1, 1, ?, ?, ?)",
      )
      .bind(
        input.prepared.receipt.poolId,
        policyId,
        input.prepared.receipt.poolDigest,
        input.now,
        poolExpiresAt,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO qualified_pool_members (pool_id, ordinal, venue_id, evidence_digest, member_digest) VALUES (?, 0, ?, ?, ?)",
      )
      .bind(
        input.prepared.receipt.poolId,
        venueId,
        input.prepared.receipt.receiptDigest,
        input.prepared.receipt.selectedMemberDigest,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO selection_receipts (receipt_id, pool_id, policy_digest, randomness_digest, constraint_digest, receipt_state, selected_member_digest, receipt_version, prepared_at, activated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'prepared', ?, 1, ?, NULL, ?)",
      )
      .bind(
        input.prepared.receipt.receiptId,
        input.prepared.receipt.poolId,
        input.prepared.receipt.poolDigest,
        input.prepared.receipt.receiptDigest,
        input.bodyDigest,
        input.prepared.receipt.selectedMemberDigest,
        input.now,
        poolExpiresAt,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO selection_attempts (receipt_id, attempt_number, remaining_set_digest, candidate_member_digest, validation_result, result_digest, attempted_at) VALUES (?, 1, ?, ?, 'accepted', ?, ?)",
      )
      .bind(
        input.prepared.receipt.receiptId,
        input.prepared.receipt.poolDigest,
        input.prepared.receipt.selectedMemberDigest,
        input.prepared.receipt.receiptDigest,
        input.now,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO budget_windows (budget_window_id, meter_code, window_start, window_end, authority_digest, finalized_units) VALUES (?, 'manual-provider', ?, ?, ?, 0)",
      )
      .bind(
        budgetWindowId,
        Math.floor(input.now / 86_400_000) * 86_400_000,
        Math.floor(input.now / 86_400_000) * 86_400_000 + 86_400_000,
        input.prepared.receipt.poolDigest,
      ),
    input.database
      .prepare(
        "INSERT OR IGNORE INTO budget_reservations (reservation_id, budget_window_id, request_digest, units, reservation_state, reserved_at, expires_at) VALUES (?, ?, ?, 1, 'outstanding', ?, ?)",
      )
      .bind(reservationId, budgetWindowId, input.journeyDigest, input.now, poolExpiresAt),
    input.database
      .prepare(
        "INSERT INTO browser_session_guards (session_binding_digest, guard_version, active_journey_digest, create_request_digest, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at, last_stopped_at, expires_at) VALUES (?, 1, ?, ?, NULL, NULL, NULL, NULL, ?) ON CONFLICT(session_binding_digest) DO UPDATE SET guard_version = browser_session_guards.guard_version + 1, active_journey_digest = excluded.active_journey_digest, create_request_digest = excluded.create_request_digest, expires_at = excluded.expires_at WHERE browser_session_guards.active_journey_digest IS NULL OR browser_session_guards.active_journey_digest = excluded.active_journey_digest",
      )
      .bind(input.bindingDigest, input.journeyDigest, input.bodyDigest, expiresAt),
  ];
  await input.database.batch(statements);
  const guard = await findGuard(input.database, input.bindingDigest);
  return guard?.active_journey_digest === input.journeyDigest;
}

export async function clearGuard(
  database: D1Database,
  bindingDigest: string,
  journeyDigest: string,
): Promise<void> {
  await database
    .prepare(
      "UPDATE browser_session_guards SET guard_version = guard_version + 1, active_journey_digest = NULL, create_request_digest = NULL WHERE session_binding_digest = ? AND active_journey_digest = ?",
    )
    .bind(bindingDigest, journeyDigest)
    .run();
}

export async function findDeleteReplay(
  database: D1Database,
  journeyDigest: string,
  now: number,
): Promise<string | undefined> {
  const value = await database
    .prepare(
      "SELECT delete_request_digest FROM journey_tombstones WHERE journey_hmac_digest = ? AND expires_at > ?",
    )
    .bind(journeyDigest, now)
    .first();
  return isTombstoneRow(value) ? value.delete_request_digest : undefined;
}

export async function writeDeleteTombstone(
  input: Readonly<{
    database: D1Database;
    deleteRequestDigest: string;
    journeyDigest: string;
    now: number;
  }>,
): Promise<void> {
  const bucket = Math.floor(input.now / 3_600_000) * 3_600_000;
  await input.database
    .prepare(
      "INSERT INTO journey_tombstones (journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at) VALUES (?, ?, 'deleted', ?, 2, 204, ?) ON CONFLICT(journey_hmac_digest) DO NOTHING",
    )
    .bind(input.journeyDigest, input.deleteRequestDigest, bucket, input.now + 48 * 60 * 60 * 1_000)
    .run();
}

function isGuardRow(value: unknown): value is GuardRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "active_journey_digest" in value &&
    (typeof value.active_journey_digest === "string" || value.active_journey_digest === null) &&
    "create_request_digest" in value &&
    (typeof value.create_request_digest === "string" || value.create_request_digest === null) &&
    "guard_version" in value &&
    typeof value.guard_version === "number"
  );
}

function isTombstoneRow(value: unknown): value is TombstoneRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "delete_request_digest" in value &&
    typeof value.delete_request_digest === "string"
  );
}
