import { createSensorController } from "../application/controller";
import { createDiagnosticTrace } from "../application/diagnostics";
import type { SomewhereComposition } from "../composition";
import curatedDestinationInput from "../data/curated-destinations.json";
import { type DestinationBundle, parseDestinationBundle } from "../platform/curated-destinations";
import { createJourneyApplication } from "./deterministic-journey-application";
import { createE2eHarness } from "./e2e-harness";
import { createScriptedSensorRig } from "./fakes";

function parsedBundle(): DestinationBundle {
  const result = parseDestinationBundle(curatedDestinationInput);
  if (!result.ok) {
    throw new Error(`Curated destinations are invalid: ${result.issues.join("; ")}`);
  }
  return result.value;
}

export function createDeterministicTestComposition(): SomewhereComposition {
  const rig = createScriptedSensorRig();
  const bundle = parsedBundle();
  const sensors = createSensorController(rig.ports);
  const application = createJourneyApplication({
    sensors,
    bundle,
    clock: rig.ports.clock,
    scheduler: rig.ports.scheduler,
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
