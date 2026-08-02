import {
  FeedbackCapabilitySchema,
  type JourneyProjectionV1,
  PROJECTION_EXAMPLES_V1,
  RequestIdSchema,
} from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import {
  DeterministicV2Api,
  feedbackRecord,
  MemoryFeedbackCapabilityStore,
} from "../testkit/v2-fakes";
import { type JourneyCreateBody, V2ApiError } from "./v2-api";
import { createV2Store } from "./v2-store";

function projection(phase: string): JourneyProjectionV1 {
  const found = PROJECTION_EXAMPLES_V1.find((candidate) => candidate.phase === phase);
  if (found === undefined) {
    throw new TypeError(`Missing ${phase} projection fixture`);
  }
  return found;
}

const CREATE_BODY: JourneyCreateBody = {
  contractVersion: 1,
  constraints: {
    accessibility: [],
    budgetBand: "medium",
    category: "cafe",
    dietary: [],
    maxWalkMinutes: 20,
  },
  disclosureLevel: "standard",
  origin: { accuracyM: 8, capturedAt: 1_000, latitude: 37.5, longitude: 127 },
  recoveryCapability: null,
};

function fixture(initial = projection("ready")) {
  const api = new DeterministicV2Api(initial);
  const feedback = new MemoryFeedbackCapabilityStore();
  let keyIndex = 0;
  const store = createV2Store({
    api,
    feedbackCapabilities: feedback,
    idempotencyKeys: {
      next() {
        const character = String.fromCharCode(65 + keyIndex);
        keyIndex += 1;
        return `ik_v1.${character.repeat(43)}`;
      },
    },
    now: () => 1_000,
  });
  return { api, feedback, store };
}

async function createReady(context: ReturnType<typeof fixture>): Promise<void> {
  await context.store.create(CREATE_BODY);
  expect(context.store.snapshot()).toMatchObject({
    status: "ready",
    projection: { phase: "ready", sequence: 1 },
  });
}

