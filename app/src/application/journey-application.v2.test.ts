import { type JourneyProjectionV1, PROJECTION_EXAMPLES_V1 } from "@somewhere/contracts";
import { describe, expect, test, vi } from "vitest";
import { routeEndpointDigest } from "../domain/polyline";
import { createScriptedSensorRig } from "../testkit/fakes";
import {
  DeterministicV2Api,
  feedbackRecord,
  MemoryFeedbackCapabilityStore,
} from "../testkit/v2-fakes";
import { createSensorController } from "./controller";
import { createDiagnosticTrace } from "./diagnostics";
import { createV2JourneyApplication, type JourneyApplication } from "./journey-application";
import { V2ApiError } from "./v2-api";
import { createV2Store } from "./v2-store";

function projection(phase: string, revealed: boolean): JourneyProjectionV1 {
  const found = PROJECTION_EXAMPLES_V1.find(
    (candidate) =>
      candidate.phase === phase &&
      candidate.phase !== "finding" &&
      candidate.phase !== "expired" &&
      candidate.revealed === revealed,
  );
  if (found === undefined) {
    throw new TypeError(`Missing ${phase}/${String(revealed)} projection fixture`);
  }
  return found;
}

function fixture(autoTransition = false) {
  const rig = createScriptedSensorRig();
  const sensors = createSensorController(rig.ports);
  const api = new DeterministicV2Api(projection("ready", false), autoTransition);
  const feedbackCapabilities = new MemoryFeedbackCapabilityStore();
  const store = createV2Store({
    api,
    feedbackCapabilities,
    idempotencyKeys: { next: () => `ik_v1.${"A".repeat(43)}` },
  });
  const application = createV2JourneyApplication({
    sensors,
    store,
    diagnostics: createDiagnosticTrace({ buildSha: "test", policyVersion: "server-v1" }),
    clock: rig.ports.clock,
    scheduler: rig.ports.scheduler,
    createBody: (location) => ({
      contractVersion: 1,
      constraints: {
        accessibility: [],
        allergies: [],
        budgetBand: "medium",
        category: "cafe",
        dietary: [],
        maxWalkMinutes: 30,
      },
      disclosureLevel: "standard",
      origin: {
        accuracyM: location.accuracyM,
        capturedAt: location.capturedAtMs,
        latitude: location.latitude,
        longitude: location.longitude,
      },
      recoveryCapability: null,
    }),
  });
  return { api, application, feedbackCapabilities, rig, store };
}

