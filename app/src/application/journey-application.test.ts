import { describe, expect, test } from "vitest";
import curatedDestinationInput from "../data/curated-destinations.json";
import { parseDestinationBundle } from "../platform/curated-destinations";
import { createScriptedSensorRig } from "../testkit/fakes";
import { createSensorController } from "./controller";
import { createDiagnosticTrace } from "./diagnostics";
import { createJourneyApplication } from "./journey-application";

function fixture(randomValues: readonly number[] = [0]) {
  const parsed = parseDestinationBundle(curatedDestinationInput);
  if (!parsed.ok) {
    throw new Error(parsed.issues.join("; "));
  }
  const rig = createScriptedSensorRig();
  const sensors = createSensorController(rig.ports);
  const diagnostics = createDiagnosticTrace({
    buildSha: "test",
    policyVersion: "field-v1",
  });
  let randomIndex = 0;
  const application = createJourneyApplication({
    sensors,
    bundle: parsed.value,
    clock: rig.ports.clock,
    scheduler: rig.ports.scheduler,
    random: {
      nextUnit() {
        const value = randomValues[randomIndex] ?? randomValues.at(-1);
        randomIndex += 1;
        return value ?? 0;
      },
    },
    todayIsoDate: () => "2026-07-28",
    diagnostics,
  });
  return { application, bundle: parsed.value, diagnostics, rig };
}

function selectedCoordinates(
  application: ReturnType<typeof fixture>["application"],
  bundle: ReturnType<typeof fixture>["bundle"],
) {
  const journey = application.snapshot().journey;
  if (journey.phase === "idle" || journey.phase === "selecting") {
    throw new Error("Expected a selected destination.");
  }
  const selected = bundle.destinations.find(
    (destination) => destination.id === journey.destinationId,
  );
  if (selected === undefined) {
    throw new Error("Selected destination is missing.");
  }
  return selected.coordinates;
}

function emitDistance(
  context: ReturnType<typeof fixture>,
  distanceM: number,
  accuracyM = 10,
): void {
  const selected = selectedCoordinates(context.application, context.bundle);
  context.rig.advanceMs(3_000);
  context.rig.emitLocation({
    coordinates: {
      latitude: selected.latitude + distanceM / 111_195,
      longitude: selected.longitude,
    },
    accuracyM,
    capturedAtMs: context.rig.nowMs(),
  });
}

async function startLiveJourney(context: ReturnType<typeof fixture>): Promise<void> {
  await context.application.startAdventure();
  context.application.beginWalk();
  emitDistance(context, 240);
  context.rig.emitHeading({
    degrees: 180,
    reference: "true",
    accuracyDeg: 8,
    capturedAtMs: context.rig.nowMs(),
  });
}

