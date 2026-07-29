import { z } from "zod";

import type { Database } from "../db/database";
import { type AsyncMessage, buildAsyncMessage } from "./message";
import { cleanupRetention, RETENTION_MS, type RetentionCleanupCounts } from "./retention";

const inboxRowSchema = z
  .object({
    event_digest: z.string(),
    result_code: z.string(),
  })
  .strict();

const tombstoneRowSchema = z
  .object({
    expires_at: z.number(),
    write_epoch: z.number(),
  })
  .strict();

const receiptRowSchema = z
  .object({
    expires_at: z.number(),
    receipt_id: z.string(),
    receipt_state: z.enum(["prepared", "activated", "invalidated"]),
  })
  .strict();

const outboxRowSchema = z
  .object({
    aggregate_digest: z.string(),
    created_at: z.number(),
    event_digest: z.string(),
    event_id: z.string(),
    event_type: z.string(),
    write_epoch: z.number(),
  })
  .strict();

export type AsyncConsumeResult =
  | Readonly<{ kind: "applied"; resultCode: string }>
  | Readonly<{ kind: "ignored"; resultCode: string }>
  | Readonly<{ kind: "tombstoned" }>
  | Readonly<{ kind: "duplicate"; resultCode: string }>;

export class AsyncEventConflictError extends Error {
  override readonly name = "AsyncEventConflictError";

  constructor() {
    super("An event ID was replayed with a different digest");
  }
}

export class UnsupportedAsyncEventTypeError extends Error {
  override readonly name = "UnsupportedAsyncEventTypeError";

  constructor() {
    super("Unsupported asynchronous event type");
  }
}

export class AsyncD1Repository {
  constructor(
    private readonly database: Database,
    private readonly currentWriteEpoch = 1,
  ) {}

  async consume(message: AsyncMessage, now: number): Promise<AsyncConsumeResult> {
    const prior = inboxRowSchema
      .nullable()
      .parse(
        await this.database
          .prepare("SELECT event_digest, result_code FROM inbox_events WHERE event_id = ?")
          .bind(message.eventId)
          .first(),
      );
    if (prior !== null) {
      if (prior.event_digest !== message.eventDigest) {
        throw new AsyncEventConflictError();
      }
      await this.acknowledgeOutbox(message.eventDigest, now);
      return { kind: "duplicate", resultCode: prior.result_code };
    }

    const tombstone = tombstoneRowSchema
      .nullable()
      .parse(
        await this.database
          .prepare(
            "SELECT write_epoch, expires_at FROM journey_tombstones WHERE journey_hmac_digest = ? AND expires_at > ?",
          )
          .bind(message.subjectDigest, now)
          .first(),
      );
    if (tombstone !== null) {
      await this.recordResult(message, "tombstoned", now);
      await this.acknowledgeOutbox(message.eventDigest, now);
      return { kind: "tombstoned" };
    }
    if (message.writeEpoch !== this.currentWriteEpoch) {
      await this.recordResult(message, "stale_epoch", now);
      await this.acknowledgeOutbox(message.eventDigest, now);
      return { kind: "ignored", resultCode: "stale_epoch" };
    }

    const result = await this.applyMessage(message, now);
    await this.recordResult(message, result.resultCode, now);
    await this.acknowledgeOutbox(message.eventDigest, now);
    return result;
  }

  async listPendingOutbox(now: number, limit: number): Promise<readonly AsyncMessage[]> {
    const boundedLimit = Math.min(100, Math.max(0, Math.trunc(limit)));
    if (boundedLimit === 0) {
      return [];
    }
    const result = await this.database
      .prepare(
        "SELECT event_id, aggregate_digest, event_digest, event_type, write_epoch, created_at FROM outbox_events WHERE delivery_state = 'pending' AND expires_at > ? ORDER BY created_at, event_id LIMIT ?",
      )
      .bind(now, boundedLimit)
      .all();
    return Promise.all(
      z
        .array(outboxRowSchema)
        .parse(result.results)
        .map(async (row) => {
          const message = await buildAsyncMessage({
            eventType: normalizeEventType(row.event_type),
            occurredAt: row.created_at,
            subjectDigest: row.aggregate_digest,
            writeEpoch: row.write_epoch,
          });
          if (message.eventId !== row.event_id || message.eventDigest !== row.event_digest) {
            throw new AsyncEventConflictError();
          }
          return message;
        }),
    );
  }

