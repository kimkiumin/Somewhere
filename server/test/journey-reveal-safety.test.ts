import { describe, expect, it } from "vitest";

import {
  createReadyJourney,
  type JourneyCommand,
  type JourneyState,
  transitionJourney,
} from "../src/journey/aggregate";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const STOP_CONFIRMATION_ID = "sc_v1.AAAAAAAAAAAAAAAAAAAAAA";

function ready(): JourneyState {
  return createReadyJourney({
    browserBindingDigest: DIGEST_A,
    expiresAt: 900_000,
    journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
    preparedRoute: {
      geometry: [
        [127.03, 37.54],
        [127.04, 37.55],
      ],
      originZoneRef: "seoul-forest-main-gate",
      routeDigest: DIGEST_B,
    },
    selectedSnapshot: {
      destinationSnapshotCiphertext: "ciphertext.lifecycle",
      disclosure: { category: "restaurant", hint: "Korean stew" },
      selectionReceiptId: "receipt_lifecycle_0001",
    },
    sequence: 1,
    writeEpoch: 1,
  });
}

function stateFor(phase: JourneyState["phase"]): JourneyState {
  const base = ready();
  switch (phase) {
    case "ready":
      return base;
    case "committed":
      return { ...base, activeRoute: undefined, phase };
    case "following":
    case "route-recovery":
    case "near":
      return { ...base, phase };
    case "paused":
      return {
        ...base,
        openStop: {
          confirmationId: STOP_CONFIRMATION_ID,
          pauseEpoch: 1,
          phaseBeforePause: "following",
        },
        pauseEpoch: 1,
        phase,
        routeRepair: { status: "idle" },
      };
    case "stopped":
      return {
        ...base,
        activeRoute: undefined,
        phase,
        stopReasonState: "required-or-skip",
        stoppedAt: 10_000,
      };
    case "completed":
      return {
        ...base,
        activeRoute: undefined,
        phase,
        recoveryExpiresAt: 310_000,
        stopReasonState: "skipped",
      };
    case "arrived":
      return {
        ...base,
        activeRoute: undefined,
        feedback: { dueAt: 3_610_000, eventId: "event_arrived", status: "scheduled" },
        phase,
        revealed: true,
      };
    default:
      return assertNever(phase);
  }
}

function command(action: "continue" | "external-map" | "reveal", sequence: number): JourneyCommand {
  const common = {
    bodyDigest: DIGEST_A,
    expectedSequence: sequence,
    idempotencyKeyDigest: `${sequence}`.padStart(64, "0"),
    now: 20_000 + sequence,
    outcomeCiphertext: `ciphertext.${sequence}`,
    writeEpoch: 1,
  } as const;
  switch (action) {
    case "continue":
      return { ...common, stopConfirmationId: STOP_CONFIRMATION_ID, type: action };
    case "external-map":
      return { ...common, choice: action, type: "route-recover" };
    case "reveal":
      return { ...common, type: action };
    default:
      return assertNever(action);
  }
}

describe("journey reveal and external-map safety", () => {
  it.each(["ready", "committed", "following", "route-recovery", "near"] as const)(
    "rejects direct Reveal from %s",
    (phase) => {
      const state = stateFor(phase);
      const result = transitionJourney(state, command("reveal", state.sequence));

      expect(result.kind).toBe("illegal_transition");
      expect(result.state.sequence).toBe(state.sequence);
      expect(result.state.revealed).toBe(false);
      expect(result.outbox).toEqual([]);
    },
  );

  it("allows safety Reveal while paused and Continue keeps the identity disclosed", () => {
    const paused = stateFor("paused");
    const revealed = transitionJourney(paused, command("reveal", paused.sequence));
    const continued = transitionJourney(
      revealed.state,
      command("continue", revealed.state.sequence),
    );

    expect(revealed.kind).toBe("applied");
    expect(revealed.state.phase).toBe("paused");
    expect(revealed.state.revealed).toBe(true);
    expect(continued.state.phase).toBe("following");
    expect(continued.state.revealed).toBe(true);
  });

  it("rejects external-map recovery before Stop and accepts it while paused", () => {
    const following = stateFor("following");
    const active = transitionJourney(following, command("external-map", following.sequence));
    expect(active.kind).toBe("illegal_transition");
    expect(active.state.revealed).toBe(false);

    const paused = stateFor("paused");
    const pausedMap = transitionJourney(paused, command("external-map", paused.sequence));
    expect(pausedMap.kind).toBe("applied");
    expect(pausedMap.state.routeRepair).toEqual({ status: "external-map-handed-off" });
    expect(pausedMap.state.revealed).toBe(true);
  });
});

function assertNever(value: never): never {
  throw new TypeError(`unhandled value: ${String(value)}`);
}
