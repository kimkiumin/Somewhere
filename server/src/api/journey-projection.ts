import {
  type JourneyProjectionV1,
  JourneyProjectionV1Schema,
} from "../../../contracts/src/journey";

import type { JourneyPhase, RouteRepair } from "../journey/types";
import type { PreparedJourney } from "./journey-composition";

export type LifecycleSnapshot = Readonly<{
  activeRoute: unknown;
  feedback:
    | Readonly<{
        dueAt: number;
      }>
    | undefined;
  openStop:
    | Readonly<{
        confirmationId: string;
        phaseBeforePause: "ready" | "committed" | "following" | "route-recovery" | "near";
      }>
    | undefined;
  phase: JourneyPhase;
  recoveryExpiresAt?: number | undefined;
  revealed: boolean;
  routeRepair: RouteRepair | undefined;
  sequence: number;
  stopReasonState?: "required-or-skip" | "recorded" | "skipped" | undefined;
  stopReason?:
    | "safety-concern"
    | "route-or-sensor"
    | "hard-condition"
    | "venue-situation"
    | "changed-mind"
    | "schedule-changed"
    | "skip"
    | undefined;
  stoppedAt?: number | undefined;
}>;

export function projectLifecycleJourney(
  prepared: PreparedJourney,
  snapshot: LifecycleSnapshot,
): JourneyProjectionV1 {
  const selected = {
    contractVersion: 1,
    disclosure: prepared.disclosure,
    journeyId: prepared.journeyId,
    revealed: snapshot.revealed,
    sequence: snapshot.sequence,
    ...(snapshot.revealed ? { reveal: prepared.identity } : {}),
  } as const;
  const canReveal = snapshot.revealed ? [] : ["reveal"];
  let projection: unknown;
  switch (snapshot.phase) {
    case "ready":
      projection = {
        ...selected,
        actions: snapshot.revealed ? ["commit", "stop"] : ["commit", "reveal", "stop"],
        phase: "ready",
      };
      break;
    case "committed":
      projection = {
        ...selected,
        actions: snapshot.revealed ? ["poll", "stop"] : ["poll", "reveal", "stop"],
        guidance: { kind: "unavailable", reason: "route-pending" },
        phase: "committed",
        pollAfterSeconds: 1,
      };
      break;
    case "following":
    case "near":
      projection = {
        ...selected,
        actions: [...canReveal, "stop", "route-recover", "arrival"],
        guidance: routeGuidance(prepared),
        phase: snapshot.phase,
      };
      break;
    case "route-recovery":
      projection = {
        ...selected,
        actions: [...canReveal, "stop", "route-recover"],
        guidance: { kind: "unavailable", reason: routeFailure(snapshot.routeRepair) },
        phase: "route-recovery",
      };
      break;
    case "paused": {
      const openStop = snapshot.openStop;
      if (openStop === undefined) {
        throw new TypeError("paused journey has no open Stop epoch");
      }
      projection = {
        ...selected,
        actions: snapshot.revealed
          ? ["continue", "route-recover", "confirm-stop"]
          : ["continue", "route-recover", "confirm-stop", "reveal"],
        phase: "paused",
        phaseBeforePause: openStop.phaseBeforePause,
        routeRepair: snapshot.routeRepair ?? { status: "idle" },
        stopConfirmation: { copyVersion: "stop-confirmation-v1" },
        stopConfirmationId: openStop.confirmationId,
      };
      break;
    }
    case "stopped":
      projection = {
        ...selected,
        actions: snapshot.revealed
          ? ["record-reason", "skip-reason"]
          : ["record-reason", "skip-reason", "reveal"],
        phase: "stopped",
        stopReasonState: "required-or-skip",
      };
      break;
    case "completed": {
      const eligible = snapshot.recoveryExpiresAt !== undefined;
      projection = {
        ...selected,
        actions: eligible
          ? snapshot.revealed
            ? ["recovery"]
            : ["reveal", "recovery"]
          : snapshot.revealed
            ? []
            : ["reveal"],
        phase: "completed",
        ...(eligible ? { recoveryExpiresAt: snapshot.recoveryExpiresAt } : {}),
        stopReasonState: snapshot.stopReasonState === "skipped" ? "skipped" : "recorded",
      };
      break;
    }
    case "arrived": {
      const feedback = snapshot.feedback;
      if (feedback === undefined) {
        throw new TypeError("arrived journey has no feedback schedule");
      }
      projection = {
        ...selected,
        actions: snapshot.revealed ? [] : ["reveal"],
        feedbackDueAt: feedback.dueAt,
        phase: "arrived",
      };
      break;
    }
    default:
      return assertNever(snapshot.phase);
  }
  return JourneyProjectionV1Schema.parse(projection);
}

function routeGuidance(prepared: PreparedJourney) {
  return {
    encodedPolyline: prepared.route.encodedPolyline,
    expiresAt: prepared.route.expiresAt,
    kind: "route",
    routeDigest: prepared.route.routeDigest,
    routeVersion: prepared.route.routeVersion,
  } as const;
}

function routeFailure(
  repair: RouteRepair | undefined,
): "route-stale" | "location-poor" | "heading-poor" | "provider" {
  return repair?.status === "failed" ? repair.reason : "provider";
}

function assertNever(value: never): never {
  throw new TypeError(`unhandled journey phase: ${String(value)}`);
}