  async enqueue(message: AsyncMessage, now: number): Promise<void> {
    await this.database
      .prepare(
        "INSERT INTO outbox_events (event_id, aggregate_digest, event_digest, event_type, delivery_state, write_epoch, created_at, acknowledged_at, expires_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, ?)",
      )
      .bind(
        message.eventId,
        message.subjectDigest,
        message.eventDigest,
        message.eventType,
        message.writeEpoch,
        message.occurredAt,
        now + RETENTION_MS.inboxOutbox,
      )
      .run();
  }

  async cleanupRetention(now: number): Promise<RetentionCleanupCounts> {
    return cleanupRetention(this.database, now);
  }

  private async applyMessage(
    message: AsyncMessage,
    now: number,
  ): Promise<Readonly<{ kind: "applied" | "ignored"; resultCode: string }>> {
    switch (message.eventType) {
      case "journey.activation.repair":
        return this.repairActivation(message.subjectDigest, now);
      case "receipt.prepared.cleanup": {
        const counts = await this.cleanupRetention(now);
        return {
          kind: "applied",
          resultCode: counts.preparedReceipts === 0 ? "cleanup_noop" : "receipt_expired",
        };
      }
      case "journey.deletion.reconcile":
      case "journey.expire":
      case "journey.feedback.schedule":
      case "session.expire":
        return { kind: "ignored", resultCode: "authority_deferred" };
      default:
        return assertNever(message.eventType);
    }
  }

  private async repairActivation(
    subjectDigest: string,
    now: number,
  ): Promise<Readonly<{ kind: "applied" | "ignored"; resultCode: string }>> {
    const receipt = receiptRowSchema
      .nullable()
      .parse(
        await this.database
          .prepare(
            "SELECT receipt_id, receipt_state, expires_at FROM selection_receipts WHERE randomness_digest = ?",
          )
          .bind(subjectDigest)
          .first(),
      );
    if (receipt === null) {
      return { kind: "ignored", resultCode: "receipt_missing" };
    }
    if (receipt.receipt_state !== "prepared") {
      return { kind: "ignored", resultCode: `receipt_${receipt.receipt_state}` };
    }
    if (receipt.expires_at <= now) {
      return { kind: "ignored", resultCode: "receipt_expired" };
    }
    await this.database
      .prepare(
        "UPDATE selection_receipts SET receipt_state = 'activated', activated_at = ?, expires_at = ? WHERE receipt_id = ? AND receipt_state = 'prepared' AND expires_at > ?",
      )
      .bind(now, now + RETENTION_MS.sealedReceipt, receipt.receipt_id, now)
      .run();
    return { kind: "applied", resultCode: "receipt_activated" };
  }

  private async recordResult(
    message: AsyncMessage,
    resultCode: string,
    now: number,
  ): Promise<void> {
    await this.database
      .prepare(
        "INSERT INTO inbox_events (event_id, event_digest, event_type, result_code, write_epoch, received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        message.eventId,
        message.eventDigest,
        message.eventType,
        resultCode,
        message.writeEpoch,
        now,
        now + RETENTION_MS.inboxOutbox,
      )
      .run();
  }

  private async acknowledgeOutbox(eventDigest: string, now: number): Promise<void> {
    await this.database
      .prepare(
        "UPDATE outbox_events SET delivery_state = 'delivered', acknowledged_at = ?, expires_at = ? WHERE event_digest = ? AND delivery_state = 'pending'",
      )
      .bind(now, now + RETENTION_MS.inboxOutbox, eventDigest)
      .run();
  }
}

function assertNever(_value: never): never {
  throw new UnsupportedAsyncEventTypeError();
}

function normalizeEventType(
  value: string,
):
  | "journey.activation.repair"
  | "journey.feedback.schedule"
  | "journey.expire"
  | "session.expire"
  | "receipt.prepared.cleanup"
  | "journey.deletion.reconcile" {
  switch (value) {
    case "journey.activated":
    case "journey.activation.repair":
      return "journey.activation.repair";
    case "journey.feedback.schedule":
    case "journey.expire":
    case "session.expire":
    case "receipt.prepared.cleanup":
    case "journey.deletion.reconcile":
      return value;
    default:
      throw new UnsupportedAsyncEventTypeError();
  }
}
