import type { Database } from "../db/database";
import { scanDeletionBindings } from "../privacy/inventory";
import { GuardCleanupRepository } from "./guard-cleanup-repository";
import { type PendingDelete, requireSingleIntentMutation } from "./intent-repository";

export class DeletionCleanupRepository {
  private readonly guard: GuardCleanupRepository;

  constructor(private readonly database: Database) {
    this.guard = new GuardCleanupRepository(database);
  }

  async writeTombstone(intent: PendingDelete, writeEpoch: number, now: number): Promise<void> {
    const bucket = Math.floor(now / 3_600_000) * 3_600_000;
    const expiresAt = now + 48 * 60 * 60 * 1_000;
    const replayExpiresAt = now + 24 * 60 * 60 * 1_000;
    const result = await this.database
      .prepare(
        `INSERT INTO journey_tombstones (
          journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket,
          write_epoch, replay_status, expires_at, replay_expires_at
        )
        SELECT journey_hmac_digest, delete_request_digest, 'deleted', ?, ?, 204, ?, ?
        FROM pending_delete_intents
        WHERE journey_hmac_digest = ? AND delete_request_digest = ?
          AND session_binding_digest = ? AND audit_event_id = ?
          AND stage IN ('fenced', 'tombstoned')
        ON CONFLICT(journey_hmac_digest) DO UPDATE
        SET coarse_utc_bucket = CASE
              WHEN journey_tombstones.expires_at <= ? THEN excluded.coarse_utc_bucket
              ELSE journey_tombstones.coarse_utc_bucket
            END,
            delete_request_digest = excluded.delete_request_digest,
            expires_at = CASE
              WHEN journey_tombstones.expires_at <= ? THEN excluded.expires_at
              ELSE journey_tombstones.expires_at
            END,
            replay_expires_at = CASE
              WHEN journey_tombstones.expires_at <= ? THEN excluded.replay_expires_at
              ELSE journey_tombstones.replay_expires_at
            END
        WHERE journey_tombstones.delete_request_digest = excluded.delete_request_digest
          AND journey_tombstones.terminal_type = excluded.terminal_type
          AND journey_tombstones.write_epoch = excluded.write_epoch
          AND journey_tombstones.replay_status = excluded.replay_status`,
      )
      .bind(
        bucket,
        writeEpoch,
        expiresAt,
        replayExpiresAt,
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        intent.session_binding_digest,
        intent.audit_event_id,
        now,
        now,
        now,
      )
      .run();
    requireSingleIntentMutation(result);
  }

  async cleanupBindings(intent: PendingDelete): Promise<void> {
    if (this.database.batch === undefined) {
      throw new Error("Deletion cleanup requires atomic D1 batches");
    }
    await this.database.batch([
      this.database
        .prepare(
          `DELETE FROM feedback_reaction_outcomes
           WHERE capability_digest IN (
             SELECT capability_digest FROM feedback_eligibility WHERE journey_hmac_digest = ?
           )
           AND EXISTS (
             SELECT 1 FROM pending_delete_intents
             WHERE journey_hmac_digest = ? AND delete_request_digest = ?
               AND session_binding_digest = ? AND audit_event_id = ?
               AND stage = 'object-deleted'
           )`,
        )
        .bind(
          intent.journey_hmac_digest,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
      this.database
        .prepare(
          `DELETE FROM feedback_eligibility
           WHERE journey_hmac_digest = ?
             AND EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                 AND session_binding_digest = ? AND audit_event_id = ?
                 AND stage = 'object-deleted'
             )`,
        )
        .bind(
          intent.journey_hmac_digest,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
      ...this.guard.statements(intent),
      this.database
        .prepare(
          `DELETE FROM budget_reservations
           WHERE request_digest = ?
             AND EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                 AND session_binding_digest = ? AND audit_event_id = ?
                 AND stage = 'object-deleted'
             )`,
        )
        .bind(
          intent.journey_hmac_digest,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
      this.database
        .prepare(
          `DELETE FROM outbox_events
           WHERE aggregate_digest = ?
             AND EXISTS (
               SELECT 1 FROM pending_delete_intents
               WHERE journey_hmac_digest = ? AND delete_request_digest = ?
                 AND session_binding_digest = ? AND audit_event_id = ?
                 AND stage = 'object-deleted'
             )`,
        )
        .bind(
          intent.journey_hmac_digest,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
    ]);
  }

  inventory(intent: PendingDelete): Promise<readonly string[]> {
    return scanDeletionBindings(this.database, intent);
  }

  async finalizeCompletion(intent: PendingDelete, writeEpoch: number, now: number): Promise<void> {
    if (this.database.batch === undefined) {
      throw new Error("Deletion completion requires atomic D1 batches");
    }
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT OR IGNORE INTO audit_events (
            audit_event_id, actor_role, action_code, result_code, policy_digest, deploy_digest,
            occurred_at, expires_at
          )
          SELECT ?, 'system', 'journey-delete', 'complete', NULL, NULL, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM pending_delete_intents AS intent
            JOIN journey_tombstones AS tombstone
              ON tombstone.journey_hmac_digest = intent.journey_hmac_digest
            WHERE intent.journey_hmac_digest = ? AND intent.delete_request_digest = ?
              AND intent.session_binding_digest = ? AND intent.audit_event_id = ?
              AND intent.stage = 'cleaned'
              AND tombstone.delete_request_digest = intent.delete_request_digest
              AND tombstone.terminal_type = 'deleted' AND tombstone.write_epoch = ?
              AND tombstone.replay_status = 204
          )`,
        )
        .bind(
          intent.audit_event_id,
          now,
          now + 7 * 24 * 60 * 60 * 1_000,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
          writeEpoch,
        ),
      this.database
        .prepare(
          `INSERT INTO journey_tombstones (
            journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket,
            write_epoch, replay_status, expires_at, replay_expires_at
          )
          SELECT intent.journey_hmac_digest, intent.delete_request_digest, 'deleted',
            CAST(audit.occurred_at / 3600000 AS INTEGER) * 3600000, ?, 204,
            audit.occurred_at + 48 * 60 * 60 * 1000,
            audit.occurred_at + 24 * 60 * 60 * 1000
          FROM pending_delete_intents AS intent
          JOIN audit_events AS audit ON audit.audit_event_id = intent.audit_event_id
            AND audit.actor_role = 'system' AND audit.action_code = 'journey-delete'
            AND audit.result_code = 'complete' AND audit.policy_digest IS NULL
            AND audit.deploy_digest IS NULL
            AND audit.expires_at = audit.occurred_at + 7 * 24 * 60 * 60 * 1000
          WHERE intent.journey_hmac_digest = ? AND intent.delete_request_digest = ?
            AND intent.session_binding_digest = ? AND intent.audit_event_id = ?
            AND intent.stage = 'cleaned'
          ON CONFLICT(journey_hmac_digest) DO UPDATE
          SET coarse_utc_bucket = excluded.coarse_utc_bucket,
            delete_request_digest = excluded.delete_request_digest,
            expires_at = excluded.expires_at,
            replay_expires_at = excluded.replay_expires_at
          WHERE journey_tombstones.delete_request_digest = excluded.delete_request_digest
            AND journey_tombstones.terminal_type = excluded.terminal_type
            AND journey_tombstones.write_epoch = excluded.write_epoch
            AND journey_tombstones.replay_status = excluded.replay_status`,
        )
        .bind(
          writeEpoch,
          intent.journey_hmac_digest,
          intent.delete_request_digest,
          intent.session_binding_digest,
          intent.audit_event_id,
        ),
    ]);
    requireSingleIntentMutation(results[1]);
  }
}
