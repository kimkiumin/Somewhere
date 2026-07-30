import { z } from "zod";
import { type Database, firstParsed } from "../db/database";
import { randomBase64Url } from "../security/tokens";
import type { DeletionStage } from "./saga";

const pendingDeleteSchema = z
  .object({
    audit_event_id: z.string().min(20).max(96),
    delete_request_digest: z.string().length(64),
    expected_sequence: z.number().int().nonnegative().nullable(),
    expires_at: z.number().int().positive(),
    journey_hmac_digest: z.string().length(64),
    requested_at: z.number().int().positive(),
    session_binding_digest: z.string().length(64),
    stage: z.enum(["pending", "fenced", "tombstoned", "object-deleted", "cleaned"]),
  })
  .strict()
  .readonly();

export type PendingDelete = z.infer<typeof pendingDeleteSchema>;

export function requireSingleIntentMutation(result: unknown): void {
  const changes =
    typeof result === "object" &&
    result !== null &&
    "meta" in result &&
    typeof result.meta === "object" &&
    result.meta !== null &&
    "changes" in result.meta
      ? result.meta.changes
      : undefined;
  if (changes !== 1) {
    throw new Error("Deletion intent ownership or stage changed");
  }
}

function priorStage(stage: DeletionStage): DeletionStage {
  switch (stage) {
    case "pending":
      throw new Error("Deletion intent cannot advance to pending");
    case "tombstoned":
      return "fenced";
    case "fenced":
      return "pending";
    case "object-deleted":
      return "tombstoned";
    case "cleaned":
      return "object-deleted";
  }
}

export class DeletionIntentRepository {
  constructor(private readonly database: Database) {}

  async prepare(
    input: Readonly<{
      deleteRequestDigest: string;
      expectedSequence: number;
      journeyDigest: string;
      now: number;
      sessionBindingDigest: string;
    }>,
  ): Promise<PendingDelete> {
    const auditEventId = `audit_v1.${randomBase64Url(16)}`;
    if (this.database.batch === undefined) {
      throw new Error("Deletion intent preparation requires atomic D1 batches");
    }
    await this.database.batch([
      this.database
        .prepare(
          "DELETE FROM pending_delete_intents WHERE journey_hmac_digest = ? AND stage = 'pending' AND expected_sequence IS NULL AND expires_at <= ?",
        )
        .bind(input.journeyDigest, input.now),
      this.database
        .prepare(
          "INSERT OR IGNORE INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, expected_sequence, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        )
        .bind(
          input.journeyDigest,
          input.deleteRequestDigest,
          input.sessionBindingDigest,
          auditEventId,
          input.expectedSequence,
          input.now,
          input.now + 48 * 60 * 60 * 1_000,
        ),
    ]);
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
            "SELECT journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, expected_sequence, stage, requested_at, expires_at FROM pending_delete_intents WHERE journey_hmac_digest = ? AND (expected_sequence IS NOT NULL OR expires_at > ? OR stage <> 'pending')",
          )
          .bind(journeyDigest, now),
        pendingDeleteSchema,
      )) ?? undefined
    );
  }

  async advance(intent: PendingDelete, stage: DeletionStage): Promise<void> {
    const result = await this.database
      .prepare(
        "UPDATE pending_delete_intents SET stage = ? WHERE journey_hmac_digest = ? AND delete_request_digest = ? AND session_binding_digest = ? AND audit_event_id = ? AND stage = ?",
      )
      .bind(
        stage,
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        intent.session_binding_digest,
        intent.audit_event_id,
        priorStage(stage),
      )
      .run();
    requireSingleIntentMutation(result);
  }

  async abandonPending(intent: PendingDelete): Promise<void> {
    const result = await this.database
      .prepare(
        "DELETE FROM pending_delete_intents WHERE journey_hmac_digest = ? AND delete_request_digest = ? AND session_binding_digest = ? AND audit_event_id = ? AND expected_sequence = ? AND stage = 'pending'",
      )
      .bind(
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        intent.session_binding_digest,
        intent.audit_event_id,
        intent.expected_sequence,
      )
      .run();
    requireSingleIntentMutation(result);
  }

  async complete(intent: PendingDelete): Promise<void> {
    const result = await this.database
      .prepare(
        "DELETE FROM pending_delete_intents WHERE journey_hmac_digest = ? AND delete_request_digest = ? AND session_binding_digest = ? AND audit_event_id = ? AND stage = 'cleaned'",
      )
      .bind(
        intent.journey_hmac_digest,
        intent.delete_request_digest,
        intent.session_binding_digest,
        intent.audit_event_id,
      )
      .run();
    requireSingleIntentMutation(result);
  }
}
