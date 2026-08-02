import { z } from "zod";
import { type MeterId, meterPolicyFor } from "../admission/meter";
import { type Database, firstParsed } from "../db/database";

const reservationRowSchema = z
  .object({
    reservation_id: z.string(),
    reservation_state: z.enum(["reserved", "finalized", "released"]),
    reserved_units: z.number().int().positive(),
    write_epoch: z.number().int().positive(),
  })
  .strict()
  .readonly();

export type ReserveMeterInput = Readonly<{
  closeAt: number;
  environment: "local" | "staging" | "production";
  expiresAt: number;
  meterId: MeterId;
  now: number;
  providerDigest: string | null;
  releaseDigest: string;
  requestDigest: string;
  reservationId: string;
  units: number;
  windowStartUtc: number;
  writeEpoch: number;
}>;

export type ReserveMeterResult =
  | Readonly<{ kind: "reserved"; reservationId: string }>
  | Readonly<{ kind: "replayed"; reservationId: string }>
  | Readonly<{ kind: "closed" }>;

export class AdmissionRepository {
  constructor(private readonly database: Database) {}

  async reserve(input: ReserveMeterInput): Promise<ReserveMeterResult> {
    const policy = meterPolicyFor(input.meterId);
    if (policy === undefined) {
      return { kind: "closed" };
    }
    const before = await this.findReservation(input);
    if (before !== null && before.reservation_state !== "released") {
      return { kind: "replayed", reservationId: before.reservation_id };
    }
    await this.database
      .prepare(RESERVE_SQL)
      .bind(
        input.reservationId,
        input.meterId,
        input.windowStartUtc,
        input.requestDigest,
        input.releaseDigest,
        input.providerDigest,
        input.writeEpoch,
        input.units,
        input.now,
        input.expiresAt,
        input.environment,
        input.writeEpoch,
        input.now,
        input.meterId,
        input.windowStartUtc,
        input.now,
        input.now,
        input.now - policy.freshnessMs,
        input.now - policy.freshnessMs,
        policy.resetConfirmationRequired ? 1 : 0,
        input.now,
        input.units,
        input.closeAt,
        input.providerDigest,
      )
      .run();
    const reserved = await this.findReservation(input);
    if (reserved === null) {
      return { kind: "closed" };
    }
    if (before?.reservation_state === "released" && reserved.reservation_state === "reserved") {
      return { kind: "reserved", reservationId: reserved.reservation_id };
    }
    return reserved.reservation_id === input.reservationId
      ? { kind: "reserved", reservationId: reserved.reservation_id }
      : { kind: "replayed", reservationId: reserved.reservation_id };
  }

  async finalize(
    reservationId: string,
    finalizedUnits: number,
    writeEpoch: number,
  ): Promise<boolean> {
    await this.database
      .prepare(
        `UPDATE operations_meter_reservations
         SET reservation_state = 'finalized', finalized_units = ?
         WHERE reservation_id = ? AND reservation_state = 'reserved' AND write_epoch = ?`,
      )
      .bind(finalizedUnits, reservationId, writeEpoch)
      .run();
    return (await this.findById(reservationId))?.reservation_state === "finalized";
  }

  async release(reservationId: string, writeEpoch: number): Promise<boolean> {
    await this.database
      .prepare(
        `UPDATE operations_meter_reservations
         SET reservation_state = 'released'
         WHERE reservation_id = ? AND reservation_state = 'reserved' AND write_epoch = ?`,
      )
      .bind(reservationId, writeEpoch)
      .run();
    return (await this.findById(reservationId))?.reservation_state === "released";
  }

  private findReservation(input: ReserveMeterInput) {
    return firstParsed(
      this.database
        .prepare(
          `SELECT reservation_id, reservation_state, reserved_units, write_epoch
           FROM operations_meter_reservations
           WHERE meter_id = ? AND window_start_utc = ? AND request_digest = ?
             AND release_digest = ?`,
        )
        .bind(input.meterId, input.windowStartUtc, input.requestDigest, input.releaseDigest),
      reservationRowSchema,
    );
  }

  private findById(reservationId: string) {
    return firstParsed(
      this.database
        .prepare(
          `SELECT reservation_id, reservation_state, reserved_units, write_epoch
           FROM operations_meter_reservations WHERE reservation_id = ?`,
        )
        .bind(reservationId),
      reservationRowSchema,
    );
  }
}

const RESERVE_SQL = `INSERT INTO operations_meter_reservations (
  reservation_id, meter_id, window_start_utc, request_digest, release_digest, provider_digest,
  write_epoch, reserved_units, finalized_units, reservation_state, reserved_at, expires_at
)
SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', ?, ?
WHERE EXISTS (
  SELECT 1 FROM operations_write_fence
  WHERE environment = ? AND mode = 'OPEN' AND write_epoch = ?
    AND (expires_at IS NULL OR expires_at > ?)
)
AND EXISTS (
  SELECT 1
  FROM operations_meter_windows AS window
  WHERE window.meter_id = ? AND window.window_start_utc = ?
    AND window.window_start_utc <= ? AND window.window_end_utc > ?
    AND window.platform_observed_at >= ?
    AND window.immediate_observed_at >= ?
    AND (? = 0 OR window.reset_confirmed = 1)
    AND (
      MAX(
        COALESCE(window.platform_observed, 0) + window.unrelated_baseline,
        COALESCE(window.immediate_observed, 0) + window.unrelated_baseline,
        window.local_finalized + window.unrelated_baseline
      )
      + window.uncertainty_reserve
      + COALESCE((
        SELECT SUM(reserved_units)
        FROM operations_meter_reservations AS reservation
        WHERE reservation.meter_id = window.meter_id
          AND reservation.window_start_utc = window.window_start_utc
          AND reservation.reservation_state = 'reserved'
          AND reservation.expires_at > ?
      ), 0)
      + ?
    ) < ?
)
AND NOT EXISTS (
  SELECT 1 FROM operations_kill_switches
  WHERE active = 1 AND (
    scope_kind = 'global' OR
    (scope_kind = 'provider' AND scope_digest = ?)
  )
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
