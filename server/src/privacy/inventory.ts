import type { Database } from "../db/database";

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
  journeyDigest: string,
): Promise<readonly string[]> {
  const checks = [
    {
      label: "browser_session_guards.active_journey_hmac_digest",
      query: "SELECT 1 FROM browser_session_guards WHERE active_journey_digest = ? LIMIT 1",
      value: journeyDigest,
    },
    {
      label: "budget_reservations.request_digest",
      query: "SELECT 1 FROM budget_reservations WHERE request_digest = ? LIMIT 1",
      value: journeyDigest,
    },
    {
      label: "feedback_eligibility.journey_hmac_digest",
      query: "SELECT 1 FROM feedback_eligibility WHERE journey_hmac_digest = ? LIMIT 1",
      value: journeyDigest,
    },
    {
      label: "outbox_events.aggregate_digest",
      query: "SELECT 1 FROM outbox_events WHERE aggregate_digest = ? LIMIT 1",
      value: journeyDigest,
    },
  ] as const;
  const results = await Promise.all(
    checks.map(async ({ label, query, value }) => ({
      found: (await database.prepare(query).bind(value).first()) !== null,
      label,
    })),
  );
  return results.filter(({ found }) => found).map(({ label }) => label);
}
