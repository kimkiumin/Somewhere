import { z } from "zod";
import { type Database, firstParsed } from "../db/database";

const countSchema = z.object({ count: z.number().int().nonnegative() }).strict();
const EXPECTED_ENVELOPE_COUNT = 12;

export type ReserveEnvelopeInput = Readonly<{
  environment: "staging" | "production";
  expiresAt: number;
  now: number;
  releaseDigest: string;
  requestDigest: string;
  writeEpoch: number;
}>;

export type ReserveEnvelopeResult = "reserved" | "replayed" | "closed";

export class JourneyEnvelopeRepository {
  constructor(private readonly database: Database) {}

  async reserve(input: ReserveEnvelopeInput): Promise<ReserveEnvelopeResult> {
    const before = await this.count(input);
    await this.database
      .prepare(RESERVE_ENVELOPE_SQL)
      .bind(
        input.releaseDigest,
        input.now,
        input.now,
        input.now,
        input.now,
        input.now,
        input.now,
        input.releaseDigest,
        input.now,
        input.releaseDigest,
        input.requestDigest,
        input.requestDigest,
        input.releaseDigest,
        input.writeEpoch,
        input.now,
        input.expiresAt,
        input.environment,
        input.writeEpoch,
        input.now,
        input.environment,
        input.writeEpoch,
        input.releaseDigest,
        input.environment,
        input.releaseDigest,
        input.now,
      )
      .run();
    if ((await this.count(input)) !== EXPECTED_ENVELOPE_COUNT) {
      return "closed";
    }
    return before === EXPECTED_ENVELOPE_COUNT ? "replayed" : "reserved";
  }

  async finalize(
    requestDigest: string,
    releaseDigest: string,
    writeEpoch: number,
  ): Promise<boolean> {
    await this.database
      .prepare(
        `UPDATE operations_meter_reservations
         SET reservation_state = 'finalized', finalized_units = reserved_units
         WHERE request_digest = ? AND release_digest = ? AND write_epoch = ?
           AND reservation_state = 'reserved'`,
      )
      .bind(requestDigest, releaseDigest, writeEpoch)
      .run();
    const row = await firstParsed(
      this.database
        .prepare(
          `SELECT COUNT(*) AS count FROM operations_meter_reservations
           WHERE request_digest = ? AND release_digest = ? AND write_epoch = ?
             AND reservation_state = 'finalized'`,
        )
        .bind(requestDigest, releaseDigest, writeEpoch),
      countSchema,
    );
    return row?.count === EXPECTED_ENVELOPE_COUNT;
  }

  async release(
    requestDigest: string,
    releaseDigest: string,
    writeEpoch: number,
  ): Promise<boolean> {
    await this.database
      .prepare(
        `UPDATE operations_meter_reservations
         SET reservation_state = 'released'
         WHERE request_digest = ? AND release_digest = ? AND write_epoch = ?
           AND reservation_state = 'reserved'`,
      )
      .bind(requestDigest, releaseDigest, writeEpoch)
      .run();
    const row = await firstParsed(
      this.database
        .prepare(
          `SELECT COUNT(*) AS count FROM operations_meter_reservations
           WHERE request_digest = ? AND release_digest = ? AND write_epoch = ?
             AND reservation_state = 'released'`,
        )
        .bind(requestDigest, releaseDigest, writeEpoch),
      countSchema,
    );
    return row?.count === EXPECTED_ENVELOPE_COUNT;
  }

  private async count(input: ReserveEnvelopeInput): Promise<number> {
    const row = await firstParsed(
      this.database
        .prepare(
          `SELECT COUNT(*) AS count FROM operations_meter_reservations
           WHERE request_digest = ? AND release_digest = ? AND write_epoch = ?`,
        )
        .bind(input.requestDigest, input.releaseDigest, input.writeEpoch),
      countSchema,
    );
    return row?.count ?? 0;
  }
}

const RESERVE_ENVELOPE_SQL = `WITH candidate AS (
  SELECT
    envelope.meter_id,
    envelope.reserved_units,
    window.window_start_utc,
    window.window_end_utc
  FROM operations_journey_envelopes AS envelope
  JOIN operations_meter_windows AS window ON window.meter_id = envelope.meter_id
  WHERE envelope.release_digest = ? AND envelope.expires_at > ?
    AND window.window_start_utc <= ? AND window.window_end_utc > ?
    AND window.platform_observed_at >= ? - envelope.freshness_ms
    AND window.immediate_observed_at >= ? - envelope.freshness_ms
    AND (
      envelope.reset_confirmation_required = 0 OR
      window.reset_confirmed = 1
    )
    AND (
      MAX(
        COALESCE(window.platform_observed, 0) + window.unrelated_baseline,
        COALESCE(window.immediate_observed, 0) + window.unrelated_baseline,
        window.local_finalized + window.unrelated_baseline
      )
      + window.uncertainty_reserve
      + COALESCE((
        SELECT SUM(reservation.reserved_units)
        FROM operations_meter_reservations AS reservation
        WHERE reservation.meter_id = window.meter_id
          AND reservation.window_start_utc = window.window_start_utc
          AND reservation.reservation_state = 'reserved'
          AND reservation.expires_at > ?
      ), 0)
      + envelope.reserved_units
    ) < envelope.close_at
),
expected AS (
  SELECT COUNT(*) AS count
  FROM operations_journey_envelopes
  WHERE release_digest = ? AND expires_at > ?
)
INSERT INTO operations_meter_reservations (
  reservation_id, meter_id, window_start_utc, request_digest, release_digest, provider_digest,
  write_epoch, reserved_units, finalized_units, reservation_state, reserved_at, expires_at
)
SELECT
  'r_' || substr(?, 1, 8) || '_' || substr(?, 1, 16) || '_' ||
    replace(candidate.meter_id, '.', '_'),
  candidate.meter_id,
  candidate.window_start_utc,
  ?,
  ?,
  NULL,
  ?,
  candidate.reserved_units,
  NULL,
  'reserved',
  ?,
  MIN(candidate.window_end_utc, ?)
FROM candidate
WHERE (SELECT COUNT(*) FROM candidate) = ${EXPECTED_ENVELOPE_COUNT}
  AND (SELECT count FROM expected) = ${EXPECTED_ENVELOPE_COUNT}
  AND EXISTS (
    SELECT 1 FROM operations_write_fence
    WHERE environment = ? AND write_epoch = ? AND mode = 'OPEN'
      AND (expires_at IS NULL OR expires_at > ?)
  )
  AND EXISTS (
    SELECT 1 FROM operations_admission_state
    WHERE environment = ? AND write_epoch = ? AND release_digest = ?
      AND state IN ('OPEN', 'WARN') AND provider_budget_available = 1
  )
  AND (
    SELECT COUNT(DISTINCT gate_kind) FROM operations_release_gates
    WHERE environment = ? AND reviewed_release_digest = ?
      AND verdict = 'PASS' AND expires_at > ?
  ) = 2
  AND NOT EXISTS (
    SELECT 1 FROM operations_kill_switches WHERE active = 1
  )
ON CONFLICT (meter_id, window_start_utc, request_digest, release_digest) DO UPDATE SET
  provider_digest = excluded.provider_digest,
  write_epoch = excluded.write_epoch,
  reserved_units = excluded.reserved_units,
  finalized_units = NULL,
  reservation_state = 'reserved',
  reserved_at = excluded.reserved_at,
  expires_at = excluded.expires_at
WHERE operations_meter_reservations.reservation_state = 'released'`;