describe("journey application characterization", () => {
  test("selects a hidden destination before exposing live guidance", async () => {
    const context = fixture();

    await context.application.startAdventure();
    const hidden = context.application.snapshot();
    context.application.beginWalk();
    emitDistance(context, 240);
    context.rig.emitHeading({
      degrees: 180,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });
    const live = context.application.snapshot();

    expect(hidden.journey.phase).toBe("hidden");
    expect(hidden.hiddenDestination).not.toBeNull();
    expect(hidden.revealedDestination).toBeNull();
    expect(live.journey.phase).toBe("following");
    expect(live.guidance.status).toBe("live");
  });

  test("publishes near and makes the immediate arrived snapshot inactive", async () => {
    const context = fixture();
    await startLiveJourney(context);

    emitDistance(context, 100);
    expect(context.application.snapshot().journey.phase).toBe("near");
    emitDistance(context, 20);
    emitDistance(context, 20);
    context.rig.emitHeading({
      degrees: 180,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });
    emitDistance(context, 20);
    const arrived = context.application.snapshot();

    expect(arrived.journey.phase).toBe("arrived");
    expect(arrived.guidance.status).toBe("inactive");
    expect(arrived.sensors.subscriptionCounts.location).toBe(0);
    expect(arrived.sensors.subscriptionCounts.heading).toBe(0);
  });

  test("expires a silent live pair at max age plus one millisecond", async () => {
    const context = fixture();
    await startLiveJourney(context);

    context.rig.advanceMs(10_000);
    expect(context.application.snapshot().guidance.status).toBe("live");
    context.rig.advanceMs(1);

    expect(context.application.snapshot().guidance).toEqual({
      status: "paused",
      reasons: ["location-stale"],
    });
  });

  test("reports a frozen heading after location refreshes", async () => {
    const context = fixture();
    await startLiveJourney(context);
    const selected = selectedCoordinates(context.application, context.bundle);
    context.rig.advanceMs(9_000);
    context.rig.emitLocation({
      coordinates: {
        latitude: selected.latitude + 200 / 111_195,
        longitude: selected.longitude,
      },
      accuracyM: 10,
      capturedAtMs: context.rig.nowMs(),
    });
    context.rig.advanceMs(1_001);

    expect(context.application.snapshot().guidance).toEqual({
      status: "paused",
      reasons: ["heading-stale"],
    });
  });

  test("moves the freshness deadline when both samples refresh", async () => {
    const context = fixture();
    await startLiveJourney(context);
    const selected = selectedCoordinates(context.application, context.bundle);
    context.rig.advanceMs(9_000);
    context.rig.emitLocation({
      coordinates: {
        latitude: selected.latitude + 200 / 111_195,
        longitude: selected.longitude,
      },
      accuracyM: 10,
      capturedAtMs: context.rig.nowMs(),
    });
    context.rig.emitHeading({
      degrees: 180,
      reference: "true",
      accuracyDeg: 8,
      capturedAtMs: context.rig.nowMs(),
    });

    context.rig.advanceMs(1_001);
    expect(context.application.snapshot().guidance.status).toBe("live");
    context.rig.advanceMs(8_999);
    expect(context.application.snapshot().guidance.status).toBe("live");
    context.rig.advanceMs(1);
    expect(context.application.snapshot().guidance.status).toBe("paused");
  });

  test("reveals identity only through reveal or give up", async () => {
    const revealed = fixture();
    await revealed.application.startAdventure();
    revealed.application.reveal();
    const revealedSnapshot = revealed.application.snapshot();
    const abandoned = fixture();
    await abandoned.application.startAdventure();
    abandoned.application.giveUp();
    const abandonedSnapshot = abandoned.application.snapshot();

    expect(revealedSnapshot.journey.phase).toBe("revealed");
    expect(revealedSnapshot.revealedDestination?.name).toBeTruthy();
    expect(revealedSnapshot.sensors.subscriptionCounts.location).toBe(0);
    expect(revealedSnapshot.sensors.subscriptionCounts.heading).toBe(0);
    expect(abandonedSnapshot.journey.phase).toBe("give-up");
    expect(abandonedSnapshot.revealedDestination?.name).toBeTruthy();
    expect(abandonedSnapshot.sensors.subscriptionCounts.location).toBe(0);
    expect(abandonedSnapshot.sensors.subscriptionCounts.heading).toBe(0);
  });

  test("rerolls to a different hidden destination", async () => {
    const context = fixture([0, 0.5]);
    await context.application.startAdventure();
    const first = context.application.snapshot().journey;
    if (first.phase === "idle" || first.phase === "selecting") {
      throw new Error("Expected the first destination.");
    }

    context.application.reroll();
    const second = context.application.snapshot().journey;

    expect(second.phase).toBe("hidden");
    expect(second.phase === "hidden" ? second.destinationId : null).not.toBe(first.destinationId);
    expect(context.application.snapshot().revealedDestination).toBeNull();
  });

  test("exports, discards, and destroys owned journey resources", async () => {
    const context = fixture();
    await startLiveJourney(context);
    const exported = JSON.parse(
      context.application.exportDiagnostics({
        browserMode: "other",
        environmentLabel: "open-sky",
        userAgent: "test",
      }),
    );

    expect(exported.events.length).toBeGreaterThan(0);
    context.application.discardDiagnostics();
    expect(context.application.snapshot().diagnosticEventCount).toBe(0);
    emitDistance(context, 120);
    expect(context.application.snapshot().diagnosticEventCount).toBe(0);
    await context.application.destroy();
    emitDistance(context, 120);
    expect(context.application.snapshot().diagnosticEventCount).toBe(0);
  });
});
