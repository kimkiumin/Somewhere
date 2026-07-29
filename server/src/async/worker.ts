import {
  ASYNC_MESSAGE_MAX_BYTES,
  type AsyncMessage,
  buildInvalidPoisonMessage,
  buildPoisonMessage,
  parseAsyncMessage,
  retryDecision,
  serializedBytes,
} from "./message";
import type { AsyncConsumeResult } from "./repository";
import type { RetentionCleanupCounts } from "./retention";

const HOUR = 60 * 60 * 1_000;
const MAX_BATCH_COUNT = 100;
const MAX_BATCH_BYTES = 256 * 1_024;

type AsyncConsumePort = Readonly<{
  consume(message: AsyncMessage, now: number): Promise<AsyncConsumeResult>;
}>;

type AsyncRepositoryPort = Readonly<{
  cleanupRetention(now: number): Promise<RetentionCleanupCounts>;
  listPendingOutbox(now: number, limit: number): Promise<readonly AsyncMessage[]>;
}>;

type QueueProducerPort = Readonly<{
  metrics(): Promise<QueueMetrics>;
  sendBatch(messages: Iterable<MessageSendRequest<AsyncMessage>>): Promise<unknown>;
}>;

type DlqPort = Readonly<{
  send(body: unknown): Promise<unknown>;
}>;

export type BacklogState = "open" | "warn" | "close" | "page";

export class QueueBacklogPolicy {
  evaluate(oldestAgeMs: number): BacklogState {
    if (!Number.isFinite(oldestAgeMs) || oldestAgeMs < 0) {
      throw new RangeError("Queue oldest age must be a nonnegative finite number");
    }
    if (oldestAgeMs >= 20 * HOUR) {
      return "page";
    }
    if (oldestAgeMs >= 18 * HOUR) {
      return "close";
    }
    if (oldestAgeMs >= 12 * HOUR) {
      return "warn";
    }
    return "open";
  }
}

export async function consumeQueueBatch(
  input: Readonly<{
    batch: MessageBatch<unknown>;
    dlq: DlqPort;
    now: number;
    repository: AsyncConsumePort;
    retryDelaySeconds?: number;
  }>,
): Promise<void> {
  if (input.batch.messages.length > MAX_BATCH_COUNT) {
    throw new RangeError("Queue batch cannot exceed 100 messages");
  }
  for (const queued of input.batch.messages) {
    let parsed: AsyncMessage | undefined;
    try {
      parsed = await parseAsyncMessage(queued.body);
      await input.repository.consume(parsed, input.now);
      queued.ack();
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      const decision = retryDecision(queued.attempts);
      switch (decision.kind) {
        case "retry":
          queued.retry({ delaySeconds: input.retryDelaySeconds ?? decision.delaySeconds });
          continue;
        case "poison":
          if (parsed === undefined) {
            await input.dlq.send(await buildInvalidPoisonMessage(queued.body, input.now));
            queued.ack();
            continue;
          }
          await input.dlq.send(
            buildPoisonMessage({
              failedAt: input.now,
              failureCode: "consumer_failed",
              message: parsed,
            }),
          );
          queued.ack();
      }
    }
  }
}

export async function reconcileScheduledWork(
  input: Readonly<{
    now: number;
    queue: QueueProducerPort;
    repository: AsyncRepositoryPort;
  }>,
): Promise<
  Readonly<{
    backlog: BacklogState;
    cleanup: RetentionCleanupCounts;
    replayed: number;
  }>
> {
  const [cleanup, metrics, pending] = await Promise.all([
    input.repository.cleanupRetention(input.now),
    input.queue.metrics(),
    input.repository.listPendingOutbox(input.now, MAX_BATCH_COUNT),
  ]);
  const oldestAge =
    metrics.backlogCount === 0 || metrics.oldestMessageTimestamp === undefined
      ? 0
      : Math.max(0, input.now - metrics.oldestMessageTimestamp.getTime());
  const backlog = new QueueBacklogPolicy().evaluate(oldestAge);
  const boundedPending = pending.slice(0, MAX_BATCH_COUNT);
  const batches = partitionMessages(boundedPending);
  for (const batch of batches) {
    await input.queue.sendBatch(batch.map((body) => ({ body })));
  }
  return { backlog, cleanup, replayed: boundedPending.length };
}

function partitionMessages(
  messages: readonly AsyncMessage[],
): readonly (readonly AsyncMessage[])[] {
  const batches: AsyncMessage[][] = [];
  let batch: AsyncMessage[] = [];
  let batchBytes = 0;
  for (const message of messages.slice(0, MAX_BATCH_COUNT)) {
    const bytes = serializedBytes(message);
    if (bytes >= ASYNC_MESSAGE_MAX_BYTES) {
      throw new RangeError("Queue message must stay below 64 KiB");
    }
    if (batch.length > 0 && batchBytes + bytes > MAX_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(message);
    batchBytes += bytes;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}
