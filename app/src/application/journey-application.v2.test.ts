import { type JourneyProjectionV1, PROJECTION_EXAMPLES_V1 } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import { createScriptedSensorRig } from "../testkit/fakes";
import { DeterministicV2Api, MemoryFeedbackCapabilityStore } from "../testkit/v2-fakes";
import { createSensorController } from "./controller";
import { createDiagnosticTrace } from "./diagnostics";
import { createV2JourneyApplication } from "./journey-application";
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

function fixture() {
  const rig = createScriptedSensorRig();
  const sensors = createSensorController(rig.ports);
  const api = new DeterministicV2Api(projection("ready", false));
  const store = createV2Store({
    api,
    feedbackCapabilities: new MemoryFeedbackCapabilityStore(),
    idempotencyKeys: { next: () => `ik_v1.${"A".repeat(43)}` },
  });
  const application = createV2JourneyApplication({
    sensors,
    store,
    diagnostics: createDiagnosticTrace({ buildSha: "test", policyVersion: "server-v1" }),
    createBody: (location) => ({
      contractVersion: 1,
      constraints: {
        accessibility: [],
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
  return { api, application, rig };
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
});
