import { type JourneyProjectionV1, NAVIGATION_POLICY_V1 } from "@somewhere/contracts";
import {
  type ArrivalState,
  advanceArrivalState,
  initialArrivalState,
} from "../domain/arrival-policy";
import { type Coordinates, distanceMeters } from "../domain/geo";
import type { JourneyState } from "../domain/journey";
import {
  type RouteGuidanceEnvelope,
  type TrustedRoute,
  validateRouteGuidance,
} from "../domain/polyline";
import { initialRouteProgressState, type RouteProgressState } from "../domain/route-progress";
import { nextProximity, type Proximity } from "../domain/signals";
import type { SensorController, SensorSnapshot } from "./controller";
import type { DiagnosticSessionMetadata, DiagnosticTrace } from "./diagnostics";
import { createJourneyDiagnosticRecorder } from "./journey-diagnostics";
import { createJourneyFreshnessWatchdog } from "./journey-freshness";
import { deriveJourneyGuidance, type JourneyGuidance } from "./journey-guidance";
import {
  type HiddenDestinationView,
  hiddenProjectionView,
  type RevealedDestinationView,
  revealedProjectionView,
} from "./journey-view";
import type { Clock, DeadlineScheduler, Unsubscribe } from "./ports";
import type { FeedbackPrompt, JourneyCreateBody, ReactionBody, RecoveryIntent } from "./v2-api";
import type { V2Store, V2StoreFailure } from "./v2-store";

export type { JourneyGuidance } from "./journey-guidance";
export type { HiddenDestinationView, RevealedDestinationView } from "./journey-view";

export type JourneyApplicationSnapshot = Readonly<{
  journey: JourneyState;
  projection: JourneyProjectionV1 | null;
  sensors: SensorSnapshot;
  guidance: JourneyGuidance;
  hiddenDestination: HiddenDestinationView | null;
  revealedDestination: RevealedDestinationView | null;
  diagnosticEventCount: number;
  failure: V2StoreFailure | null;
}>;

export interface JourneyApplication {
  startAdventure(preferences?: JourneyPreferences): Promise<void>;
  retrySignals(): Promise<void>;
  beginWalk(): void;
  reveal(): void;
  stop(): Promise<void>;
  cancelStop(): Promise<void>;
  confirmStop(): Promise<void>;
  recordStopReason(reason: ReactionStopReason): Promise<void>;
  recoverRoute(choice: RouteRecoveryChoice): Promise<void>;
  requestRecovery(): Promise<RecoveryIntent>;
  confirmRecovery(intent: RecoveryIntent, reviewedFields: readonly string[]): Promise<void>;
  eligibleFeedback(): Promise<FeedbackPrompt | null>;
  recordReaction(feedbackId: string, reaction: ReactionBody["reaction"]): Promise<void>;
  giveUp(): void;
  reroll(): void;
  subscribe(listener: (snapshot: JourneyApplicationSnapshot) => void): Unsubscribe;
  snapshot(): JourneyApplicationSnapshot;
  exportDiagnostics(metadata: DiagnosticSessionMetadata): string;
  discardDiagnostics(): void;
  destroy(): Promise<void>;
}

export type JourneyPreferences = Readonly<{
  category: JourneyCreateBody["constraints"]["category"];
  budgetBand: JourneyCreateBody["constraints"]["budgetBand"];
  maxWalkMinutes: number;
  disclosureLevel: JourneyCreateBody["disclosureLevel"];
}>;

export type ReactionStopReason =
  | "safety-concern"
  | "route-or-sensor"
  | "hard-condition"
  | "venue-situation"
  | "changed-mind"
  | "schedule-changed"
  | "skip";

export type RouteRecoveryChoice = "recalibrate" | "reroute" | "cached-route" | "external-map";

export type V2JourneyApplicationOptions = Readonly<{
  sensors: SensorController;
  store: V2Store;
  diagnostics: DiagnosticTrace;
  clock: Clock;
  scheduler: DeadlineScheduler;
  createBody: (
    location: Readonly<{
      accuracyM: number;
      capturedAtMs: number;
      latitude: number;
      longitude: number;
    }>,
  ) => JourneyCreateBody;
}>;

const DECLINATION_CALIBRATION = {
  center: { latitude: 37.544_644_3, longitude: 127.037_376_9 },
  validRadiusM: 2_000,
  degreesEast: -9.011_45,
  calculatedAt: "2026-07-28",
  reviewAfter: "2027-07-28",
} as const;

