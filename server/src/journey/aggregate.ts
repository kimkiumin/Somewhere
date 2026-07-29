import type {
  JourneyCommand,
  JourneyOutboxEvent,
  JourneyState,
  JourneyTransition,
  ReadyJourneyInput,
  ResumablePhase,
} from "./types";

export type {
  JourneyCommand,
  JourneyOutboxEvent,
  JourneyState,
  JourneyTransition,
  ReadyJourneyInput,
} from "./types";

const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;
type StateChange = Readonly<{
  activeRoute?: JourneyState["activeRoute"];
  feedback?: JourneyState["feedback"];
  openStop?: JourneyState["openStop"];
  pauseEpoch?: number;
  phase?: JourneyState["phase"];
  revealed?: boolean;
  routeRepair?: JourneyState["routeRepair"];
  recoveryExpiresAt?: number;
  recoveryIntent?: JourneyState["recoveryIntent"];
  stopReason?: JourneyState["stopReason"];
  stopReasonState?: JourneyState["stopReasonState"];
  stoppedAt?: number;
}>;

function unchanged(state: JourneyState, kind: JourneyTransition["kind"]): JourneyTransition {
  return { kind, outbox: [], state };
}

function isResumablePhase(phase: JourneyState["phase"]): phase is ResumablePhase {
  return (
    phase === "ready" ||
    phase === "committed" ||
    phase === "following" ||
    phase === "route-recovery" ||
    phase === "near"
  );
}

function eventFor(command: JourneyCommand): JourneyOutboxEvent {
  const feedbackDueAt =
    command.type === "arrival" ? command.now + 60 * 60 * 1_000 : command.now + 1_000;
  return {
    attempts: 0,
    eventDigest: command.bodyDigest,
    eventId: `event_${command.idempotencyKeyDigest.slice(0, 48)}`,
    eventType: command.type === "arrival" ? "journey.feedback.eligible" : `journey.${command.type}`,
    expiresAt: command.now + IDEMPOTENCY_RETENTION_MS,
    nextAttemptAt: feedbackDueAt,
    status: "pending",
    writeEpoch: command.writeEpoch,
  };
}

function withOutcome(
  state: JourneyState,
  command: JourneyCommand,
  change: StateChange,
): JourneyTransition {
  const retained = Object.fromEntries(
    Object.entries(state.idempotency).filter(([, outcome]) => outcome.expiresAt > command.now),
  );
  const next: JourneyState = {
    ...state,
    ...change,
    idempotency: {
      ...retained,
      [command.idempotencyKeyDigest]: {
        bodyDigest: command.bodyDigest,
        expiresAt: command.now + IDEMPOTENCY_RETENTION_MS,
        outcomeCiphertext: command.outcomeCiphertext,
      },
    },
    sequence: state.sequence + 1,
  };
  return {
    kind: "applied",
    outbox: [eventFor(command)],
    outcomeCiphertext: command.outcomeCiphertext,
    state: next,
  };
}

export function createReadyJourney(input: ReadyJourneyInput): JourneyState {
  return {
    activeRoute: input.preparedRoute,
    browserBindingDigest: input.browserBindingDigest,
    contractVersion: 1,
    expiresAt: input.expiresAt,
    feedback: undefined,
    idempotency: {},
    journeyId: input.journeyId,
    openStop: undefined,
    pauseEpoch: 0,
    phase: "ready",
    revealed: false,
    recoveryIntent: undefined,
    routeRepair: undefined,
    selectedSnapshot: input.selectedSnapshot,
    sequence: input.sequence,
    writeEpoch: input.writeEpoch,
  };
}

