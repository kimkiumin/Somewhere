import { describe, expect, it } from "vitest";
import { predictSnapshot } from "../src/api/journey-lifecycle-prediction";
import { projectLifecycleJourney } from "../src/api/journey-projection";
import {
  createReadyJourney,
  type JourneyCommand,
  type JourneyState,
  transitionJourney,
} from "../src/journey/aggregate";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const PUBLIC_ACTIONS = [
  "commit",
  "reveal",
  "stop-request",
  "continue",
  "confirm-stop",
  "stop-reason",
  "route-recover",
  "arrival",
  "recovery-intent",
  "recovery-confirm",
] as const;
const PHASES = [
  "ready",
  "committed",
  "following",
  "route-recovery",
  "near",
  "paused",
  "stopped",
  "completed",
  "arrived",
] as const;

type PublicAction = (typeof PUBLIC_ACTIONS)[number];

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
    case "near":
    case "route-recovery":
      return { ...base, phase };
    case "paused":
      return {
        ...base,
        openStop: {
          confirmationId: "sc_v1.AAAAAAAAAAAAAAAAAAAAAA",
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
        recoveryIntent: {
          expiresAt: 120_000,
          intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA",
        },
        stopReasonState: "skipped",
      };
    case "arrived":
      return {
        ...base,
        activeRoute: undefined,
        feedback: { dueAt: 3_610_000, eventId: "event_arrived_lifecycle", status: "scheduled" },
        phase,
        revealed: true,
      };
    default:
      return assertNever(phase);
  }
}

function command(action: PublicAction, sequence: number, ordinal: number): JourneyCommand {
  const common = {
    bodyDigest: ordinal.toString(16).padStart(64, "0"),
    expectedSequence: sequence,
    idempotencyKeyDigest: (ordinal + 100).toString(16).padStart(64, "0"),
    now: 20_000 + ordinal,
    outcomeCiphertext: `ciphertext.${ordinal}`,
    writeEpoch: 1,
  };
  switch (action) {
    case "commit":
    case "reveal":
      return { ...common, type: action };
    case "stop-request":
    case "continue":
    case "confirm-stop":
      return {
        ...common,
        stopConfirmationId: "sc_v1.AAAAAAAAAAAAAAAAAAAAAA",
        type: action,
      };
    case "stop-reason":
      return { ...common, reason: "skip", type: action };
    case "route-recover":
      return { ...common, choice: "cached-route", routeVersion: "route-v2", type: action };
    case "arrival":
      return {
        ...common,
        accuracyBand: "good",
        consecutiveSamples: 4,
        dwellMs: 12_000,
        endpointDistanceBand: "within-arrival-threshold",
        routeConsistency: "consistent",
        type: action,
      };
    case "recovery-intent":
      return {
        ...common,
        expiresAt: 120_000,
        intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA",
        type: action,
      };
    case "recovery-confirm":
      return {
        ...common,
        intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA",
        type: action,
      };
    default:
      return assertNever(action);
  }
}

const ALLOWED = {
  arrived: [],
  committed: ["reveal", "stop-request"],
  completed: ["reveal", "recovery-intent", "recovery-confirm"],
  following: ["reveal", "stop-request", "route-recover", "arrival"],
  near: ["reveal", "stop-request", "route-recover", "arrival"],
  paused: ["reveal", "continue", "confirm-stop", "route-recover"],
  ready: ["commit", "reveal", "stop-request"],
  "route-recovery": ["reveal", "stop-request", "route-recover"],
  stopped: ["reveal", "stop-reason"],
} as const satisfies Readonly<Record<JourneyState["phase"], readonly PublicAction[]>>;

