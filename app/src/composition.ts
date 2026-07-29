import { createSensorController } from "./application/controller";
import { createDiagnosticTrace } from "./application/diagnostics";
import {
  createV2JourneyApplication,
  type JourneyApplication,
} from "./application/journey-application";
import { createV2Store } from "./application/v2-store";
import { createBrowserIdempotencyKeySource, createBrowserV2Api } from "./platform/browser-api";
import { createBrowserSensorPorts } from "./platform/browser-composition";
import { createBrowserFeedbackCapabilityStore } from "./platform/feedback-capability-store";
import type { SomewhereTestApi } from "./testkit/e2e-harness";
import { createDeterministicTestComposition } from "./testkit/test-composition";

export type SomewhereComposition = Readonly<{
  application: JourneyApplication;
  testApi: SomewhereTestApi | null;
}>;

export function createProductionComposition(): SomewhereComposition {
  const ports = createBrowserSensorPorts();
  const sensors = createSensorController(ports);
  const diagnostics = createDiagnosticTrace({
    buildSha: import.meta.env.VITE_BUILD_SHA ?? "local",
    policyVersion: "server-v1",
  });
  const store = createV2Store({
    api: createBrowserV2Api(),
    feedbackCapabilities: createBrowserFeedbackCapabilityStore(),
    idempotencyKeys: createBrowserIdempotencyKeySource(),
  });
  const application = createV2JourneyApplication({
    sensors,
    store,
    diagnostics,
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
  return { application, testApi: null };
}

export function createTestComposition(): SomewhereComposition {
  if (import.meta.env.MODE !== "test-harness") {
    throw new TypeError("The deterministic composition is available only in test-harness mode");
  }
  return createDeterministicTestComposition();
}
