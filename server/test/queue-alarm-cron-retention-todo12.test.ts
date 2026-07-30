import { describe, expect, it } from "vitest";
import { buildAsyncMessage } from "../src/async/message";
import { consumeQueueBatch, QueueBacklogPolicy, reconcileScheduledWork } from "../src/async/worker";

const DIGEST_A = "a".repeat(64);

describe("Todo12 Queue and Cron orchestration", () => {
  it("acks duplicates, retries transient failures exactly, and emits a redacted poison DLQ record", async () => {
    const now = 1_750_000_000_000;
    const message = await buildAsyncMessage({
      eventType: "journey.activation.repair",
      occurredAt: now,
      subjectDigest: DIGEST_A,
      writeEpoch: 1,
    });
    const observations: string[] = [];
    const repository = {
      async consume() {
        observations.push("consume");
        throw new Error("D1 unavailable");
      },
    };
    const retried: number[] = [];
    const acked: number[] = [];
    const dlq: unknown[] = [];

    await consumeQueueBatch({
      batch: fakeBatch(
        [1, 4, 5].map((attempts) => ({
          attempts,
          body: message,
          onAck: () => acked.push(attempts),
          onRetry: (delaySeconds) => retried.push(delaySeconds),
        })),
      ),
      dlq: { send: async (body: unknown) => void dlq.push(body) },
      now,
      repository,
    });

    expect(observations).toEqual(["consume", "consume", "consume"]);
    expect(retried).toEqual([5, 600]);
    expect(acked).toEqual([5]);
    expect(dlq).toEqual([
      {
        failedAt: now,
        failureCode: "consumer_failed",
        originalEventDigest: message.eventDigest,
        originalEventId: message.eventId,
        schemaVersion: 1,
      },
    ]);
  });

  it("dead-letters an invalid final delivery without copying its payload", async () => {
    const now = 1_750_000_000_000;
    const dlq: unknown[] = [];
    const payload = { forbiddenRawValue: "must-not-enter-dlq" };

    await consumeQueueBatch({
      batch: fakeBatch([
        {
          attempts: 5,
          body: payload,
          onAck() {},
          onRetry() {
            throw new Error("final poison input must not retry");
          },
        },
      ]),
      dlq: { send: async (body: unknown) => void dlq.push(body) },
      now,
      repository: {
        async consume() {
          throw new Error("invalid input must not reach the repository");
        },
      },
    });

    expect(dlq).toHaveLength(1);
    expect(dlq[0]).toMatchObject({
      failedAt: now,
      failureCode: "invalid_message",
      schemaVersion: 1,
    });
    expect(JSON.stringify(dlq)).not.toContain("must-not-enter-dlq");
  });

  it("warns, closes admission, and pages at exact oldest-message thresholds", () => {
    const policy = new QueueBacklogPolicy();
    expect(policy.evaluate(12 * 60 * 60 * 1_000 - 1)).toBe("open");
    expect(policy.evaluate(12 * 60 * 60 * 1_000)).toBe("warn");
    expect(policy.evaluate(18 * 60 * 60 * 1_000)).toBe("close");
    expect(policy.evaluate(20 * 60 * 60 * 1_000)).toBe("page");
  });

  it("reconciles at most 100 small messages without controlling Stop or Reveal", async () => {
    const now = 1_750_000_000_000;
    const pending = await Promise.all(
      Array.from({ length: 140 }, (_, index) =>
        buildAsyncMessage({
          eventType: "journey.expire",
          occurredAt: now + index,
          subjectDigest: index.toString(16).padStart(64, "0"),
          writeEpoch: 1,
        }),
      ),
    );
    const sent: unknown[][] = [];
    const result = await reconcileScheduledWork({
      now,
      queue: {
        metrics: async () => ({
          backlogBytes: 1,
          backlogCount: 1,
          oldestMessageTimestamp: new Date(now - 12 * 60 * 60 * 1_000),
        }),
        sendBatch: async (batch: Iterable<{ body: unknown }>) => {
          sent.push([...batch].map((entry) => entry.body));
          return undefined;
        },
      },
      repository: {
        cleanupRetention: async () => ({
          auditEvents: 0,
          budgetReservations: 0,
          feedbackEligibility: 0,
          httpSessions: 0,
          inboxEvents: 0,
          journeyTombstones: 0,
          outboxEvents: 0,
          placeReactions: 0,
          preparedReceipts: 0,
          sealedReceipts: 0,
          sessionGuards: 0,
        }),
        listPendingOutbox: async (_now: number, limit: number) => pending.slice(0, limit),
      },
    });

    expect(sent.flat()).toHaveLength(100);
    expect(sent.every((batch) => batch.length <= 100)).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/stop|reveal/i);
    expect(result).toMatchObject({ backlog: "warn", replayed: 100 });
  });
});

function fakeBatch(
  inputs: readonly Readonly<{
    attempts: number;
    body: unknown;
    onAck(): void;
    onRetry(delaySeconds: number): void;
  }>[],
): MessageBatch<unknown> {
  return {
    ackAll() {},
    metadata: {
      metrics: {
        backlogBytes: 0,
        backlogCount: inputs.length,
      },
    },
    messages: inputs.map((input, index) => ({
      ack: input.onAck,
      attempts: input.attempts,
      body: input.body,
      id: `cloudflare-${index}`,
      retry: (options?: QueueRetryOptions) => input.onRetry(options?.delaySeconds ?? 0),
      timestamp: new Date(),
    })),
    queue: "somewhere-events-local",
    retryAll() {},
  };
}
