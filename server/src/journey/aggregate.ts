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
    });
  }
  if (command.expectedSequence !== state.sequence) {
    return unchanged(state, "sequence_conflict");
  }
  if (state.phase === "stopped" || state.phase === "completed" || state.phase === "arrived") {
    if (command.type !== "reveal") {
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
      if (!isResumablePhase(state.phase) || state.openStop !== undefined) {
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
      });
    case "continue":
      if (
        state.phase !== "paused" ||
        state.openStop === undefined ||
        state.openStop.confirmationId !== command.stopConfirmationId
      ) {
        return unchanged(state, "illegal_transition");
      }
      return withOutcome(state, command, { phase: state.openStop.phaseBeforePause });
    case "route-repair":
      return state.phase === "paused"
        ? withOutcome(state, command, {
            routeRepair: { status: "checking", updatedAt: command.now },
          })
        : unchanged(state, "illegal_transition");
    case "arrival":
      if ((state.phase !== "following" && state.phase !== "near") || state.openStop !== undefined) {
        return unchanged(state, "illegal_transition");
      }
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
    case "reveal":
      return withOutcome(state, command, { revealed: true });
  }
}
