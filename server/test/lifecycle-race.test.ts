import { describe, expect, it } from "vitest";

import {
  createReadyJourney,
  type JourneyCommand,
  type JourneyState,
  transitionJourney,
} from "../src/journey/aggregate";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
function readyJourney(): JourneyState {
  return createReadyJourney({
    browserBindingDigest: DIGEST_A,
    expiresAt: 90_000,
    journeyId: "journey_todo11_race_0001",
    preparedRoute: {
      geometry: [
        [127.03695, 37.54385],
        [127.05467, 37.542915],
      ],
      originZoneRef: "seoul-forest-main-gate",
      routeDigest: DIGEST_B,
    },
    selectedSnapshot: {
      destinationSnapshotCiphertext: "ciphertext.destination.todo11",
      disclosure: { category: "restaurant", hint: "Korean stew" },
      selectionReceiptId: "receipt_todo11_race_0001",
    },
    sequence: 1,
    writeEpoch: 1,
  });
}

function common(sequence: number, ordinal: number) {
  return {
    bodyDigest: ordinal.toString(16).padStart(64, "0"),
    expectedSequence: sequence,
    idempotencyKeyDigest: (ordinal + 100).toString(16).padStart(64, "0"),
    now: 10_000 + ordinal,
    outcomeCiphertext: `ciphertext.${ordinal}`,
    writeEpoch: 1,
  } as const;
}

describe("Todo11 lifecycle race precedence", () => {
  it("lets a concurrent Stop request defeat arrival that committed first", () => {
    // Given: following guidance and two requests that captured the same sequence.
    const following = transitionJourney(readyJourney(), {
      ...common(1, 1),
      type: "commit",
    }).state;
    const arrival: JourneyCommand = {
      ...common(following.sequence, 2),
      accuracyBand: "good",
      consecutiveSamples: 4,
      dwellMs: 12_000,
      endpointDistanceBand: "within-arrival-threshold",
      routeConsistency: "consistent",
      type: "arrival",
    };
    const stop: JourneyCommand = {
      ...common(following.sequence, 3),
      stopConfirmationId: "stop_todo11_epoch_1",
      type: "stop-request",
    };

    // When: the lower-priority arrival is delivered immediately before Stop.
    const arrivedFirst = transitionJourney(following, arrival);
    const stoppedRace = transitionJourney(arrivedFirst.state, stop);

    // Then: Stop precedence creates a pause and suppresses all direction/arrival work.
    expect(stoppedRace.kind).toBe("applied");
    expect(stoppedRace.state.phase).toBe("paused");
    expect(stoppedRace.state.activeRoute).toBeUndefined();
    expect(stoppedRace.state.feedback).toBeUndefined();
    expect(stoppedRace.state.openStop?.phaseBeforePause).toBe("following");
  });
});
