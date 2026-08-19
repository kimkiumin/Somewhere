import type {
  JourneyCommandDetails,
  LifecycleBody,
  LifecycleMutationAction,
} from "./journey-lifecycle-body";
import type { LifecycleSnapshot } from "./journey-projection";
import type { JourneySnapshot } from "./journey-request";

export function predictSnapshot(
  action: LifecycleMutationAction,
  body: LifecycleBody,
  snapshot: JourneySnapshot,
  details: JourneyCommandDetails,
  now: number,
): LifecycleSnapshot {
  const next = { ...snapshot, sequence: snapshot.sequence + 1 };
  switch (action) {
    case "commit":
      return { ...next, phase: snapshot.activeRoute === undefined ? "committed" : "following" };
    case "reveal":
      return { ...next, revealed: true };
    case "stop-request": {
      if (!("stopConfirmationId" in details)) {
        throw new TypeError("Stop command is missing confirmation ID");
      }
      const phaseBeforePause =
        snapshot.phase === "arrived" ? "following" : resumable(snapshot.phase);
      if (phaseBeforePause === undefined) {
        return next;
      }
      return {
        ...next,
        feedback: undefined,
        openStop: {
          confirmationId: details.stopConfirmationId,
          phaseBeforePause,
        },
        phase: "paused",
        routeRepair: { status: "idle" },
      };
    }
    case "continue": {
      const openStop = snapshot.openStop;
      return openStop === undefined
        ? next
        : { ...next, phase: openStop.phaseBeforePause, routeRepair: undefined };
    }
    case "confirm-stop":
      return {
        ...next,
        activeRoute: undefined,
        phase: "stopped",
        routeRepair: undefined,
        stopReasonState: "required-or-skip",
        stoppedAt: now,
      };
    case "stop-reason":
      return predictCompleted(body, next, now);
    case "route-recover":
      return predictRouteRecovery(body, next);
    case "arrival":
      return predictArrival(body, next, now);
    default:
      return assertNever(action);
  }
}

function predictCompleted(
  body: LifecycleBody,
  next: LifecycleSnapshot,
  now: number,
): LifecycleSnapshot {
  if (!("reason" in body)) {
    throw new TypeError("Stop reason is missing");
  }
  return {
    ...next,
    phase: "completed",
    ...(body.reason === "schedule-changed"
      ? {}
      : { recoveryExpiresAt: (next.stoppedAt ?? now) + 300_000 }),
    stopReasonState: body.reason === "skip" ? "skipped" : "recorded",
  };
}

function predictRouteRecovery(body: LifecycleBody, next: LifecycleSnapshot): LifecycleSnapshot {
  const external = "choice" in body && body.choice === "external-map";
  return {
    ...next,
    ...(next.phase === "paused"
      ? {
          routeRepair: external
            ? { status: "external-map-handed-off" as const }
            : { routeVersion: `repair-${next.sequence}`, status: "ready" as const },
        }
      : { phase: "following" as const }),
    ...(external ? { revealed: true } : {}),
  };
}

function predictArrival(
  body: LifecycleBody,
  next: LifecycleSnapshot,
  now: number,
): LifecycleSnapshot {
  if (!("endpointDistanceBand" in body)) {
    throw new TypeError("Arrival evidence is missing");
  }
  const arrived =
    body.endpointDistanceBand === "within-arrival-threshold" &&
    body.accuracyBand === "good" &&
    body.consecutiveSamples >= 4 &&
    body.dwellMs >= 12_000 &&
    body.dwellMs <= 20_000 &&
    body.routeConsistency === "consistent";
  return arrived
    ? {
        ...next,
        activeRoute: undefined,
        feedback: { dueAt: now + 3_600_000 },
        phase: "arrived",
        revealed: true,
      }
    : {
        ...next,
        phase: body.endpointDistanceBand === "near" ? "near" : "following",
      };
}

function resumable(
  phase: JourneySnapshot["phase"],
): "ready" | "committed" | "following" | "route-recovery" | "near" | undefined {
  switch (phase) {
    case "ready":
    case "committed":
    case "following":
    case "route-recovery":
    case "near":
      return phase;
    default:
      return undefined;
  }
}

function assertNever(value: never): never {
  throw new TypeError(`unhandled lifecycle action: ${String(value)}`);
}