async function followingProjection(): Promise<JourneyProjectionV1> {
  const base = projection("following", false);
  if (base.phase !== "following") {
    throw new TypeError("Expected a following projection");
  }
  const start = { latitude: 37.544_6, longitude: 127.037_4 };
  const endpoint = { latitude: start.latitude + 80 / 111_195, longitude: start.longitude };
  const routeDigest = await routeEndpointDigest(endpoint);
  if (routeDigest === null) {
    throw new TypeError("Route digest is unavailable");
  }
  const encodedPolyline = btoa(
    JSON.stringify([
      [start.longitude, start.latitude],
      [endpoint.longitude, endpoint.latitude],
    ]),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return {
    ...base,
    guidance: {
      kind: "route",
      encodedPolyline,
      routeDigest,
      routeVersion: "route-v1",
      expiresAt: 1_000_000,
    },
  };
}

describe("V2 journey application facade", () => {
  test("creates from a live sensor sample and renders only server disclosure", async () => {
    const context = fixture();
    await context.application.startAdventure();
    context.rig.emitLocation({
      accuracyM: 7,
      capturedAtMs: 1_000,
      coordinates: { latitude: 37.5, longitude: 127 },
    });
    await Promise.resolve();
    await Promise.resolve();

    const created = context.api.calls.find((call) => call.kind === "create");
    expect(created).toMatchObject({
      body: {
        origin: { accuracyM: 7, capturedAt: 1_000, latitude: 37.5, longitude: 127 },
      },
    });
    expect(context.application.snapshot()).toMatchObject({
      hiddenDestination: {
        estimatedMinutes: 10,
        hint: "cafe",
      },
      journey: { phase: "hidden" },
      revealedDestination: null,
    });
  });

  test("keeps sensor ownership when Reveal changes identity only", async () => {
    const context = fixture();
    await context.application.startAdventure();
    context.rig.emitLocation({
      accuracyM: 7,
      capturedAtMs: 1_000,
      coordinates: { latitude: 37.5, longitude: 127 },
    });
    await Promise.resolve();
    context.api.projection = projection("ready", true);

    context.application.reveal();
    await Promise.resolve();
    await Promise.resolve();

    expect(context.application.snapshot().revealedDestination).toMatchObject({
      description: "Revealed address",
      name: "Revealed venue",
    });
    expect(context.application.snapshot().sensors.subscriptionCounts).toMatchObject({
      heading: 1,
      location: 1,
    });
  });

  test("TASK16_V2_ROUTE_ADAPTER emits guidance and submits only strong route-consistent arrival", async () => {
    const context = fixture(true);
    await context.application.startAdventure();
    context.rig.advanceMs(1_000);
    context.rig.emitLocation({
      accuracyM: 7,
      capturedAtMs: context.rig.nowMs(),
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
    });
    await vi.waitFor(() => expect(context.store.snapshot().status).toBe("ready"));

    context.api.projection = await followingProjection();
    context.application.beginWalk();
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("following"));
    context.rig.emitHeading({
      degrees: 0,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });
    await vi.waitFor(() => expect(context.application.snapshot().guidance.status).toBe("live"));

    const endpointLatitude = 37.544_6 + 80 / 111_195;
    const arrivalLatitude = endpointLatitude - 20 / 111_195;
    for (const advanceMs of [1, 4_000, 4_000, 4_000]) {
      context.rig.advanceMs(advanceMs);
      context.rig.emitHeading({
        degrees: 0,
        reference: "true",
        accuracyDeg: 8,
        capturedAtMs: context.rig.nowMs(),
      });
      context.rig.emitLocation({
        accuracyM: 10,
        capturedAtMs: context.rig.nowMs(),
        coordinates: { latitude: arrivalLatitude, longitude: 127.037_4 },
      });
    }

    await vi.waitFor(() =>
      expect(
        context.api.calls.some(
          (call) => call.kind === "mutate" && call.mutation.action === "arrival",
        ),
      ).toBe(true),
    );
    const arrivalCall = context.api.calls.find(
      (call) => call.kind === "mutate" && call.mutation.action === "arrival",
    );
    expect(arrivalCall).toMatchObject({
      mutation: {
        action: "arrival",
        body: {
          consecutiveSamples: 4,
          dwellMs: 12_000,
          routeConsistency: "consistent",
        },
      },
    });
    await vi.waitFor(() =>
      expect(context.store.snapshot().projection).toMatchObject({
        phase: "arrived",
        revealed: true,
      }),
    );
    expect(context.application.snapshot().revealedDestination).toMatchObject({
      name: "조용한 정원",
    });
  });

  test("TASK16_V2_ROUTE_ADAPTER never exposes an arrow for malformed server geometry", async () => {
    const context = fixture();
    await context.application.startAdventure();
    context.rig.advanceMs(1_000);
    context.rig.emitLocation({
      accuracyM: 7,
      capturedAtMs: context.rig.nowMs(),
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
    });
    await vi.waitFor(() => expect(context.store.snapshot().status).toBe("ready"));

    context.api.projection = projection("following", false);
    context.application.beginWalk();
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("following"));
    context.rig.emitHeading({
      degrees: 0,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });

    await vi.waitFor(() =>
      expect(context.application.snapshot().guidance).toMatchObject({
        status: "paused",
        reasons: ["route-unavailable"],
      }),
    );
  });

  test("TASK17_V2_STOP removes direction before dispatching stop-request", async () => {
    const context = fixture();
    await context.application.startAdventure();
    context.rig.advanceMs(1_000);
    context.rig.emitLocation({
      accuracyM: 7,
      capturedAtMs: context.rig.nowMs(),
      coordinates: { latitude: 37.544_6, longitude: 127.037_4 },
    });
    await vi.waitFor(() => expect(context.store.snapshot().status).toBe("ready"));

    context.api.projection = await followingProjection();
    context.application.beginWalk();
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("following"));
    context.rig.emitHeading({
      degrees: 0,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });
    await vi.waitFor(() => expect(context.application.snapshot().guidance.status).toBe("live"));

    const applicationWithStop = context.application as JourneyApplication & {
      readonly stop: () => void;
    };
    const stopRequest = applicationWithStop.stop();

    expect(context.application.snapshot().guidance.status).toBe("inactive");
    expect(context.api.calls.at(-1)).toMatchObject({
      kind: "mutate",
      mutation: { action: "stop-request", body: { contractVersion: 1 } },
    });
    await stopRequest;
  });

  test("TASK17_V2_LIFECYCLE dispatches typed stop, recovery, and replacement commands", async () => {
    const context = fixture(true);
    await context.application.startAdventure();
    context.rig.emitLocation({
      accuracyM: 8,
      capturedAtMs: context.rig.nowMs(),
      coordinates: { latitude: 37.554, longitude: 127.039_6 },
    });
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("ready"));
    context.application.beginWalk();
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("following"));

    await context.application.stop();
    expect(context.store.snapshot().projection?.phase).toBe("paused");
    await context.application.cancelStop();
    expect(context.store.snapshot().projection?.phase).toBe("following");
    await context.application.stop();
    await context.application.confirmStop();
    expect(context.store.snapshot().projection?.phase).toBe("stopped");
    await context.application.recordStopReason("route-or-sensor");
    expect(context.store.snapshot().projection?.phase).toBe("completed");

    const intent = await context.application.requestRecovery();
    let emittedAfterReset = false;
    const stopResetProbe = context.store.subscribe((snapshot) => {
      if (!emittedAfterReset && snapshot.status === "idle") {
        emittedAfterReset = true;
        context.rig.emitLocation({
          accuracyM: 8,
          capturedAtMs: context.rig.nowMs() + 2,
          coordinates: { latitude: 37.554, longitude: 127.039_6 },
        });
      }
    });
    const replacement = context.application.confirmRecovery(intent, intent.requiredReviewFields);
    await Promise.resolve();
    context.rig.emitLocation({
      accuracyM: 8,
      capturedAtMs: context.rig.nowMs() + 1,
      coordinates: { latitude: 37.554, longitude: 127.039_6 },
    });
    await replacement;
    stopResetProbe();

    expect(
      context.api.calls
        .filter((call) => call.kind === "mutate")
        .map((call) => call.mutation.action),
    ).toEqual([
      "commit",
      "stop-request",
      "continue",
      "stop-request",
      "confirm-stop",
      "stop-reason",
    ]);
    expect(context.api.calls).toContainEqual(
      expect.objectContaining({
        kind: "confirm-recovery",
        reviewedFields: ["constraints"],
      }),
    );
    expect(context.api.calls.at(-1)).toMatchObject({
      kind: "create",
      body: { recoveryCapability: `rc_v1.${"A".repeat(43)}` },
    });
    expect(context.api.calls.filter((call) => call.kind === "create")).toHaveLength(2);
  });

  test("does not auto-create a second journey after recovery has no fit", async () => {
    const context = fixture(true);
    await context.application.startAdventure();
    context.rig.emitLocation({
      accuracyM: 8,
      capturedAtMs: context.rig.nowMs(),
      coordinates: { latitude: 37.554, longitude: 127.039_6 },
    });
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("ready"));
    context.application.beginWalk();
    await vi.waitFor(() => expect(context.store.snapshot().projection?.phase).toBe("following"));
    await context.application.stop();
    await context.application.confirmStop();
    await context.application.recordStopReason("skip");

    const intent = await context.application.requestRecovery();
    context.api.failure = new V2ApiError(422, "no_fit", "req_v1.test", false);
    const replacement = context.application.confirmRecovery(intent, intent.requiredReviewFields);
    await Promise.resolve();
    context.rig.emitLocation({
      accuracyM: 8,
      capturedAtMs: context.rig.nowMs() + 1,
      coordinates: { latitude: 37.554, longitude: 127.039_6 },
    });
    await replacement;

    expect(context.store.snapshot()).toMatchObject({
      failure: { code: "no_fit" },
      projection: null,
      status: "failed",
    });
    context.rig.emitLocation({
      accuracyM: 8,
      capturedAtMs: context.rig.nowMs() + 2,
      coordinates: { latitude: 37.554, longitude: 127.039_6 },
    });
    await Promise.resolve();
    expect(context.api.calls.filter((call) => call.kind === "create")).toHaveLength(2);
  });

  test("TASK17_V2_REACTION reads and records an identity-free delayed reaction", async () => {
    const context = fixture();
    context.feedbackCapabilities.record = feedbackRecord(0, 10_000);

    const prompt = await context.application.eligibleFeedback();
    expect(prompt?.actions).toEqual(["dislike", "like", "love", "did_not_visit"]);
    if (prompt === null) {
      throw new TypeError("Expected an eligible feedback prompt");
    }
    await context.application.recordReaction(prompt.feedbackId, "love");

    expect(context.api.calls.at(-1)).toMatchObject({
      kind: "reaction",
      feedbackId: prompt.feedbackId,
    });
    expect(context.feedbackCapabilities.record).toBeNull();
  });
});
