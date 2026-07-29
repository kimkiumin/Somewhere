import { z } from "zod";
import { type Database, firstParsed } from "../db/database";
import { scanDeletionBindings } from "../privacy/inventory";
import { randomBase64Url } from "../security/tokens";
import type { DeletionStage } from "./saga";

const pendingDeleteSchema = z
  .object({
    audit_event_id: z.string().min(20).max(96),
    delete_request_digest: z.string().length(64),
    expires_at: z.number().int().positive(),
    journey_hmac_digest: z.string().length(64),
    requested_at: z.number().int().positive(),
    session_binding_digest: z.string().length(64),
    stage: z.enum(["pending", "tombstoned", "object-deleted", "cleaned"]),
  })
  .strict()
  .readonly();

export type PendingDelete = z.infer<typeof pendingDeleteSchema>;

export class DeletionRepository {
  constructor(private readonly database: Database) {}

  async prepare(
    input: Readonly<{
      deleteRequestDigest: string;
      journeyDigest: string;
      now: number;
      sessionBindingDigest: string;
    }>,
  ): Promise<PendingDelete> {
    const auditEventId = `audit_v1.${randomBase64Url(16)}`;
    await this.database
      .prepare(
        "INSERT OR IGNORE INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      )
      .bind(
        input.journeyDigest,
        input.deleteRequestDigest,
        input.sessionBindingDigest,
        auditEventId,
        input.now,
        input.now + 48 * 60 * 60 * 1_000,
      )
      .run();
    const pending = await this.find(input.journeyDigest, input.now);
    if (pending === undefined) {
      throw new Error("Deletion intent was not durably prepared");
    }
    return pending;
  }

  async find(journeyDigest: string, now: number): Promise<PendingDelete | undefined> {
    return (
      (await firstParsed(
        this.database
          .prepare(
            "SELECT journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, stage, requested_at, expires_at FROM pending_delete_intents WHERE journey_hmac_digest = ? AND expires_at > ?",
          )
          .bind(journeyDigest, now),
        pendingDeleteSchema,
      )) ?? undefined
    );
  }

  async advance(journeyDigest: string, stage: DeletionStage): Promise<void> {
    await this.database
      .prepare("UPDATE pending_delete_intents SET stage = ? WHERE journey_hmac_digest = ?")
      .bind(stage, journeyDigest)
      .run();
  }

  async writeTombstone(intent: PendingDelete): Promise<void> {
    const bucket = Math.floor(intent.requested_at / 3_600_000) * 3_600_000;
    await this.database
      .prepare(
        "INSERT INTO journey_tombstones (journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at, replay_expires_at) VALUES (?, ?, 'deleted', ?, 2, 204, ?, ?) ON CONFLICT(journey_hmac_digest) DO NOTHING",
      )
      .bind(
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        bucket,
        intent.requested_at + 48 * 60 * 60 * 1_000,
        intent.requested_at + 24 * 60 * 60 * 1_000,
      )
      .run();
  }

  async cleanupBindings(intent: PendingDelete): Promise<void> {
    await this.database
      .prepare(
        "DELETE FROM feedback_reaction_outcomes WHERE capability_digest IN (SELECT capability_digest FROM feedback_eligibility WHERE journey_hmac_digest = ?)",
      )
      .bind(intent.journey_hmac_digest)
      .run();
    await this.database
      .prepare("DELETE FROM feedback_eligibility WHERE journey_hmac_digest = ?")
      .bind(intent.journey_hmac_digest)
      .run();
    await this.database
      .prepare(
        "DELETE FROM browser_session_guards WHERE session_binding_digest = ? AND active_journey_digest = ?",
      )
      .bind(intent.session_binding_digest, intent.journey_hmac_digest)
      .run();
    await this.database
      .prepare("DELETE FROM budget_reservations WHERE request_digest = ?")
      .bind(intent.journey_hmac_digest)
      .run();
    await this.database
      .prepare("DELETE FROM outbox_events WHERE aggregate_digest = ?")
      .bind(intent.journey_hmac_digest)
      .run();
  }

  inventory(journeyDigest: string): Promise<readonly string[]> {
    return scanDeletionBindings(this.database, journeyDigest);
  }

  async appendAudit(intent: PendingDelete, now: number): Promise<void> {
    await this.database
      .prepare(
        "INSERT OR IGNORE INTO audit_events (audit_event_id, actor_role, action_code, result_code, policy_digest, deploy_digest, occurred_at, expires_at) VALUES (?, 'system', 'journey-delete', 'complete', NULL, NULL, ?, ?)",
      )
      .bind(intent.audit_event_id, now, now + 7 * 24 * 60 * 60 * 1_000)
      .run();
  }

  async complete(journeyDigest: string): Promise<void> {
    await this.database
      .prepare("DELETE FROM pending_delete_intents WHERE journey_hmac_digest = ?")
      .bind(journeyDigest)
      .run();
  }
}
