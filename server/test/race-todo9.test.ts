import { describe, expect, it } from "vitest";

import {
  createReadyJourney,
  type JourneyCommand,
  type JourneyState,
  transitionJourney,
} from "../src/journey/aggregate";

const DIGESTS = ["a", "b", "c", "d", "e", "f"].map((value) => value.repeat(64));

function command(type: JourneyCommand["type"], sequence: number, ordinal: number): JourneyCommand {
  const common = {
    bodyDigest: DIGESTS[ordinal % DIGESTS.length] ?? "a".repeat(64),
    expectedSequence: sequence,
    idempotencyKeyDigest: `${ordinal.toString(16).padStart(64, "0")}`,
    now: 10_000 + ordinal,
    outcomeCiphertext: `ciphertext.${ordinal}`,
    writeEpoch: 9,
  };
  switch (type) {
    case "stop-request":
      return { ...common, stopConfirmationId: "stop_todo9_epoch_1", type };
    case "confirm-stop":
    case "continue":
      return { ...common, stopConfirmationId: "stop_todo9_epoch_1", type };
    case "route-activate":
      return {
        ...common,
        capturedPauseEpoch: 0,
        route: {
          geometry: [
            [127.031, 37.544],
            [127.032, 37.545],
          ],
          originZoneRef: "seoul-forest-zone-a",
          routeDigest: DIGESTS[5] ?? "f".repeat(64),
        },
        type,
      };
    case "arrival":
      return {
        ...common,
        accuracyBand: "good",
        consecutiveSamples: 4,
        dwellMs: 12_000,
        endpointDistanceBand: "within-arrival-threshold",
        routeConsistency: "consistent",
        type,
      };
    case "route-recover":
      return { ...common, choice: "recalibrate", type };
    case "stop-reason":
      return { ...common, reason: "skip", type };
    case "recovery-intent":
      return {
        ...common,
        expiresAt: common.now + 120_000,
        intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA",
        type,
      };
    case "recovery-confirm":
      return { ...common, intentId: "ri_v1.AAAAAAAAAAAAAAAAAAAAAA", type };
    default:
      return { ...common, type };
  }
}

function initialState(): JourneyState {
  return createReadyJourney({
    browserBindingDigest: DIGESTS[0] ?? "a".repeat(64),
    expiresAt: 90_000,
    journeyId: "journey_todo9_race_0001",
    selectedSnapshot: {
      destinationSnapshotCiphertext: "ciphertext.destination.race.todo9",
      disclosure: { category: "restaurant", hint: "tree-lined walk" },
      selectionReceiptId: "receipt_todo9_race_0001",
    },
    sequence: 0,
    writeEpoch: 9,
  });
}

describe("journey race precedence", () => {
  it("keeps confirmed Stop terminal across 1,024 deterministic late-work schedules", () => {
    // Given: schedules that vary Commit, route activation, Stop, Continue, arrival, and repair.
    for (let seed = 0; seed < 1_024; seed += 1) {
      let state = initialState();
      const order: readonly JourneyCommand["type"][] =
        seed % 2 === 0
          ? ["commit", "route-activate", "stop-request", "continue", "confirm-stop", "arrival"]
          : [
              "commit",
              "stop-request",
              "route-activate",
              "continue",
              "confirm-stop",
              "route-repair",
            ];

      // When: each command is serialized, refreshing sequence like independently delivered work.
      for (const [ordinal, type] of order.entries()) {
        const result = transitionJourney(state, command(type, state.sequence, seed * 10 + ordinal));
        state = result.state;
      }
      const late = transitionJourney(
        state,
        command(seed % 3 === 0 ? "continue" : "route-activate", state.sequence, seed + 20_000),
      );

      // Then: Stop is irreversible and no exact route/origin survives.
      expect(late.state.phase, `seed=${seed}`).toBe("stopped");
      expect(late.state.activeRoute, `seed=${seed}`).toBeUndefined();
      expect(late.state.openStop, `seed=${seed}`).toBeUndefined();
    }
  });
});
