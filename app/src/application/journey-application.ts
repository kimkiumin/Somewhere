import { distanceMeters, shortestAngularDelta, trueBearingDegrees } from "../domain/geo";
import { type JourneyState, transitionJourney } from "../domain/journey";
import {
  type ArrivalGate,
  advanceArrivalGate,
  evaluateHeading,
  evaluateLocation,
  INITIAL_NAVIGATION_POLICY,
  initialArrivalGate,
  nextProximity,
} from "../domain/signals";
import type { CuratedDestination, DestinationBundle } from "../platform/curated-destinations";
import { resolveDeclination, selectDestination } from "../platform/curated-destinations";
import type { SensorController, SensorSnapshot } from "./controller";
import type { DiagnosticSessionMetadata, DiagnosticTrace } from "./diagnostics";
import type { Clock, Unsubscribe } from "./ports";

export type JourneyGuidance =
  | { readonly status: "inactive" }
  | { readonly status: "acquiring" }
  | { readonly status: "paused"; readonly reasons: readonly string[] }
  | {
      readonly status: "live";
      readonly distanceM: number;
      readonly targetBearingTrueDeg: number;
      readonly deviceHeadingTrueDeg: number;
      readonly relativeAngleDeg: number;
      readonly locationAccuracyM: number;
      readonly headingAccuracyDeg: number | null;
    };

export type HiddenDestinationView = {
  readonly hint: string;
  readonly estimatedMinutes: number;
};

export type RevealedDestinationView = {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly curationNote: string;
};

export type JourneyApplicationSnapshot = {
  readonly journey: JourneyState;
  readonly sensors: SensorSnapshot;
  readonly guidance: JourneyGuidance;
  readonly hiddenDestination: HiddenDestinationView | null;
  readonly revealedDestination: RevealedDestinationView | null;
  readonly diagnosticEventCount: number;
};

export interface RandomSource {
  nextUnit(): number;
}

export type JourneyApplicationOptions = {
  readonly sensors: SensorController;
  readonly bundle: DestinationBundle;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly todayIsoDate: () => string;
  readonly diagnostics: DiagnosticTrace;
};

export interface JourneyApplication {
  startAdventure(): Promise<void>;
  retrySignals(): Promise<void>;
  beginWalk(): void;
  reveal(): void;
  giveUp(): void;
  reroll(): void;
  subscribe(listener: (snapshot: JourneyApplicationSnapshot) => void): Unsubscribe;
  snapshot(): JourneyApplicationSnapshot;
  exportDiagnostics(metadata: DiagnosticSessionMetadata): string;
  discardDiagnostics(): void;
  destroy(): Promise<void>;
}

function activeDestinationId(journey: JourneyState): string | null {
  switch (journey.phase) {
    case "hidden":
    case "following":
    case "near":
    case "arrived":
    case "revealed":
    case "give-up":
      return journey.destinationId;
    case "idle":
    case "selecting":
      return null;
  }
}

function activeDestination(
  journey: JourneyState,
  destinations: readonly CuratedDestination[],
): CuratedDestination | null {
  const id = activeDestinationId(journey);
  if (id === null) {
    return null;
  }
  return destinations.find((destination) => destination.id === id) ?? null;
}

function isGuidedPhase(journey: JourneyState): boolean {
  return journey.phase === "following" || journey.phase === "near";
}

function pauseReasonsFromSensors(sensors: SensorSnapshot): readonly string[] {
  switch (sensors.guidance.status) {
    case "paused":
      return sensors.guidance.reasons;
    case "inactive":
    case "acquiring":
    case "live":
      return [];
  }
}