describe("V2 journey store", () => {
  test("keeps server projection and sends its exact sequence with one canonical key", async () => {
    const context = fixture();
    await createReady(context);
    context.api.projection = projection("committed");

    await context.store.mutate({ action: "commit", body: { contractVersion: 1 } });

    expect(context.api.calls[1]).toMatchObject({
      expectedSequence: 1,
      key: `ik_v1.${"B".repeat(43)}`,
      kind: "mutate",
      mutation: { action: "commit" },
    });
    expect(context.store.snapshot()).toMatchObject({
      projection: { phase: "committed" },
      status: "ready",
    });
  });

  test("reconciles sequence conflict from the server and exposes conflict state", async () => {
    const context = fixture();
    await createReady(context);
    context.api.projection = projection("committed");
    context.api.failure = new V2ApiError(
      409,
      "sequence_conflict",
      `req_v1.${"A".repeat(22)}`,
      true,
    );

    await context.store.mutate({ action: "commit", body: { contractVersion: 1 } });

    expect(context.api.calls.map((call) => call.kind)).toEqual(["create", "mutate", "get"]);
    expect(context.store.snapshot()).toMatchObject({
      failure: { code: "sequence_conflict", retryable: true },
      projection: { phase: "committed" },
      status: "conflict",
    });
  });

  test("retries the exact body and idempotency key after a retryable failure", async () => {
    const context = fixture();
    await createReady(context);
    context.api.failure = new V2ApiError(
      503,
      "service_unavailable",
      `req_v1.${"A".repeat(22)}`,
      true,
      5,
    );

    await context.store.mutate({ action: "commit", body: { contractVersion: 1 } });
    await context.store.retry();

    const mutations = context.api.calls.filter((call) => call.kind === "mutate");
    expect(mutations).toHaveLength(2);
    expect(mutations[0]).toEqual(mutations[1]);
    expect(context.store.snapshot().status).toBe("ready");
  });

  test("stores the bounded arrival bearer and deletes it after feedback use", async () => {
    const context = fixture();
    await createReady(context);
    const arrived = projection("arrived");
    if (arrived.phase !== "arrived") {
      throw new TypeError("Expected arrived projection");
    }
    context.api.mutationResult = {
      kind: "arrival",
      response: {
        contractVersion: 1,
        feedbackCapability: FeedbackCapabilitySchema.parse(`fb_v1.${"A".repeat(43)}`),
        requestId: RequestIdSchema.parse(`req_v1.${"A".repeat(22)}`),
        result: { ...arrived, feedbackDueAt: 2_000 },
      },
    };

    await context.store.mutate({
      action: "arrival",
      body: {
        accuracyBand: "good",
        consecutiveSamples: 4,
        contractVersion: 1,
        dwellMs: 12_000,
        endpointDistanceBand: "within-arrival-threshold",
        routeConsistency: "consistent",
      },
    });
    const retained = context.feedback.record;
    await context.store.recordReaction(`fid_v1.${"A".repeat(22)}`, {
      contractVersion: 1,
      reaction: "like",
    });

    expect(retained).toMatchObject({
      dueAt: 2_000,
      expiresAt: 2_000 + 6 * 24 * 60 * 60 * 1_000 + 23 * 60 * 60 * 1_000,
    });
    expect(context.feedback.record).toBeNull();
  });

  test("clears capability on invalidation, journey deletion, and local reset", async () => {
    const invalid = fixture();
    invalid.feedback.record = feedbackRecord();
    invalid.api.failure = new V2ApiError(
      404,
      "capability_invalid",
      `req_v1.${"A".repeat(22)}`,
      false,
    );
    await expect(invalid.store.eligibleFeedback()).rejects.toMatchObject({
      code: "capability_invalid",
    });
    expect(invalid.feedback.record).toBeNull();

    const deleted = fixture();
    await createReady(deleted);
    deleted.feedback.record = feedbackRecord();
    await deleted.store.deleteJourney();
    expect(deleted.feedback.record).toBeNull();
    expect(deleted.api.volatileClears).toBe(1);

    const reset = fixture();
    reset.feedback.record = feedbackRecord();
    await reset.store.reset();
    expect(reset.feedback.record).toBeNull();
    expect(reset.store.snapshot().status).toBe("idle");
  });

  test("advances recovery intent sequence once and confirms from that authority", async () => {
    // Given: a completed projection and two duplicate UI requests for one recovery intent.
    const context = fixture(projection("completed"));
    await context.store.create(CREATE_BODY);
    const before = context.store.snapshot().projection;
    if (before === null) {
      throw new TypeError("Expected a completed projection");
    }

    // When: both callers await the intent and one confirmation follows.
    const [first, duplicate] = await Promise.all([
      context.store.requestRecovery(),
      context.store.requestRecovery(),
    ]);
    await context.store.confirmRecovery(first, CREATE_BODY.constraints, first.requiredReviewFields);

    // Then: the intent mutates sequence once and confirmation sends the new sequence.
    expect(duplicate).toEqual(first);
    expect(context.api.calls.filter((call) => call.kind === "request-recovery")).toHaveLength(1);
    expect(context.store.snapshot().projection?.sequence).toBe(before.sequence + 1);
    expect(context.api.calls.at(-1)).toMatchObject({
      expectedSequence: before.sequence + 1,
      kind: "confirm-recovery",
    });
  });

  test("does not advance recovery sequence when the intent request fails", async () => {
    // Given: a completed projection whose recovery intent request will be rejected.
    const context = fixture(projection("completed"));
    await context.store.create(CREATE_BODY);
    const before = context.store.snapshot().projection?.sequence;
    const failure = new V2ApiError(409, "sequence_conflict", `req_v1.${"A".repeat(22)}`, true);
    context.api.requestRecovery = async () => {
      throw failure;
    };

    // When: the recovery intent request fails.
    await expect(context.store.requestRecovery()).rejects.toMatchObject({
      code: "sequence_conflict",
    });

    // Then: local authority remains unchanged.
    expect(context.store.snapshot().projection?.sequence).toBe(before);
  });
});
