import type { JourneyProjectionV1 } from "@somewhere/contracts";
import type { JourneyState } from "../domain/journey";
import type { SensorController, SensorSnapshot } from "./controller";
import type { DiagnosticSessionMetadata, DiagnosticTrace } from "./diagnostics";
import { createJourneyDiagnosticRecorder } from "./journey-diagnostics";
import type { JourneyGuidance } from "./journey-guidance";
import {
  type HiddenDestinationView,
  hiddenProjectionView,
  type RevealedDestinationView,
  revealedProjectionView,
} from "./journey-view";
import type { Unsubscribe } from "./ports";
import type { JourneyCreateBody } from "./v2-api";
import type { V2Store } from "./v2-store";

export type { JourneyGuidance } from "./journey-guidance";
export type { HiddenDestinationView, RevealedDestinationView } from "./journey-view";

export type JourneyApplicationSnapshot = Readonly<{
  journey: JourneyState;
  sensors: SensorSnapshot;
  guidance: JourneyGuidance;
  hiddenDestination: HiddenDestinationView | null;
  revealedDestination: RevealedDestinationView | null;
  diagnosticEventCount: number;
}>;

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

export type V2JourneyApplicationOptions = Readonly<{
  sensors: SensorController;
  store: V2Store;
  diagnostics: DiagnosticTrace;
  createBody: (
    location: Readonly<{
      accuracyM: number;
      capturedAtMs: number;
      latitude: number;
      longitude: number;
    }>,
  ) => JourneyCreateBody;
}>;

export function createV2JourneyApplication(
  options: V2JourneyApplicationOptions,
): JourneyApplication {
  const listeners = new Set<(snapshot: JourneyApplicationSnapshot) => void>();
  const recorder = createJourneyDiagnosticRecorder(options.diagnostics);
  let sensors = options.sensors.snapshot();
  let creating = false;

  function projection(): JourneyProjectionV1 | null {
    return options.store.snapshot().projection;
  }

  function snapshot(): JourneyApplicationSnapshot {
    const serverProjection = projection();
    return {
      journey: legacyJourney(serverProjection),
      sensors,
      guidance: { status: "inactive" },
      hiddenDestination: hiddenProjectionView(serverProjection),
      revealedDestination: revealedProjectionView(serverProjection),
      diagnosticEventCount: options.diagnostics.eventCount(),
    };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  async function createFromLiveLocation(): Promise<void> {
    if (creating || projection() !== null || sensors.location.status !== "live") {
      return;
    }
    creating = true;
    const sample = sensors.location.sample;
    await options.store.create(
      options.createBody({
        accuracyM: sample.accuracyM,
        capturedAtMs: sample.capturedAtMs,
        latitude: sample.coordinates.latitude,
        longitude: sample.coordinates.longitude,
      }),
    );
    creating = false;
  }

  const stopSensors = options.sensors.subscribe((next) => {
    sensors = next;
    recorder.recordSensorSamples(next);
    void createFromLiveLocation();
    notify();
  });
  const stopStore = options.store.subscribe((next) => {
    if (
      next.projection?.phase === "arrived" ||
      next.projection?.phase === "completed" ||
      next.projection?.phase === "expired"
    ) {
      options.sensors.suspend();
      sensors = options.sensors.snapshot();
      options.diagnostics.stopRecording();
    }
    notify();
  });

  return {
    async startAdventure() {
      options.diagnostics.beginSession();
      await options.sensors.startFromUserGesture();
      sensors = options.sensors.snapshot();
      await createFromLiveLocation();
      notify();
    },
    async retrySignals() {
      if (options.store.snapshot().failure?.retryable === true) {
        await options.store.retry();
      }
      await options.sensors.retryFromUserGesture();
    },
    beginWalk() {
      void options.store.mutate({ action: "commit", body: { contractVersion: 1 } });
    },
    reveal() {
      void options.store.mutate({ action: "reveal", body: { contractVersion: 1 } });
    },
    giveUp() {
      notify();
      void options.store.mutate({ action: "stop-request", body: { contractVersion: 1 } });
    },
    reroll() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    exportDiagnostics: (metadata) => options.diagnostics.exportJson(metadata),
    discardDiagnostics() {
      options.diagnostics.discard();
      notify();
    },
    async destroy() {
      stopSensors();
      stopStore();
      listeners.clear();
      await options.sensors.destroy();
    },
  };
}

function legacyJourney(projection: JourneyProjectionV1 | null): JourneyState {
  if (projection === null || projection.phase === "expired") {
    return { phase: "idle" };
  }
  if (projection.phase === "finding") {
    return { phase: "selecting" };
  }
  const destinationId = projection.journeyId;
  switch (projection.phase) {
    case "ready":
      return { phase: "hidden", destinationId };
    case "near":
      return { phase: "near", destinationId };
    case "arrived":
      return { phase: "arrived", destinationId };
    case "stopped":
    case "completed":
      return { phase: "give-up", destinationId };
    case "committed":
    case "following":
    case "paused":
    case "route-recovery":
      return { phase: "following", destinationId };
    default:
      return assertNever(projection);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown projection: ${JSON.stringify(value)}`);
}
