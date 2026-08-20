import { PROJECTION_EXAMPLES_V1 } from "@somewhere/contracts";
import { createSensorController } from "../application/controller";
import { createDiagnosticTrace } from "../application/diagnostics";
import { createV2JourneyApplication } from "../application/journey-application";
import { createV2Store } from "../application/v2-store";
import type { SomewhereComposition } from "../composition";
import { createE2eHarness } from "./e2e-harness";
import { createScriptedSensorRig } from "./fakes";
import { DeterministicV2Api, MemoryFeedbackCapabilityStore } from "./v2-fakes";

const ENDPOINT = { latitude: 37.545_033_8, longitude: 127.039_617_2 } as const;

function readyProjection() {
  const ready = PROJECTION_EXAMPLES_V1.find(
    (candidate) => candidate.phase === "ready" && !candidate.revealed,
  );
  if (ready === undefined) {
    throw new TypeError("Ready projection fixture is missing");
  }
  return ready;
}

export function createDeterministicTestComposition(): SomewhereComposition {
  const rig = createScriptedSensorRig();
  const sensors = createSensorController(rig.ports);
  const api = new DeterministicV2Api(readyProjection(), true);
  const store = createV2Store({
    api,
    feedbackCapabilities: new MemoryFeedbackCapabilityStore(),
    idempotencyKeys: { next: () => `ik_v1.${"A".repeat(43)}` },
    now: rig.nowMs,
  });
  const application = createV2JourneyApplication({
    sensors,
    store,
    diagnostics: createDiagnosticTrace({ buildSha: "e2e", policyVersion: "server-v1" }),
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
  return {
    application,
    testApi: createE2eHarness(
      application,
      rig,
      ENDPOINT,
      () => api.calls,
      async () => {
        if (api.projection.phase !== "finding" && api.projection.phase !== "expired") {
          api.projection = {
            ...api.projection,
            disclosure: {
              ...api.projection.disclosure,
              representativeCategories: ["<img src=x onerror=alert(1)>"],
            },
          };
          await store.refresh();
        }
      },
    ),
  };
}
