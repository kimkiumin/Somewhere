import { z } from "zod";
import { type DatedMeterSample, METER_POLICIES, type MeterId } from "../admission/meter";
import { allParsed, type Database, firstParsed } from "../db/database";
import type { WriteFence } from "./write-fence";

const fenceSchema = z
  .object({
    mode: z.enum([
      "OPEN",
      "ADMISSION_CLOSED",
      "PRODUCERS_FENCED",
      "ALL_NONTERMINAL_FENCED",
      "RECOVERY_VERIFY",
    ]),
    write_epoch: z.number().int().positive(),
  })
  .strict();
const stateSchema = z
  .object({
    fresh_recovery_samples: z.number().int().nonnegative(),
    old_epoch_reservations: z.number().int().nonnegative(),
    provider_budget_available: z.union([z.literal(0), z.literal(1)]),
    queue_healthy: z.union([z.literal(0), z.literal(1)]),
    release_digest: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum([
      "BOOT_BLOCKED",
      "OPEN",
      "WARN",
      "METER_BLOCK",
      "EXTERNAL_BLOCK",
      "WRITE_FENCED",
      "DEGRADED",
      "EMERGENCY_FROZEN",
      "RECOVERY_VERIFY",
    ]),
    write_epoch: z.number().int().positive(),
  })
  .strict();
const meterSchema = z
  .object({
    immediate_observed: z.number().nonnegative().nullable(),
    immediate_observed_at: z.number().int().positive().nullable(),
    local_finalized: z.number().nonnegative(),
    meter_id: z.string(),
    outstanding_reservations: z.number().nonnegative(),
    platform_observed: z.number().nonnegative().nullable(),
    platform_observed_at: z.number().int().positive().nullable(),
    reset_confirmed: z.union([z.literal(0), z.literal(1)]),
    unrelated_baseline: z.number().nonnegative(),
    uncertainty_reserve: z.number().nonnegative(),
    window_end_utc: z.number().int().positive(),
    window_start_utc: z.number().int().positive(),
  })
  .strict();
const countSchema = z.object({ count: z.number().int().nonnegative() }).strict();
const envelopeSchema = z
  .object({
    close_at: z.number().positive(),
    freshness_ms: z.number().int().positive(),
    meter_id: z.string(),
    reserved_units: z.number().int().positive(),
    reset_confirmation_required: z.union([z.literal(0), z.literal(1)]),
  })
  .strict();

export type RuntimeState = z.infer<typeof stateSchema>;
export type RuntimeSnapshot = Readonly<{
  gateCount: number;
  journeyEnvelopeValid: boolean;
  killCount: number;
  meters: readonly DatedMeterSample[];
  state: RuntimeState | null;
}>;

export class RuntimeStateRepository {
  constructor(private readonly database: Database) {}

  async loadFence(environment: "staging" | "production"): Promise<WriteFence | null> {
    const row = await firstParsed(
      this.database
        .prepare("SELECT mode, write_epoch FROM operations_write_fence WHERE environment = ?")
        .bind(environment),
      fenceSchema,
    );
    return row === null ? null : { mode: row.mode, writeEpoch: row.write_epoch };
  }

