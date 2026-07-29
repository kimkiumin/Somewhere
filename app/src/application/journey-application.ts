import { type JourneyState, transitionJourney } from "../domain/journey";
import {
  type ArrivalGate,
  advanceArrivalGate,
  INITIAL_NAVIGATION_POLICY,
  initialArrivalGate,
  nextProximity,
} from "../domain/signals";
import type { CuratedDestination, DestinationBundle } from "../platform/curated-destinations";
import { selectDestination } from "../platform/curated-destinations";
import type { SensorController, SensorSnapshot } from "./controller";
import type { DiagnosticSessionMetadata, DiagnosticTrace } from "./diagnostics";
import { createJourneyDiagnosticRecorder } from "./journey-diagnostics";
import { createJourneyFreshnessWatchdog } from "./journey-freshness";
import { deriveJourneyGuidance, type JourneyGuidance } from "./journey-guidance";
import {
  activeDestination,
  activeDestinationId,
  type HiddenDestinationView,
  hiddenDestinationView,
  type RevealedDestinationView,
  revealedDestinationView,
} from "./journey-view";
import type { Clock, DeadlineScheduler, Unsubscribe } from "./ports";

export type { JourneyGuidance } from "./journey-guidance";
export type { HiddenDestinationView, RevealedDestinationView } from "./journey-view";

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
  readonly scheduler: DeadlineScheduler;
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

export function createJourneyApplication(options: JourneyApplicationOptions): JourneyApplication {
  let journey: JourneyState = { phase: "idle" };
  let sensorSnapshot = options.sensors.snapshot();
  let guidance: JourneyGuidance = { status: "inactive" };
  let arrivalGate: ArrivalGate = initialArrivalGate();
  let lastProcessedLocationAtMs: number | null = null;
  const diagnosticRecorder = createJourneyDiagnosticRecorder(options.diagnostics);
  const freshness = createJourneyFreshnessWatchdog(options.clock, options.scheduler);
  const listeners = new Set<(snapshot: JourneyApplicationSnapshot) => void>();

  const destination = (): CuratedDestination | null =>
    activeDestination(journey, options.bundle.destinations);

  function hiddenDestination(): HiddenDestinationView | null {
    return hiddenDestinationView(journey, destination());
  }

  function revealedDestination(): RevealedDestinationView | null {
    return revealedDestinationView(journey, destination());
  }

  function snapshot(): JourneyApplicationSnapshot {
    return {
      journey,
      sensors: sensorSnapshot,
      guidance,
      hiddenDestination: hiddenDestination(),
      revealedDestination: revealedDestination(),
      diagnosticEventCount: options.diagnostics.eventCount(),
    };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  function finishCollection(): void {
    freshness.cancel();
    guidance = { status: "inactive" };
    options.sensors.suspend();
    sensorSnapshot = options.sensors.snapshot();
    options.diagnostics.stopRecording();
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
      finishCollection();
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
    guidance = deriveJourneyGuidance({
      journey,
      sensors: sensorSnapshot,
      destination: destination(),
      fieldArea: options.bundle.fieldArea,
      nowMs: options.clock.nowMs(),
      todayIsoDate: options.todayIsoDate(),
    });
    if (guidance.status === "live" && sensorSnapshot.location.status === "live") {
      updateJourneyFromLocation(
        guidance.distanceM,
        sensorSnapshot.location.sample.accuracyM,
        sensorSnapshot.location.sample.capturedAtMs,
      );
    }
  }

  function refreshFreshness(): void {
    freshness.refresh(
      sensorSnapshot,
      journey.phase === "following" || journey.phase === "near",
      () => {
        deriveGuidance();
        refreshFreshness();
        notify();
      },
    );
  }

  const stopSensors = options.sensors.subscribe((next) => {
    sensorSnapshot = next;
    diagnosticRecorder.recordSensorSamples(sensorSnapshot);
    deriveGuidance();
    refreshFreshness();
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
      options.diagnostics.beginSession();
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
      refreshFreshness();
      notify();
    },
    reveal() {
      journey = transitionJourney(journey, { type: "reveal" });
      finishCollection();
      notify();
    },
    giveUp() {
      journey = transitionJourney(journey, { type: "give-up" });
      finishCollection();
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
      freshness.cancel();
      options.diagnostics.stopRecording();
      stopSensors();
      listeners.clear();
      await options.sensors.destroy();
    },
  };
}
