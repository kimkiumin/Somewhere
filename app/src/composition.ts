import { createSensorController } from "./application/controller";
import { createDiagnosticTrace } from "./application/diagnostics";
import {
  createJourneyApplication,
  type JourneyApplication,
} from "./application/journey-application";
import curatedDestinationInput from "./data/curated-destinations.json";
import { createBrowserSensorPorts } from "./platform/browser-composition";
import { type DestinationBundle, parseDestinationBundle } from "./platform/curated-destinations";
import { createE2eHarness, type SomewhereTestApi } from "./testkit/e2e-harness";
import { createScriptedSensorRig } from "./testkit/fakes";

export type SomewhereComposition = {
  readonly application: JourneyApplication;
  readonly testApi: SomewhereTestApi | null;
};

function parsedBundle(): DestinationBundle {
  const result = parseDestinationBundle(curatedDestinationInput);
  if (!result.ok) {
    throw new Error(`Curated destinations are invalid: ${result.issues.join("; ")}`);
  }
  return result.value;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createProductionComposition(): SomewhereComposition {
  const ports = createBrowserSensorPorts();
  const sensors = createSensorController(ports);
  const application = createJourneyApplication({
    sensors,
    bundle: parsedBundle(),
    clock: ports.clock,
    random: { nextUnit: () => Math.random() },
    todayIsoDate,
    diagnostics: createDiagnosticTrace({
      buildSha: import.meta.env.VITE_BUILD_SHA ?? "local",
      policyVersion: "field-v1",
    }),
  });
  return { application, testApi: null };
}

export function createTestComposition(): SomewhereComposition {
  const rig = createScriptedSensorRig();
  const bundle = parsedBundle();
  const sensors = createSensorController(rig.ports);
  const application = createJourneyApplication({
    sensors,
    bundle,
    clock: rig.ports.clock,
    random: { nextUnit: () => 0 },
    todayIsoDate: () => "2026-07-28",
    diagnostics: createDiagnosticTrace({
      buildSha: "e2e",
      policyVersion: "field-v1",
    }),
  });
  return {
    application,
    testApi: createE2eHarness(application, rig, bundle),
  };
}