export function createJourneyApplication(options: JourneyApplicationOptions): JourneyApplication {
  let journey: JourneyState = { phase: "idle" };
  let sensorSnapshot = options.sensors.snapshot();
  let guidance: JourneyGuidance = { status: "inactive" };
  let arrivalGate: ArrivalGate = initialArrivalGate();
  let lastProcessedLocationAtMs: number | null = null;
  let lastRecordedLocationAtMs: number | null = null;
  let lastRecordedHeadingAtMs: number | null = null;
  const listeners = new Set<(snapshot: JourneyApplicationSnapshot) => void>();

  function destination(): CuratedDestination | null {
    return activeDestination(journey, options.bundle.destinations);
  }

  function hiddenDestination(): HiddenDestinationView | null {
    const selected = destination();
    if (
      selected === null ||
      journey.phase === "idle" ||
      journey.phase === "selecting" ||
      journey.phase === "revealed" ||
      journey.phase === "give-up"
    ) {
      return null;
    }
    return {
      hint: selected.hint,
      estimatedMinutes: selected.estimatedMinutes,
    };
  }

  function revealedDestination(): RevealedDestinationView | null {
    const selected = destination();
    if (selected === null || (journey.phase !== "revealed" && journey.phase !== "give-up")) {
      return null;
    }
    return {
      name: selected.reveal.name,
      category: selected.reveal.category,
      description: selected.reveal.description,
      curationNote: selected.curation.note,
    };
  }

  function snapshot(): JourneyApplicationSnapshot {
    return {
      journey,
      sensors: sensorSnapshot,
      guidance,
      hiddenDestination: hiddenDestination(),
      revealedDestination: revealedDestination(),
      diagnosticEventCount: options.diagnostics.snapshot().length,
    };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  function recordSensorSamples(): void {
    if (
      sensorSnapshot.location.status === "live" &&
      sensorSnapshot.location.sample.capturedAtMs !== lastRecordedLocationAtMs
    ) {
      const sample = sensorSnapshot.location.sample;
      lastRecordedLocationAtMs = sample.capturedAtMs;
      options.diagnostics.record({
        type: "location",
        capturedAtMs: sample.capturedAtMs,
        values: {
          latitude: sample.coordinates.latitude,
          longitude: sample.coordinates.longitude,
          accuracyM: sample.accuracyM,
          movementHeadingTrueDeg: sample.movementHeadingTrueDeg ?? null,
          speedMps: sample.speedMps ?? null,
        },
      });
    }
    if (
      sensorSnapshot.heading.status === "live" &&
      sensorSnapshot.heading.sample.capturedAtMs !== lastRecordedHeadingAtMs
    ) {
      const sample = sensorSnapshot.heading.sample;
      lastRecordedHeadingAtMs = sample.capturedAtMs;
      options.diagnostics.record({
        type: "heading",
        capturedAtMs: sample.capturedAtMs,
        values: {
          degrees: sample.degrees,
          reference: sample.reference,
          accuracyDeg: sample.accuracyDeg,
        },
      });
    }
  }

  function updateJourneyFromLocation(
    distanceM: number,
    accuracyM: number,
    capturedAtMs: number,
  ): void {
    if (capturedAtMs === lastProcessedLocationAtMs) {
      return;
    }
    lastProcessedLocationAtMs = capturedAtMs;
    arrivalGate = advanceArrivalGate(
      arrivalGate,
      { distanceM, accuracyM, capturedAtMs },
      INITIAL_NAVIGATION_POLICY,
    );
    if (arrivalGate.arrived) {
      journey = transitionJourney(journey, { type: "arrived" });
      options.diagnostics.record({
        type: "journey",
        capturedAtMs,
        values: { phase: "arrived" },
      });
      return;
    }

    if (journey.phase === "following" || journey.phase === "near") {
      const proximity = nextProximity(journey.phase, distanceM, INITIAL_NAVIGATION_POLICY);
      if (proximity === "near" && journey.phase === "following") {
        journey = transitionJourney(journey, { type: "near" });
      } else if (proximity === "following" && journey.phase === "near") {
        journey = transitionJourney(journey, { type: "far" });
      }
    }
  }

  function deriveGuidance(): void {
    if (!isGuidedPhase(journey)) {
      guidance = { status: "inactive" };
      return;
    }
    if (sensorSnapshot.guidance.status === "paused") {
      guidance = {
        status: "paused",
        reasons: pauseReasonsFromSensors(sensorSnapshot),
      };
      return;
    }
    if (sensorSnapshot.location.status !== "live" || sensorSnapshot.heading.status !== "live") {
      guidance = { status: "acquiring" };
      return;
    }

    const selected = destination();
    if (selected === null) {
      guidance = { status: "paused", reasons: ["destination-unavailable"] };
      return;
    }
    const locationEvaluation = evaluateLocation(
      sensorSnapshot.location.sample,
      options.clock.nowMs(),
      INITIAL_NAVIGATION_POLICY,
    );
    if (locationEvaluation.status === "invalid") {
      guidance = { status: "paused", reasons: [locationEvaluation.reason] };
      return;
    }
    const declination = resolveDeclination(
      options.bundle.fieldArea,
      locationEvaluation.sample.coordinates,
      options.todayIsoDate(),
    );
    const headingEvaluation = evaluateHeading(
      sensorSnapshot.heading.sample,
      declination,
      INITIAL_NAVIGATION_POLICY,
    );
    if (headingEvaluation.status === "invalid") {
      guidance = { status: "paused", reasons: [headingEvaluation.reason] };
      return;
    }

    const distanceM = distanceMeters(locationEvaluation.sample.coordinates, selected.coordinates);
    const targetBearingTrueDeg = trueBearingDegrees(
      locationEvaluation.sample.coordinates,
      selected.coordinates,
    );
    if (distanceM === null || targetBearingTrueDeg === null) {
      guidance = { status: "paused", reasons: ["guidance-invalid"] };
      return;
    }
    const relativeAngleDeg = shortestAngularDelta(
      headingEvaluation.trueDegrees,
      targetBearingTrueDeg,
    );
    if (relativeAngleDeg === null) {
      guidance = { status: "paused", reasons: ["guidance-invalid"] };
      return;
    }

    guidance = {
      status: "live",
      distanceM,
      targetBearingTrueDeg,
      deviceHeadingTrueDeg: headingEvaluation.trueDegrees,
      relativeAngleDeg,
      locationAccuracyM: locationEvaluation.sample.accuracyM,
      headingAccuracyDeg: sensorSnapshot.heading.sample.accuracyDeg,
    };
    updateJourneyFromLocation(
      distanceM,
      locationEvaluation.sample.accuracyM,
      locationEvaluation.sample.capturedAtMs,
    );
  }

  const stopSensors = options.sensors.subscribe((next) => {
    sensorSnapshot = next;
    recordSensorSamples();
    deriveGuidance();
    notify();
  });

  function selectNext(excludedId: string | null): void {
    const selected = selectDestination(
      options.bundle.destinations,
      excludedId,
      options.random.nextUnit(),
    );
    if (selected === null) {
      return;
    }
    journey = transitionJourney(journey, {
      type: "destination-selected",
      destinationId: selected.id,
    });
    arrivalGate = initialArrivalGate();
    lastProcessedLocationAtMs = null;
    guidance = { status: "inactive" };
  }

  return {
    startAdventure() {
      const sensorStart = options.sensors.startFromUserGesture();
      journey = transitionJourney(journey, { type: "start" });
      selectNext(null);
      options.diagnostics.record({
        type: "journey",
        capturedAtMs: options.clock.nowMs(),
        values: { phase: "hidden" },
      });
      notify();
      return sensorStart;
    },
    retrySignals() {
      return options.sensors.retryFromUserGesture();
    },
    beginWalk() {
      journey = transitionJourney(journey, { type: "follow" });
      deriveGuidance();
      notify();
    },
    reveal() {
      journey = transitionJourney(journey, { type: "reveal" });
      guidance = { status: "inactive" };
      notify();
    },
    giveUp() {
      journey = transitionJourney(journey, { type: "give-up" });
      guidance = { status: "inactive" };
      notify();
    },
    reroll() {
      const excludedId = activeDestinationId(journey);
      journey = transitionJourney(journey, { type: "reroll" });
      selectNext(excludedId);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      let active = true;
      return () => {
        if (active) {
          active = false;
          listeners.delete(listener);
        }
      };
    },
    snapshot,
    exportDiagnostics(metadata) {
      return options.diagnostics.exportJson(metadata);
    },
    discardDiagnostics() {
      options.diagnostics.discard();
      notify();
    },
    async destroy() {
      stopSensors();
      listeners.clear();
      await options.sensors.destroy();
    },
  };
}