export function createV2JourneyApplication(
  options: V2JourneyApplicationOptions,
): JourneyApplication {
  const listeners = new Set<(snapshot: JourneyApplicationSnapshot) => void>();
  const recorder = createJourneyDiagnosticRecorder(options.diagnostics);
  const freshness = createJourneyFreshnessWatchdog(options.clock, options.scheduler);
  let sensors = options.sensors.snapshot();
  let previousVisibility = sensors.visibility;
  let visibleSinceMs: number | null = null;
  let guidance: JourneyGuidance = { status: "inactive" };
  let route: TrustedRoute | null = null;
  let routeEnvelope: RouteGuidanceEnvelope | null = null;
  let routeIdentity: string | null = null;
  let routeProgress: RouteProgressState = initialRouteProgressState();
  let arrival: ArrivalState = initialArrivalState();
  let proximity: Proximity = "following";
  let lastProcessedLocationAtMs: number | null = null;
  let arrivalSubmitted = false;
  let validationGeneration = 0;
  let creating = false;
  let creationRequested = false;
  let directionSuppressed = false;
  let resumeAfterMs: number | null = null;
  let recoveryLocationReady: (() => void) | null = null;
  let preferences: JourneyPreferences | null = null;

  function projection(): JourneyProjectionV1 | null {
    return options.store.snapshot().projection;
  }

  function snapshot(): JourneyApplicationSnapshot {
    const serverProjection = projection();
    return {
      journey: journeyWithLocalProximity(serverProjection, proximity),
      projection: serverProjection,
      sensors,
      guidance,
      hiddenDestination: hiddenProjectionView(serverProjection),
      revealedDestination: revealedProjectionView(serverProjection),
      diagnosticEventCount: options.diagnostics.eventCount(),
      failure: options.store.snapshot().failure,
    };
  }

  function notify(): void {
    const next = snapshot();
    for (const listener of listeners) {
      listener(next);
    }
  }

  async function createFromLiveLocation(): Promise<void> {
    if (
      !creationRequested ||
      creating ||
      projection() !== null ||
      sensors.location.status !== "live"
    ) {
      return;
    }
    creating = true;
    const sample = sensors.location.sample;
    const defaultBody = options.createBody({
      accuracyM: sample.accuracyM,
      capturedAtMs: sample.capturedAtMs,
      latitude: sample.coordinates.latitude,
      longitude: sample.coordinates.longitude,
    });
    try {
      await options.store.create(
        preferences === null
          ? defaultBody
          : {
              ...defaultBody,
              constraints: {
                ...defaultBody.constraints,
                budgetBand: preferences.budgetBand,
                category: preferences.category,
                maxWalkMinutes: preferences.maxWalkMinutes,
              },
              disclosureLevel: preferences.disclosureLevel,
            },
      );
    } finally {
      creating = false;
      creationRequested = false;
    }
  }

  function routeFromProjection(
    serverProjection: JourneyProjectionV1 | null,
  ): RouteGuidanceEnvelope | null {
    if (
      serverProjection === null ||
      (serverProjection.phase !== "following" && serverProjection.phase !== "near") ||
      serverProjection.guidance.kind !== "route"
    ) {
      return null;
    }
    return serverProjection.guidance;
  }

  function navigationActive(serverProjection: JourneyProjectionV1 | null): boolean {
    return serverProjection?.phase === "following" || serverProjection?.phase === "near";
  }

  function calibratedDeclination(coordinates: Coordinates): number | null {
    const today = new Date(options.clock.nowMs()).toISOString().slice(0, 10);
    const distanceM = distanceMeters(DECLINATION_CALIBRATION.center, coordinates);
    if (
      today < DECLINATION_CALIBRATION.calculatedAt ||
      today > DECLINATION_CALIBRATION.reviewAfter ||
      distanceM === null ||
      distanceM > DECLINATION_CALIBRATION.validRadiusM
    ) {
      return null;
    }
    return DECLINATION_CALIBRATION.degreesEast;
  }

  function resetRouteEvidence(): void {
    routeProgress = initialRouteProgressState();
    if (!arrival.arrived) {
      arrival = initialArrivalState();
      arrivalSubmitted = false;
    }
    proximity = "following";
    lastProcessedLocationAtMs = null;
  }

  function processLocationEvidence(): void {
    if (guidance.status !== "live") {
      if (!arrival.arrived) {
        arrival = initialArrivalState();
      }
      return;
    }
    if (
      sensors.location.status !== "live" ||
      sensors.location.sample.capturedAtMs === lastProcessedLocationAtMs
    ) {
      return;
    }
    const sample = sensors.location.sample;
    lastProcessedLocationAtMs = sample.capturedAtMs;
    proximity = nextProximity(proximity, guidance.remainingRouteM, NAVIGATION_POLICY_V1);
    arrival = advanceArrivalState(
      arrival,
      {
        endpointDistanceM: guidance.endpointDistanceM,
        accuracyM: sample.accuracyM,
        finalCorridorDeviationM: guidance.finalCorridorDeviationM,
        capturedAtMs: sample.capturedAtMs,
        routeIsFresh: true,
        progressIsCredible: true,
      },
      NAVIGATION_POLICY_V1,
    );
    if (arrival.arrived && !arrivalSubmitted) {
      arrivalSubmitted = true;
      void options.store.mutate({
        action: "arrival",
        body: {
          accuracyBand: "good",
          consecutiveSamples: NAVIGATION_POLICY_V1.arrivalConsecutiveSamples,
          contractVersion: 1,
          dwellMs: NAVIGATION_POLICY_V1.arrivalMinimumDwellMs,
          endpointDistanceBand: "within-arrival-threshold",
          routeConsistency: "consistent",
        },
      });
    }
  }

  function deriveGuidance(): void {
    const serverProjection = projection();
    guidance = deriveJourneyGuidance({
      journey: journeyWithLocalProximity(serverProjection, proximity),
      sensors,
      route,
      routeProgressState: routeProgress,
      declinationDegreesEast:
        sensors.location.status === "live"
          ? calibratedDeclination(sensors.location.sample.coordinates)
          : null,
      visibleSinceMs,
      nowMs: options.clock.nowMs(),
    });
    if (directionSuppressed) {
      guidance = { status: "inactive" };
    }
    if (guidance.routeProgressState !== undefined) {
      routeProgress = guidance.routeProgressState;
    }
    processLocationEvidence();
  }

  function refreshFreshness(): void {
    const serverProjection = projection();
    freshness.refresh(
      sensors,
      navigationActive(serverProjection),
      () => {
        deriveGuidance();
        if (
          route !== null &&
          routeEnvelope !== null &&
          options.clock.nowMs() - route.validatedAtMs > NAVIGATION_POLICY_V1.routeRevalidateAfterMs
        ) {
          void validateEnvelope(routeEnvelope, route.receivedAtMs);
        }
        refreshFreshness();
        notify();
      },
      route,
    );
  }

  async function validateEnvelope(
    envelope: RouteGuidanceEnvelope,
    receivedAtMs: number,
  ): Promise<void> {
    const generation = ++validationGeneration;
    const result = await validateRouteGuidance(envelope, {
      nowMs: options.clock.nowMs(),
      receivedAtMs,
      routeAbsoluteMaxAgeMs: NAVIGATION_POLICY_V1.routeAbsoluteMaxAgeMs,
    });
    if (generation !== validationGeneration) {
      return;
    }
    route = result.ok ? result.route : null;
    deriveGuidance();
    refreshFreshness();
    notify();
  }

  function syncProjectionRoute(
    serverProjection: JourneyProjectionV1 | null,
    receivedFromServer: boolean,
  ): void {
    const nextEnvelope = routeFromProjection(serverProjection);
    if (nextEnvelope === null) {
      validationGeneration += 1;
      route = null;
      routeEnvelope = null;
      routeIdentity = null;
      resetRouteEvidence();
      return;
    }
    const nextIdentity = `${nextEnvelope.routeVersion}:${nextEnvelope.routeDigest}:${nextEnvelope.expiresAt}:${nextEnvelope.encodedPolyline}`;
    if (nextIdentity !== routeIdentity) {
      routeIdentity = nextIdentity;
      routeEnvelope = nextEnvelope;
      route = null;
      resetRouteEvidence();
    }
    if (receivedFromServer || route === null) {
      routeEnvelope = nextEnvelope;
      void validateEnvelope(nextEnvelope, options.clock.nowMs());
    }
  }

  const stopSensors = options.sensors.subscribe((next) => {
    if (previousVisibility === "hidden" && next.visibility === "visible") {
      visibleSinceMs = options.clock.nowMs();
      if (!arrival.arrived) {
        arrival = initialArrivalState();
      }
    }
    if (next.visibility === "hidden") {
      if (!arrival.arrived) {
        arrival = initialArrivalState();
      }
      routeProgress = initialRouteProgressState();
    }
    previousVisibility = next.visibility;
    sensors = next;
    if (recoveryLocationReady !== null && sensors.location.status === "live") {
      const resolve = recoveryLocationReady;
      recoveryLocationReady = null;
      resolve();
    }
    if (
      directionSuppressed &&
      resumeAfterMs !== null &&
      sensors.location.status === "live" &&
      sensors.heading.status === "live" &&
      sensors.location.sample.capturedAtMs > resumeAfterMs &&
      sensors.heading.sample.capturedAtMs > resumeAfterMs
    ) {
      directionSuppressed = false;
      resumeAfterMs = null;
    }
    recorder.recordSensorSamples(next);
    void createFromLiveLocation();
    deriveGuidance();
    refreshFreshness();
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
      freshness.cancel();
    }
    syncProjectionRoute(next.projection, next.status === "ready" || next.status === "conflict");
    deriveGuidance();
    refreshFreshness();
    notify();
  });

  return {
    async startAdventure(nextPreferences) {
      preferences = nextPreferences ?? null;
      creationRequested = true;
      options.diagnostics.beginSession();
      await options.sensors.startFromUserGesture();
      sensors = options.sensors.snapshot();
      await createFromLiveLocation();
      deriveGuidance();
      refreshFreshness();
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
    async stop() {
      directionSuppressed = true;
      resumeAfterMs = null;
      guidance = { status: "inactive" };
      notify();
      await options.store.mutate({ action: "stop-request", body: { contractVersion: 1 } });
    },
    async cancelStop() {
      const serverProjection = projection();
      if (serverProjection?.phase !== "paused") {
        return;
      }
      const locationAt =
        sensors.location.status === "live" ? sensors.location.sample.capturedAtMs : 0;
      const headingAt = sensors.heading.status === "live" ? sensors.heading.sample.capturedAtMs : 0;
      resumeAfterMs = Math.max(locationAt, headingAt);
      await options.store.mutate({
        action: "continue",
        body: {
          contractVersion: 1,
          stopConfirmationId: serverProjection.stopConfirmationId,
        },
      });
    },
    async confirmStop() {
      const serverProjection = projection();
      if (serverProjection?.phase !== "paused") {
        return;
      }
      await options.store.mutate({
        action: "confirm-stop",
        body: {
          contractVersion: 1,
          stopConfirmationId: serverProjection.stopConfirmationId,
        },
      });
    },
    async recordStopReason(reason) {
      await options.store.mutate({
        action: "stop-reason",
        body: { contractVersion: 1, reason, reasonPolicyVersion: "stop-reasons-v1" },
      });
    },
    async recoverRoute(choice) {
      await options.store.mutate({
        action: "route-recover",
        body: { choice, contractVersion: 1 },
      });
    },
    requestRecovery() {
      return options.store.requestRecovery();
    },
    async confirmRecovery(intent, reviewedFields) {
      if (creating) {
        return;
      }
      creating = true;
      try {
        await options.sensors.startFromUserGesture();
        sensors = options.sensors.snapshot();
        if (sensors.location.status !== "live") {
          await new Promise<void>((resolve) => {
            recoveryLocationReady = resolve;
          });
        }
        if (sensors.location.status !== "live") {
          throw new TypeError("Fresh location is required for recovery");
        }
        const body = options.createBody({
          accuracyM: sensors.location.sample.accuracyM,
          capturedAtMs: sensors.location.sample.capturedAtMs,
          latitude: sensors.location.sample.coordinates.latitude,
          longitude: sensors.location.sample.coordinates.longitude,
        });
        const grant = await options.store.confirmRecovery(intent, body.constraints, reviewedFields);
        await options.store.reset();
        await options.store.create({ ...body, recoveryCapability: grant.recoveryCapability });
      } finally {
        creating = false;
      }
    },
    eligibleFeedback: () => options.store.eligibleFeedback(),
    recordReaction(feedbackId, reaction) {
      return options.store.recordReaction(feedbackId, {
        contractVersion: 1,
        reaction,
      });
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
      validationGeneration += 1;
      freshness.cancel();
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

function journeyWithLocalProximity(
  projection: JourneyProjectionV1 | null,
  proximity: Proximity,
): JourneyState {
  const journey = legacyJourney(projection);
  if (journey.phase === "following" && proximity === "near") {
    return { phase: "near", destinationId: journey.destinationId };
  }
  return journey;
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown projection: ${JSON.stringify(value)}`);
}