  async loadSnapshot(environment: "staging" | "production", now: number): Promise<RuntimeSnapshot> {
    const [state, rows, envelopes, gates, kills] = await Promise.all([
      firstParsed(
        this.database
          .prepare(
            `SELECT state, write_epoch, release_digest, provider_budget_available, queue_healthy,
                    fresh_recovery_samples, old_epoch_reservations
             FROM operations_admission_state WHERE environment = ?`,
          )
          .bind(environment),
        stateSchema,
      ),
      allParsed(
        this.database
          .prepare(
            `SELECT
               window.meter_id, window.window_start_utc, window.window_end_utc,
               window.platform_observed, window.platform_observed_at,
               window.immediate_observed, window.immediate_observed_at,
               window.local_finalized, window.unrelated_baseline,
               window.uncertainty_reserve, window.reset_confirmed,
               COALESCE((
               SELECT SUM(reserved_units) FROM operations_meter_reservations AS reservation
               WHERE reservation.meter_id = window.meter_id
                 AND reservation.window_start_utc = window.window_start_utc
                 AND reservation.reservation_state = 'reserved'
                 AND reservation.expires_at > ?
             ), 0) AS outstanding_reservations
             FROM operations_meter_windows AS window
             WHERE window.window_start_utc <= ? AND window.window_end_utc > ?`,
          )
          .bind(now, now, now),
        meterSchema,
      ),
      allParsed(
        this.database
          .prepare(
            `SELECT meter_id, reserved_units, close_at, freshness_ms,
                    reset_confirmation_required
             FROM operations_journey_envelopes
             WHERE release_digest = (
               SELECT release_digest FROM operations_admission_state WHERE environment = ?
             ) AND expires_at > ?`,
          )
          .bind(environment, now),
        envelopeSchema,
      ),
      firstParsed(
        this.database
          .prepare(
            `SELECT COUNT(DISTINCT gate.gate_kind) AS count
             FROM operations_release_gates AS gate
             JOIN operations_admission_state AS admission
               ON admission.environment = gate.environment
              AND admission.release_digest = gate.reviewed_release_digest
             WHERE gate.environment = ? AND gate.verdict = 'PASS' AND gate.expires_at > ?`,
          )
          .bind(environment, now),
        countSchema,
      ),
      firstParsed(
        this.database.prepare(
          "SELECT COUNT(*) AS count FROM operations_kill_switches WHERE active = 1",
        ),
        countSchema,
      ),
    ]);
    return {
      gateCount: gates?.count ?? 0,
      journeyEnvelopeValid: validEnvelope(envelopes),
      killCount: kills?.count ?? 0,
      meters: rows.flatMap(toMeterSample),
      state,
    };
  }
}

function validEnvelope(rows: readonly z.infer<typeof envelopeSchema>[]): boolean {
  const expected = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  );
  if (rows.length !== expected.length) {
    return false;
  }
  return expected.every((policy) =>
    rows.some(
      (row) =>
        row.meter_id === policy.id &&
        row.close_at === policy.closeAt &&
        row.freshness_ms === policy.freshnessMs &&
        row.reset_confirmation_required === (policy.resetConfirmationRequired ? 1 : 0),
    ),
  );
}

export async function authorizeBackgroundWork(
  database: Database,
  environment: "local" | "staging" | "production",
  kind: "drain" | "producer",
): Promise<Readonly<{ allowed: boolean; writeEpoch: number }>> {
  if (environment === "local") {
    return { allowed: true, writeEpoch: 1 };
  }
  const fence = await new RuntimeStateRepository(database).loadFence(environment);
  if (fence === null) {
    return { allowed: false, writeEpoch: 1 };
  }
  const state =
    kind === "producer"
      ? await firstParsed(
          database
            .prepare("SELECT state FROM operations_admission_state WHERE environment = ?")
            .bind(environment),
          z
            .object({
              state: z.enum([
                "BOOT_BLOCKED",
                "OPEN",
                "WARN",
                "METER_BLOCK",
                "EXTERNAL_BLOCK",
                "WRITE_FENCED",
                "DEGRADED",
                "EMERGENCY_FROZEN",
                "RECOVERY_VERIFY",
              ]),
            })
            .strict(),
        )
      : null;
  const allowed =
    kind === "producer"
      ? fence.mode === "OPEN" && (state?.state === "OPEN" || state?.state === "WARN")
      : fence.mode === "OPEN" ||
        fence.mode === "ADMISSION_CLOSED" ||
        fence.mode === "PRODUCERS_FENCED";
  return { allowed, writeEpoch: fence.writeEpoch };
}

function toMeterSample(row: z.infer<typeof meterSchema>): readonly DatedMeterSample[] {
  if (!isMeterId(row.meter_id)) {
    return [];
  }
  return [
    {
      immediateObserved: row.immediate_observed,
      immediateObservedAt: row.immediate_observed_at,
      localFinalized: row.local_finalized,
      meterId: row.meter_id,
      outstandingReservations: row.outstanding_reservations,
      platformObserved: row.platform_observed,
      platformObservedAt: row.platform_observed_at,
      resetConfirmed: row.reset_confirmed === 1,
      unrelatedBaseline: row.unrelated_baseline,
      uncertaintyReserve: row.uncertainty_reserve,
      windowEndUtc: row.window_end_utc,
      windowStartUtc: row.window_start_utc,
    },
  ];
}

function isMeterId(value: string): value is MeterId {
  return METER_POLICIES.some((policy) => policy.id === value);
}