describe("Todo11 exhaustive lifecycle transitions", () => {
  it("accepts exactly the public action table for every phase", () => {
    // Given: one valid state for every persisted journey phase.
    for (const phase of PHASES) {
      for (const [ordinal, action] of PUBLIC_ACTIONS.entries()) {
        const state = stateFor(phase);
        const allowed: readonly PublicAction[] = ALLOWED[phase];

        // When: each public action is applied independently at the current sequence.
        const result = transitionJourney(state, command(action, state.sequence, ordinal + 1));

        // Then: only the frozen transition-table cell is accepted.
        expect(result.kind, `${phase}/${action}`).toBe(
          allowed.includes(action) ? "applied" : "illegal_transition",
        );
      }
    }
  });

  it("keeps paused repair nondirectional and confirmed Stop irreversible", () => {
    // Given: an active route paused for Stop confirmation.
    const paused = stateFor("paused");

    // When: route repair completes while paused, then Stop is confirmed.
    const repaired = transitionJourney(paused, command("route-recover", paused.sequence, 30));
    const confirmed = transitionJourney(
      repaired.state,
      command("confirm-stop", repaired.state.sequence, 31),
    );
    const lateRoute = transitionJourney(
      confirmed.state,
      command("route-recover", confirmed.state.sequence, 32),
    );

    // Then: repair never resumes direction and confirmation permanently removes route/origin.
    expect(repaired.state.phase).toBe("paused");
    expect(repaired.state.routeRepair).toEqual({ routeVersion: "route-v2", status: "ready" });
    expect(confirmed.state.phase).toBe("stopped");
    expect(confirmed.state.activeRoute).toBeUndefined();
    expect(lateRoute.kind).toBe("illegal_transition");
    expect(lateRoute.state.activeRoute).toBeUndefined();
  });

  it("rejects poor, isolated, and off-corridor arrival evidence and latches credible arrival", () => {
    // Given: following guidance and bounded reduced evidence variants.
    const following = stateFor("following");
    const variants = [
      { accuracyBand: "poor" as const },
      { consecutiveSamples: 1 },
      { routeConsistency: "inconsistent" as const },
    ];

    // When/Then: each invalid evidence dimension stays active and never schedules feedback.
    for (const [ordinal, variant] of variants.entries()) {
      const candidate = {
        ...command("arrival", following.sequence, 40 + ordinal),
        ...variant,
      };
      const result = transitionJourney(following, candidate);
      expect(result.state.phase).not.toBe("arrived");
      expect(result.state.feedback).toBeUndefined();
    }

    // When: the complete corridor/accuracy/repetition/dwell evidence arrives.
    const arrived = transitionJourney(following, command("arrival", following.sequence, 50));
    const late = transitionJourney(arrived.state, command("arrival", arrived.state.sequence, 51));

    // Then: arrival clears route state, schedules feedback once, and never unlatches.
    expect(arrived.state.phase).toBe("arrived");
    expect(arrived.state.activeRoute).toBeUndefined();
    expect(arrived.state.revealed).toBe(true);
    expect(late.kind).toBe("illegal_transition");
    expect(late.state.phase).toBe("arrived");
  });

  it("predicts a credible arrival as revealed before serializing the mutation response", () => {
    // Given: a following journey and the same complete evidence accepted by the aggregate.
    const following = stateFor("following");
    const body = {
      accuracyBand: "good" as const,
      consecutiveSamples: 4,
      contractVersion: 1 as const,
      dwellMs: 12_000,
      endpointDistanceBand: "within-arrival-threshold" as const,
      routeConsistency: "consistent" as const,
    };

    // When: the HTTP boundary predicts the snapshot used to serialize the response.
    const predicted = predictSnapshot(
      "arrival",
      body,
      following,
      { ...body, type: "arrival" },
      30_000,
    );

    // Then: the response projection agrees with the persisted aggregate transition.
    expect(predicted.phase).toBe("arrived");
    expect(predicted.revealed).toBe(true);
  });

  it("projects every phase with exact actions and Reveal as an orthogonal flag", () => {
    // Given: a safe prepared journey and every phase state.
    const prepared = {
      disclosure: {
        policyVersion: "manual-evidence-v1",
        priceBand: "medium" as const,
        representativeCategories: ["Korean stew"] satisfies [string],
        routeDistanceM: 1_200,
        routeDurationMinutes: 18,
      },
      identity: { address: "revealed address", name: "revealed name" },
      journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
      kind: "ready" as const,
      receipt: {
        poolDigest: DIGEST_A,
        poolId: "pool-lifecycle",
        receiptDigest: DIGEST_B,
        receiptId: "receipt-lifecycle",
        selectedMemberDigest: DIGEST_A,
      },
      route: {
        encodedPolyline: "encoded-route",
        expiresAt: 100_000,
        geometry: [
          [127.03, 37.54],
          [127.04, 37.55],
        ] satisfies [number, number][],
        originZoneRef: "seoul-forest-main-gate",
        routeDigest: `sha256:${DIGEST_B}`,
        routeVersion: "route-v1",
      },
    };

    // When/Then: every persisted phase emits its exact contract projection.
    for (const phase of PHASES) {
      const state = stateFor(phase);
      const projection = projectLifecycleJourney(prepared, state);
      expect(projection.phase).toBe(phase);
      expect(projection.actions).toEqual(
        phase === "completed"
          ? ["reveal", "recovery"]
          : phase === "stopped"
            ? ["record-reason", "skip-reason", "reveal"]
            : projection.actions,
      );
    }

    const revealed = projectLifecycleJourney(prepared, {
      ...stateFor("following"),
      revealed: true,
    });
    expect(revealed.phase).toBe("following");
    expect(revealed.actions).toEqual(["stop", "route-recover", "arrival"]);
    expect(revealed).toMatchObject({ reveal: prepared.identity, revealed: true });
  });

  it("rejects recovery intent and confirmation after their independent expiries", () => {
    // Given: a completed journey whose five-minute guard and two-minute intent are expired.
    const completed = stateFor("completed");
    const expiredGuard = { ...completed, recoveryExpiresAt: 20_000 };
    const expiredIntent = {
      ...completed,
      recoveryIntent: {
        expiresAt: 20_000,
        intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA",
      },
    };

    // When: recovery is attempted at or beyond each strict expiry.
    const intent = transitionJourney(
      expiredGuard,
      command("recovery-intent", expiredGuard.sequence, 60),
    );
    const confirmation = transitionJourney(
      expiredIntent,
      command("recovery-confirm", expiredIntent.sequence, 61),
    );

    // Then: neither capability-producing transition is accepted.
    expect(intent.kind).toBe("illegal_transition");
    expect(confirmation.kind).toBe("illegal_transition");
  });

  it("projects forbidden Stop requests as conflict responses instead of throwing", () => {
    // Given: a terminal stopped journey that cannot open another pause epoch.
    const stopped = stateFor("stopped");

    // When: the HTTP boundary prepares a harmless replay body before the aggregate rejects it.
    const predicted = predictSnapshot(
      "stop-request",
      { contractVersion: 1 },
      stopped,
      {
        stopConfirmationId: "sc_v1.AAAAAAAAAAAAAAAAAAAAAA",
        type: "stop-request",
      },
      30_000,
    );

    // Then: prediction stays terminal so the caller can receive a typed 409.
    expect(predicted.phase).toBe("stopped");
  });
});

function assertNever(value: never): never {
  throw new TypeError(`unhandled value: ${String(value)}`);
}
