import { describe, expect, it } from "vitest";

import {
  createReadyJourney,
  type JourneyCommand,
  transitionJourney,
} from "../src/journey/aggregate";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

function readyJourney() {
  return createReadyJourney({
    browserBindingDigest: DIGEST_A,
    expiresAt: 86_400_000,
    journeyId: "journey_todo9_00000001",
    selectedSnapshot: {
      destinationSnapshotCiphertext: "ciphertext.destination.todo9",
      disclosure: { category: "cafe", hint: "quiet courtyard" },
      selectionReceiptId: "receipt_todo9_00000001",
    },
    sequence: 4,
    writeEpoch: 7,
  });
}

describe("journey-do serialized aggregate", () => {
  it("atomically records one sequence, replay outcome, and outbox event", () => {
    // Given: a ready journey and a Commit command with digested replay material.
    const state = readyJourney();
    const command: JourneyCommand = {
      bodyDigest: DIGEST_B,
      expectedSequence: 4,
      idempotencyKeyDigest: DIGEST_C,
      now: 1_000,
      outcomeCiphertext: "ciphertext.todo9",
      type: "commit",
      writeEpoch: 7,
    };

    // When: Commit is applied and then retried with the same canonical body.
    const committed = transitionJourney(state, command);
    const replay = transitionJourney(committed.state, command);

    // Then: the retry returns the original outcome without another transition or event.
    expect(committed.kind).toBe("applied");
    expect(committed.state.sequence).toBe(5);
    expect(committed.outbox).toHaveLength(1);
    expect(replay.kind).toBe("replay");
    expect(replay.state.sequence).toBe(5);
    expect(replay.outbox).toHaveLength(0);
    expect(replay.outcomeCiphertext).toBe("ciphertext.todo9");
  });

  it("rejects a changed body for an existing idempotency digest", () => {
    // Given: a completed Commit outcome.
    const state = readyJourney();
    const first = transitionJourney(state, {
      bodyDigest: DIGEST_B,
      expectedSequence: 4,
      idempotencyKeyDigest: DIGEST_C,
      now: 1_000,
      outcomeCiphertext: "ciphertext.todo9",
      type: "commit",
      writeEpoch: 7,
    });

    // When: the same key digest is reused for a different canonical body.
    const changed = transitionJourney(first.state, {
      bodyDigest: DIGEST_A,
      expectedSequence: 4,
      idempotencyKeyDigest: DIGEST_C,
      now: 1_001,
      outcomeCiphertext: "changed",
      type: "commit",
      writeEpoch: 7,
    });

    // Then: the mutation is rejected and the aggregate remains byte-for-byte unchanged.
    expect(changed.kind).toBe("idempotency_conflict");
    expect(changed.state).toEqual(first.state);
    expect(changed.outbox).toHaveLength(0);
  });

  it("fences stored replay outcomes after expiry or write-epoch recovery", () => {
    // Given: a completed replay outcome in the original maintenance epoch.
    const state = readyJourney();
    const command: JourneyCommand = {
      bodyDigest: DIGEST_B,
      expectedSequence: 4,
      idempotencyKeyDigest: DIGEST_C,
      now: 1_000,
      outcomeCiphertext: "ciphertext.todo9",
      type: "commit",
      writeEpoch: 7,
    };
    const committed = transitionJourney(state, command);

    // When: old work replays after epoch recovery and after journey expiry.
    const restored = transitionJourney(
      { ...committed.state, writeEpoch: 8 },
      { ...command, now: 2_000 },
    );
    const expired = transitionJourney(committed.state, {
      ...command,
      now: committed.state.expiresAt,
    });

    // Then: neither retained ciphertext nor old work can revive authority.
    expect(restored.kind).toBe("stale_epoch");
    expect(restored.outcomeCiphertext).toBeUndefined();
    expect(expired.kind).toBe("expired");
    expect(expired.outcomeCiphertext).toBeUndefined();
  });

  it("schedules minimized feedback metadata when arrival latches", () => {
    // Given: a following journey with an active route.
    const committed = transitionJourney(readyJourney(), {
      bodyDigest: DIGEST_B,
      expectedSequence: 4,
      idempotencyKeyDigest: DIGEST_C,
      now: 1_000,
      outcomeCiphertext: "commit",
      type: "commit",
      writeEpoch: 7,
    });
    const following = transitionJourney(committed.state, {
      bodyDigest: DIGEST_A,
      capturedPauseEpoch: 0,
      expectedSequence: 5,
      idempotencyKeyDigest: "1".repeat(64),
      now: 2_000,
      outcomeCiphertext: "route",
      route: {
        geometry: [
          [127.031, 37.544],
          [127.032, 37.545],
        ],
        originZoneRef: "seoul-forest-zone-a",
        routeDigest: "2".repeat(64),
      },
      type: "route-activate",
      writeEpoch: 7,
    });

    // When: arrival evidence is accepted.
    const arrived = transitionJourney(following.state, {
      bodyDigest: "3".repeat(64),
      expectedSequence: 6,
      idempotencyKeyDigest: "4".repeat(64),
      now: 3_000,
      outcomeCiphertext: "arrival",
      type: "arrival",
      writeEpoch: 7,
    });

    // Then: route data is gone and only a due-event identifier and time remain.
    expect(arrived.state.activeRoute).toBeUndefined();
    expect(arrived.state.feedback).toEqual({
      dueAt: 3_603_000,
      eventId: `event_${"4".repeat(48)}`,
      status: "scheduled",
    });
    expect(arrived.outbox[0]).toMatchObject({
      eventType: "journey.feedback.eligible",
      nextAttemptAt: 3_603_000,
    });
  });
});
