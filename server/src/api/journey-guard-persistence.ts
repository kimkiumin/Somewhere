type GuardRow = Readonly<{
  active_journey_digest: string | null;
  create_request_digest: string | null;
  guard_version: number;
  last_stopped_at: number | null;
  previous_candidate_digest: string | null;
  recovery_capability_digest: string | null;
  recovery_consumed_at: number | null;
}>;

export async function findGuard(
  database: D1Database,
  bindingDigest: string,
): Promise<GuardRow | undefined> {
  const value = await database
    .prepare(
      "SELECT active_journey_digest, create_request_digest, guard_version, last_stopped_at, previous_candidate_digest, recovery_capability_digest, recovery_consumed_at FROM browser_session_guards WHERE session_binding_digest = ? AND expires_at > ?",
    )
    .bind(bindingDigest, Date.now())
    .first();
  return isGuardRow(value) ? value : undefined;
}

export async function markJourneyStopped(
  input: Readonly<{
    bindingDigest: string;
    database: D1Database;
    journeyDigest: string;
    now: number;
    previousCandidateDigest: string;
  }>,
): Promise<boolean> {
  const result = await input.database
    .prepare(
      `UPDATE browser_session_guards
       SET guard_version = guard_version + 1, active_journey_digest = NULL,
         create_request_digest = NULL, previous_candidate_digest = ?,
         recovery_capability_digest = NULL, recovery_consumed_at = NULL, last_stopped_at = ?
       WHERE session_binding_digest = ? AND active_journey_digest = ?
         AND NOT EXISTS (
           SELECT 1 FROM pending_delete_intents WHERE journey_hmac_digest = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM journey_tombstones WHERE journey_hmac_digest = ?
         )`,
    )
    .bind(
      input.previousCandidateDigest,
      input.now,
      input.bindingDigest,
      input.journeyDigest,
      input.journeyDigest,
      input.journeyDigest,
    )
    .run();
  return mutationChanges(result) === 1;
}

function mutationChanges(result: D1Result<unknown>): number | undefined {
  return typeof result.meta.changes === "number" ? result.meta.changes : undefined;
}

export async function storeRecoveryDigest(
  input: Readonly<{
    bindingDigest: string;
    database: D1Database;
    digest: string;
    issuedAt: number;
  }>,
): Promise<boolean> {
  await input.database
    .prepare(
      "UPDATE browser_session_guards SET guard_version = guard_version + 1, recovery_capability_digest = ?, recovery_consumed_at = NULL, last_stopped_at = ? WHERE session_binding_digest = ? AND active_journey_digest IS NULL AND previous_candidate_digest IS NOT NULL",
    )
    .bind(input.digest, input.issuedAt, input.bindingDigest)
    .run();
  const guard = await findGuard(input.database, input.bindingDigest);
  return guard?.recovery_capability_digest === input.digest;
}

export async function consumeRecoveryDigest(
  input: Readonly<{
    bindingDigest: string;
    database: D1Database;
    digest: string;
    now: number;
  }>,
): Promise<boolean> {
  await input.database
    .prepare(
      "UPDATE browser_session_guards SET guard_version = guard_version + 1, recovery_consumed_at = ? WHERE session_binding_digest = ? AND recovery_capability_digest = ? AND recovery_consumed_at IS NULL AND active_journey_digest IS NULL AND last_stopped_at + 120000 >= ?",
    )
    .bind(input.now, input.bindingDigest, input.digest, input.now)
    .run();
  const guard = await findGuard(input.database, input.bindingDigest);
  return (
    guard?.recovery_capability_digest === input.digest && guard.recovery_consumed_at === input.now
  );
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

function isGuardRow(value: unknown): value is GuardRow {
  return (
    value !== null &&
    typeof value === "object" &&
    "active_journey_digest" in value &&
    (typeof value.active_journey_digest === "string" || value.active_journey_digest === null) &&
    "create_request_digest" in value &&
    (typeof value.create_request_digest === "string" || value.create_request_digest === null) &&
    "guard_version" in value &&
    typeof value.guard_version === "number" &&
    "last_stopped_at" in value &&
    (typeof value.last_stopped_at === "number" || value.last_stopped_at === null) &&
    "previous_candidate_digest" in value &&
    (typeof value.previous_candidate_digest === "string" ||
      value.previous_candidate_digest === null) &&
    "recovery_capability_digest" in value &&
    (typeof value.recovery_capability_digest === "string" ||
      value.recovery_capability_digest === null) &&
    "recovery_consumed_at" in value &&
    (typeof value.recovery_consumed_at === "number" || value.recovery_consumed_at === null)
  );
}
