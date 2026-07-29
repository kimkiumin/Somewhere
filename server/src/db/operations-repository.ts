import { z } from "zod";
import { allParsed, type Database, firstParsed, parseBoundary } from "./database";
import {
  nonnegativeIntegerSchema,
  opaqueIdSchema,
  positiveIntegerSchema,
  sha256DigestSchema,
} from "./values";

const auditSchema = z
  .object({
    audit_event_id: opaqueIdSchema,
    actor_role: z.enum(["system", "operator", "deployer"]),
    action_code: z.string().min(1).max(64),
    result_code: z.string().min(1).max(64),
    policy_digest: sha256DigestSchema.nullable(),
    deploy_digest: sha256DigestSchema.nullable(),
    occurred_at: positiveIntegerSchema,
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const budgetWindowSchema = z
  .object({
    budget_window_id: opaqueIdSchema,
    meter_code: z.string().min(1).max(48),
    window_start: positiveIntegerSchema,
    window_end: positiveIntegerSchema,
    authority_digest: sha256DigestSchema,
    finalized_units: nonnegativeIntegerSchema,
  })
  .strict()
  .readonly();

const reservationSchema = z
  .object({
    reservation_id: opaqueIdSchema,
    budget_window_id: opaqueIdSchema,
    request_digest: sha256DigestSchema,
    units: positiveIntegerSchema,
    reservation_state: z.enum(["outstanding", "finalized", "released"]),
    reserved_at: positiveIntegerSchema,
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const inboxSchema = z
  .object({
    event_id: opaqueIdSchema,
    event_digest: sha256DigestSchema,
    event_type: z.string().min(1).max(64),
    result_code: z.string().min(1).max(64),
    write_epoch: positiveIntegerSchema,
    received_at: positiveIntegerSchema,
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const outboxSchema = z
  .object({
    event_id: opaqueIdSchema,
    aggregate_digest: sha256DigestSchema,
    event_digest: sha256DigestSchema,
    event_type: z.string().min(1).max(64),
    delivery_state: z.enum(["pending", "delivered", "failed"]),
    write_epoch: positiveIntegerSchema,
    created_at: positiveIntegerSchema,
    acknowledged_at: positiveIntegerSchema.nullable(),
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

const tombstoneSchema = z
  .object({
    journey_hmac_digest: sha256DigestSchema,
    delete_request_digest: sha256DigestSchema,
    terminal_type: z.enum(["deleted", "expired"]),
    coarse_utc_bucket: positiveIntegerSchema,
    write_epoch: positiveIntegerSchema,
    replay_status: z.literal(204),
    expires_at: positiveIntegerSchema,
  })
  .strict()
  .readonly();

export type AuditRecord = z.infer<typeof auditSchema>;
export type BudgetWindowRecord = z.infer<typeof budgetWindowSchema>;
export type BudgetReservationRecord = z.infer<typeof reservationSchema>;
export type InboxRecord = z.infer<typeof inboxSchema>;
export type OutboxRecord = z.infer<typeof outboxSchema>;
export type TombstoneRecord = z.infer<typeof tombstoneSchema>;

export class OperationsRepository {
  constructor(private readonly database: Database) {}

  async appendAudit(value: unknown): Promise<AuditRecord> {
    const record = parseBoundary(auditSchema, value);
    await this.database
      .prepare(
        "INSERT INTO audit_events (audit_event_id, actor_role, action_code, result_code, policy_digest, deploy_digest, occurred_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.audit_event_id,
        record.actor_role,
        record.action_code,
        record.result_code,
        record.policy_digest,
        record.deploy_digest,
        record.occurred_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  async putBudgetWindow(value: unknown): Promise<BudgetWindowRecord> {
    const record = parseBoundary(budgetWindowSchema, value);
    await this.database
      .prepare(
        "INSERT INTO budget_windows (budget_window_id, meter_code, window_start, window_end, authority_digest, finalized_units) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(budget_window_id) DO UPDATE SET authority_digest = excluded.authority_digest, finalized_units = excluded.finalized_units",
      )
      .bind(
        record.budget_window_id,
        record.meter_code,
        record.window_start,
        record.window_end,
        record.authority_digest,
        record.finalized_units,
      )
      .run();
    return record;
  }

  async insertReservation(value: unknown): Promise<BudgetReservationRecord> {
    const record = parseBoundary(reservationSchema, value);
    await this.database
      .prepare(
        "INSERT INTO budget_reservations (reservation_id, budget_window_id, request_digest, units, reservation_state, reserved_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.reservation_id,
        record.budget_window_id,
        record.request_digest,
        record.units,
        record.reservation_state,
        record.reserved_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  listOutstandingReservations(
    budgetWindowId: string,
    now: number,
  ): Promise<readonly BudgetReservationRecord[]> {
    return allParsed(
      this.database
        .prepare(
          "SELECT reservation_id, budget_window_id, request_digest, units, reservation_state, reserved_at, expires_at FROM budget_reservations WHERE budget_window_id = ? AND reservation_state = 'outstanding' AND expires_at > ? ORDER BY reserved_at LIMIT 100",
        )
        .bind(budgetWindowId, now),
      reservationSchema,
    );
  }

  async recordInbox(value: unknown): Promise<InboxRecord> {
    const record = parseBoundary(inboxSchema, value);
    await this.database
      .prepare(
        "INSERT INTO inbox_events (event_id, event_digest, event_type, result_code, write_epoch, received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.event_id,
        record.event_digest,
        record.event_type,
        record.result_code,
        record.write_epoch,
        record.received_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  async enqueueOutbox(value: unknown): Promise<OutboxRecord> {
    const record = parseBoundary(outboxSchema, value);
    await this.database
      .prepare(
        "INSERT INTO outbox_events (event_id, aggregate_digest, event_digest, event_type, delivery_state, write_epoch, created_at, acknowledged_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        record.event_id,
        record.aggregate_digest,
        record.event_digest,
        record.event_type,
        record.delivery_state,
        record.write_epoch,
        record.created_at,
        record.acknowledged_at,
        record.expires_at,
      )
      .run();
    return record;
  }

  async putTombstone(value: unknown): Promise<TombstoneRecord> {
    const record = parseBoundary(tombstoneSchema, value);
    await this.database
      .prepare(
        "INSERT INTO journey_tombstones (journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(journey_hmac_digest) DO UPDATE SET delete_request_digest = excluded.delete_request_digest, terminal_type = excluded.terminal_type, coarse_utc_bucket = excluded.coarse_utc_bucket, write_epoch = excluded.write_epoch, replay_status = excluded.replay_status, expires_at = excluded.expires_at WHERE excluded.write_epoch >= journey_tombstones.write_epoch",
      )
      .bind(
        record.journey_hmac_digest,
        record.delete_request_digest,
        record.terminal_type,
        record.coarse_utc_bucket,
        record.write_epoch,
        record.replay_status,
        record.expires_at,
      )
      .run();
    return record;
  }

  findTombstone(journeyDigest: string, now: number): Promise<TombstoneRecord | null> {
    return firstParsed(
      this.database
        .prepare(
          "SELECT journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at FROM journey_tombstones WHERE journey_hmac_digest = ? AND expires_at > ?",
        )
        .bind(journeyDigest, now),
      tombstoneSchema,
    );
  }
}
