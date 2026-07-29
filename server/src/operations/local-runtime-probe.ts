import { buildAsyncMessage, parsePoisonMessage } from "../async/message";
import type { Database } from "../db/database";

const LOCAL_DLQ = "somewhere-events-dlq-local";
const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

type QueueProducer = Readonly<{
  sendBatch(messages: Iterable<MessageSendRequest<unknown>>): Promise<unknown>;
}>;

export async function enqueueLocalQueueProbes(queue: QueueProducer, now: number): Promise<void> {
  const valid = await buildAsyncMessage({
    eventType: "journey.activation.repair",
    occurredAt: now,
    subjectDigest: "0".repeat(64),
    writeEpoch: 1,
  });
  await queue.sendBatch([
    { body: valid },
    { body: { probe: "task14-invalid-queue", schemaVersion: 0 } },
  ]);
}

export async function recordLocalDlqDelivery(
  batch: MessageBatch<unknown>,
  database: Database,
  now: number,
): Promise<void> {
  if (batch.queue !== LOCAL_DLQ || batch.messages.length === 0) {
    throw new TypeError("Local DLQ receipt requires a non-empty local DLQ batch");
  }
  for (const message of batch.messages) {
    parsePoisonMessage(message.body);
    const receiptId = `audit_v1.${crypto.randomUUID().replaceAll("-", "")}`;
    await database
      .prepare(
        `INSERT INTO audit_events (
           audit_event_id, actor_role, action_code, result_code,
           policy_digest, deploy_digest, occurred_at, expires_at
         ) VALUES (?, 'system', 'dlq-delivery', 'poison-received', NULL, NULL, ?, ?)`,
      )
      .bind(receiptId, now, now + AUDIT_RETENTION_MS)
      .run();
    message.ack();
  }
}
