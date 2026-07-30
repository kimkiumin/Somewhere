import type { Database } from "../db/database";
import type { PendingDelete } from "../deletion/intent-repository";

export type InventoryEntry = Readonly<{
  fields: readonly string[];
  store: string;
}>;

export type DeletionDisclosure = Readonly<{
  d1RecoveryHistoryDays: 7;
  doRecoveryHistoryDays: 30;
  violations: readonly string[];
}>;

const SURVIVOR_ALLOWLIST = new Map<string, ReadonlySet<string>>([
  [
    "audit_events",
    new Set([
      "action_code",
      "actor_role",
      "audit_event_id",
      "deploy_digest",
      "expires_at",
      "occurred_at",
      "policy_digest",
      "result_code",
    ]),
  ],
  [
    "journey_tombstones",
    new Set([
      "coarse_utc_bucket",
      "delete_request_digest",
      "expires_at",
      "journey_hmac_digest",
      "replay_expires_at",
      "replay_status",
      "terminal_type",
      "write_epoch",
    ]),
  ],
]);

export function inspectDeletionSurvivors(inventory: readonly InventoryEntry[]): DeletionDisclosure {
  const violations = inventory
    .flatMap(({ fields, store }) => {
      const allowedFields = SURVIVOR_ALLOWLIST.get(store);
      return fields
        .filter((field) => allowedFields?.has(field) !== true)
        .map((field) => `${store}.${field}`);
    })
    .sort();
  return {
    d1RecoveryHistoryDays: 7,
    doRecoveryHistoryDays: 30,
    violations,
  };
}

export async function scanDeletionBindings(
  database: Database,
  intent: PendingDelete,
): Promise<readonly string[]> {
  const checks = [
    {
      label: "browser_session_guards.deleted_journey_state",
      query: `SELECT 1 FROM browser_session_guards
              WHERE session_binding_digest = ?
                AND (
                  active_journey_digest = ?
                  OR (
                    (last_stopped_at IS NULL OR last_stopped_at <= ?)
                    AND (
                      previous_candidate_digest IS NOT NULL
                      OR recovery_capability_digest IS NOT NULL
                      OR recovery_consumed_at IS NOT NULL
                      OR last_stopped_at IS NOT NULL
                      OR (
                        active_journey_digest IS NULL
                        AND create_request_digest IS NOT NULL
                      )
                    )
                  )
                )
                AND EXISTS (
                  SELECT 1 FROM pending_delete_intents
                  WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                    AND session_binding_digest = ? AND audit_event_id = ?
                    AND stage = 'object-deleted'
                )
              LIMIT 1`,
      values: [
        intent.session_binding_digest,
        intent.journey_hmac_digest,
        intent.requested_at,
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        intent.session_binding_digest,
        intent.audit_event_id,
      ],
    },
    {
      label: "budget_reservations.request_digest",
      query: "SELECT 1 FROM budget_reservations WHERE request_digest = ? LIMIT 1",
      values: [intent.journey_hmac_digest],
    },
    {
      label: "feedback_eligibility.journey_hmac_digest",
      query: "SELECT 1 FROM feedback_eligibility WHERE journey_hmac_digest = ? LIMIT 1",
      values: [intent.journey_hmac_digest],
    },
    {
      label: "outbox_events.aggregate_digest",
      query: "SELECT 1 FROM outbox_events WHERE aggregate_digest = ? LIMIT 1",
      values: [intent.journey_hmac_digest],
    },
  ] as const;
  const results = await Promise.all(
    checks.map(async ({ label, query, values }) => ({
      found:
        (await database
          .prepare(query)
          .bind(...values)
          .first()) !== null,
      label,
    })),
  );
  return results.filter(({ found }) => found).map(({ label }) => label);
}
