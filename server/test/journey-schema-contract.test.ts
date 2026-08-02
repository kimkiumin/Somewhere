import { describe, expect, it } from "vitest";
import {
  beginDeletionSchema,
  inboxEventSchema,
  journeyCommandSchema,
  journeyStateSchema,
  outboxRecordSchema,
  readyJourneyInputSchema,
  resumeDeletionSchema,
  tombstoneReceiptSchema,
} from "../src/journey/schemas";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const NOW = 1_785_283_200_000;

describe("public journey schema contract", () => {
  it("exports the public journey schema catalog", () => {
    // Given: representative valid values for every public journey schema.
    const fixtures = [
      [readyJourneyInputSchema, readyJourney()],
      [journeyCommandSchema, commitCommand()],
      [journeyStateSchema, journeyState()],
      [inboxEventSchema, inboxEvent()],
      [outboxRecordSchema, outboxRecord()],
      [tombstoneReceiptSchema, tombstoneReceipt()],
      [beginDeletionSchema, beginDeletion()],
      [resumeDeletionSchema, resumeDeletion()],
    ] as const;

    // When: every value is parsed through the existing public import surface.
    const results = fixtures.map(([schema, value]) => schema.safeParse(value).success);

    // Then: all eight public schemas accept their representative contract values.
    expect(results).toEqual([true, true, true, true, true, true, true, true]);
  });

  it("rejects malformed public journey payloads", () => {
    // Given: malformed values spanning strict fields, digests, states, events, and deletion.
    const fixtures = [
      [readyJourneyInputSchema, { ...readyJourney(), unknownField: true }],
      [journeyCommandSchema, { ...commitCommand(), bodyDigest: "not-a-digest" }],
      [journeyStateSchema, { ...journeyState(), phase: "unknown" }],
      [inboxEventSchema, { ...inboxEvent(), eventId: "short" }],
      [outboxRecordSchema, { ...outboxRecord(), status: "delivered" }],
      [tombstoneReceiptSchema, { ...tombstoneReceipt(), durable: false }],
      [beginDeletionSchema, { ...beginDeletion(), expectedSequence: -1 }],
      [resumeDeletionSchema, { deleteRequestDigest: "not-a-digest" }],
    ] as const;

    // When: every malformed value crosses its public schema boundary.
    const results = fixtures.map(([schema, value]) => schema.safeParse(value).success);

    // Then: parsing fails closed for every malformed representative.
    expect(results).toEqual([false, false, false, false, false, false, false, false]);
  });
});

function selectedSnapshot() {
  return {
    destinationSnapshotCiphertext: "ciphertext.destination",
    disclosure: { category: "cafe", hint: "quiet courtyard" },
    selectionReceiptId: "receipt_contract_00000001",
  } as const;
}

function readyJourney() {
  return {
    browserBindingDigest: DIGEST_A,
    expiresAt: NOW + 86_400_000,
    journeyId: "journey_contract_00000001",
    selectedSnapshot: selectedSnapshot(),
    sequence: 0,
    writeEpoch: 3,
  } as const;
}

function commitCommand() {
  return {
    bodyDigest: DIGEST_B,
    expectedSequence: 0,
    idempotencyKeyDigest: DIGEST_C,
    now: NOW,
    outcomeCiphertext: "ciphertext.outcome",
    type: "commit",
    writeEpoch: 3,
  } as const;
}

function journeyState() {
  return {
    browserBindingDigest: DIGEST_A,
    contractVersion: 1,
    expiresAt: NOW + 86_400_000,
    idempotency: {},
    journeyId: "journey_contract_00000001",
    pauseEpoch: 0,
    phase: "ready",
    revealed: false,
    selectedSnapshot: selectedSnapshot(),
    sequence: 0,
    writeEpoch: 3,
  } as const;
}

function inboxEvent() {
  return {
    eventDigest: DIGEST_B,
    eventId: "inbox_contract_000000001",
    eventType: "journey.commit",
    expiresAt: NOW + 86_400_000,
    receivedAt: NOW,
    resultCode: "accepted",
    writeEpoch: 3,
  } as const;
}

function outboxRecord() {
  return {
    attempts: 0,
    eventDigest: DIGEST_B,
    eventId: "outbox_contract_00000001",
    eventType: "journey.commit",
    expiresAt: NOW + 86_400_000,
    nextAttemptAt: NOW,
    status: "pending",
    writeEpoch: 3,
  } as const;
}

function tombstoneReceipt() {
  return {
    deleteRequestDigest: DIGEST_C,
    durable: true,
    replayStatus: 204,
  } as const;
}

function beginDeletion() {
  return {
    deleteRequestDigest: DIGEST_C,
    expectedSequence: 0,
  } as const;
}

function resumeDeletion() {
  return { deleteRequestDigest: DIGEST_C } as const;
}