export function transitionJourney(state: JourneyState, command: JourneyCommand): JourneyTransition {
  if (command.writeEpoch !== state.writeEpoch) {
    return unchanged(state, "stale_epoch");
  }
  if (command.now >= state.expiresAt) {
    return unchanged(state, "expired");
  }
  const stored = state.idempotency[command.idempotencyKeyDigest];
  if (stored !== undefined && stored.expiresAt > command.now) {
    if (stored.bodyDigest !== command.bodyDigest) {
      return unchanged(state, "idempotency_conflict");
    }
    return {
      kind: "replay",
      outbox: [],
      outcomeCiphertext: stored.outcomeCiphertext,
      state,
    };
  }
  if (command.type === "confirm-stop") {
    if (
      state.openStop === undefined ||
      state.openStop.confirmationId !== command.stopConfirmationId
    ) {
      return unchanged(state, "illegal_transition");
    }
    return withOutcome(state, command, {
      activeRoute: undefined,
      openStop: undefined,
      phase: "stopped",
      routeRepair: undefined,
      stopReasonState: "required-or-skip",
      stoppedAt: command.now,
    });
  }
  if (
    command.type === "stop-request" &&
    state.phase === "arrived" &&
    state.feedback !== undefined &&
    command.expectedSequence === state.sequence - 1
  ) {
    return withOutcome(state, command, {
      feedback: undefined,
      openStop: {
        confirmationId: command.stopConfirmationId,
        pauseEpoch: state.pauseEpoch + 1,
        phaseBeforePause: "following",
      },
      pauseEpoch: state.pauseEpoch + 1,
      phase: "paused",
      routeRepair: { status: "idle" },
    });
  }
  if (command.expectedSequence !== state.sequence) {
    return unchanged(state, "sequence_conflict");
  }
  if (state.phase === "stopped" || state.phase === "completed" || state.phase === "arrived") {
    if (
      command.type !== "reveal" &&
      !(state.phase === "stopped" && command.type === "stop-reason") &&
      !(
        state.phase === "completed" &&
        (command.type === "recovery-intent" || command.type === "recovery-confirm")
      )
    ) {
      return unchanged(state, "illegal_transition");
    }
  }

  switch (command.type) {
    case "commit":
      return state.phase === "ready"
        ? withOutcome(state, command, {
            phase: state.activeRoute === undefined ? "committed" : "following",
          })
        : unchanged(state, "illegal_transition");
    case "route-activate":
      if (
        (state.phase !== "committed" && state.phase !== "route-recovery") ||
        state.openStop !== undefined ||
        command.capturedPauseEpoch !== state.pauseEpoch
      ) {
        return unchanged(state, "illegal_transition");
      }
      return withOutcome(state, command, {
        activeRoute: command.route,
        phase: "following",
        routeRepair: undefined,
      });
    case "stop-request":
      if (!isResumablePhase(state.phase)) {
        return unchanged(state, "illegal_transition");
      }
      return withOutcome(state, command, {
        openStop: {
          confirmationId: command.stopConfirmationId,
          pauseEpoch: state.pauseEpoch + 1,
          phaseBeforePause: state.phase,
        },
        pauseEpoch: state.pauseEpoch + 1,
        phase: "paused",
        routeRepair: { status: "idle" },
      });
    case "continue":
      if (
        state.phase !== "paused" ||
        state.openStop === undefined ||
        state.openStop.confirmationId !== command.stopConfirmationId
      ) {
        return unchanged(state, "illegal_transition");
      }
      return withOutcome(state, command, {
        phase: state.openStop.phaseBeforePause,
        routeRepair: undefined,
      });
    case "route-repair":
      return state.phase === "paused"
        ? withOutcome(state, command, {
            routeRepair: { choice: "recalibrate", status: "repairing" },
          })
        : unchanged(state, "illegal_transition");
    case "route-recover":
      if (
        state.phase !== "following" &&
        state.phase !== "route-recovery" &&
        state.phase !== "near" &&
        state.phase !== "paused"
      ) {
        return unchanged(state, "illegal_transition");
      }
      if (command.choice === "external-map") {
        return withOutcome(state, command, {
          revealed: true,
          ...(state.phase === "paused"
            ? { routeRepair: { status: "external-map-handed-off" } }
            : {}),
        });
      }
      return withOutcome(state, command, {
        ...(state.phase === "paused"
          ? {
              routeRepair:
                command.routeVersion === undefined
                  ? { choice: command.choice, status: "repairing" }
                  : { routeVersion: command.routeVersion, status: "ready" },
            }
          : { phase: "following", routeRepair: undefined }),
      });
    case "arrival":
      if ((state.phase !== "following" && state.phase !== "near") || state.openStop !== undefined) {
        return unchanged(state, "illegal_transition");
      }
      if (
        command.endpointDistanceBand === "within-arrival-threshold" &&
        command.accuracyBand === "good" &&
        command.consecutiveSamples >= 4 &&
        command.dwellMs >= 12_000 &&
        command.dwellMs <= 20_000 &&
        command.routeConsistency === "consistent"
      ) {
        return withOutcome(state, command, {
          activeRoute: undefined,
          feedback: {
            dueAt: command.now + 60 * 60 * 1_000,
            eventId: `event_${command.idempotencyKeyDigest.slice(0, 48)}`,
            status: "scheduled",
          },
          phase: "arrived",
          routeRepair: undefined,
        });
      }
      return withOutcome(state, command, {
        phase: command.endpointDistanceBand === "near" ? "near" : "following",
      });
    case "stop-reason":
      return state.phase === "stopped" && state.stopReasonState === "required-or-skip"
        ? withOutcome(state, command, {
            phase: "completed",
            stopReason: command.reason,
            stopReasonState: command.reason === "skip" ? "skipped" : "recorded",
            ...(command.reason === "schedule-changed"
              ? {}
              : { recoveryExpiresAt: (state.stoppedAt ?? command.now) + 300_000 }),
          })
        : unchanged(state, "illegal_transition");
    case "recovery-intent":
      return state.phase === "completed" &&
        state.recoveryExpiresAt !== undefined &&
        command.now < state.recoveryExpiresAt
        ? withOutcome(state, command, {
            recoveryIntent: { expiresAt: command.expiresAt, intentId: command.intentId },
          })
        : unchanged(state, "illegal_transition");
    case "recovery-confirm":
      return state.phase === "completed" &&
        state.recoveryIntent?.intentId === command.intentId &&
        command.now < state.recoveryIntent.expiresAt
        ? withOutcome(state, command, { recoveryIntent: undefined })
        : unchanged(state, "illegal_transition");
    case "reveal":
      return state.revealed
        ? unchanged(state, "illegal_transition")
        : withOutcome(state, command, { revealed: true });
  }
}
