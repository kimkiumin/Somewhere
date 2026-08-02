import { describe, expect, it } from "vitest";

import { alarmWork, planJourneyAlarm } from "../src/async/alarm";
import {
  ASYNC_MESSAGE_MAX_BYTES,
  buildAsyncMessage,
  MAX_DELIVERY_ATTEMPTS,
  parseAsyncMessage,
  queueOperationReservation,
  retryDecision,
} from "../src/async/message";
import { createReadyJourney } from "../src/journey/aggregate";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("Todo12 versioned asynchronous messages", () => {
  it("derives stable IDs and digests from the same canonical event", async () => {
    const input = {
      eventType: "journey.activation.repair",
      occurredAt: 1_750_000_000_000,
      subjectDigest: DIGEST_A,
      writeEpoch: 7,
    } as const;

    const first = await buildAsyncMessage(input);
    const second = await buildAsyncMessage(input);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      eventType: input.eventType,
      schemaVersion: 1,
      subjectDigest: DIGEST_A,
      writeEpoch: 7,
    });
    expect(first.eventId).toMatch(/^evt_v1\.[a-f0-9]{48}$/);
    expect(first.eventDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(parseAsyncMessage(first)).resolves.toEqual(first);
  });

  it("rejects tampering, oversized payloads, and live Stop or Reveal authority", async () => {
    const valid = await buildAsyncMessage({
      eventType: "journey.activation.repair",
      occurredAt: 1_750_000_000_000,
      subjectDigest: DIGEST_A,
      writeEpoch: 7,
    });

    await expect(parseAsyncMessage({ ...valid, eventDigest: DIGEST_B })).rejects.toThrow(
      "event digest",
    );
    await expect(
      parseAsyncMessage({
        ...valid,
        padding: "x".repeat(ASYNC_MESSAGE_MAX_BYTES),
      }),
    ).rejects.toThrow("64 KiB");
    await expect(
      parseAsyncMessage({
        ...valid,
        eventType: "journey.reveal",
      }),
    ).rejects.toThrow();
    await expect(
      parseAsyncMessage({
        ...valid,
        eventType: "journey.stop",
      }),
    ).rejects.toThrow();
  });

  it("uses four exact retry delays and terminates at five delivery attempts", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
    expect([1, 2, 3, 4, 5].map(retryDecision)).toEqual([
      { kind: "retry", delaySeconds: 5 },
      { kind: "retry", delaySeconds: 30 },
      { kind: "retry", delaySeconds: 120 },
      { kind: "retry", delaySeconds: 600 },
      { kind: "poison" },
    ]);
    expect(() => retryDecision(0)).toThrow();
    expect(() => retryDecision(6)).toThrow();
  });

  it("reserves Queue operations using 64 KB chunks and all retry reads", () => {
    expect(queueOperationReservation(1)).toBe(8);
    expect(queueOperationReservation(63_900)).toBe(8);
    expect(queueOperationReservation(63_901)).toBe(16);
    expect(() => queueOperationReservation(0)).toThrow();
    expect(() => queueOperationReservation(ASYNC_MESSAGE_MAX_BYTES)).toThrow();
  });

  it("schedules the earliest outbox, feedback, or exact journey expiry without extending TTL", () => {
    const state = {
      ...createReadyJourney({
        browserBindingDigest: DIGEST_A,
        expiresAt: 86_400_000,
        journeyId: "journey_todo12_alarm_0001",
        selectedSnapshot: {
          destinationSnapshotCiphertext: "ciphertext.todo12.alarm",
          disclosure: { category: "cafe", hint: "quiet courtyard" },
          selectionReceiptId: "receipt_todo12_alarm_0001",
        },
        sequence: 0,
        writeEpoch: 1,
      }),
      feedback: {
        dueAt: 3_600_000,
        eventId: "event_todo12_feedback_0001",
        status: "scheduled",
      },
    } as const;

    expect(planJourneyAlarm(state, 5_000)).toEqual({ alarmAt: 5_000, kind: "scheduled" });
    expect(planJourneyAlarm(state, null)).toEqual({
      alarmAt: 3_600_000,
      kind: "scheduled",
    });
    expect(alarmWork(state, 3_599_999)).toBe("outbox");
    expect(alarmWork(state, 3_600_000)).toBe("feedback");
    expect(alarmWork(state, 86_400_000)).toBe("expire");
    expect(planJourneyAlarm(null, 5_000)).toEqual({ kind: "terminal" });
  });
});
