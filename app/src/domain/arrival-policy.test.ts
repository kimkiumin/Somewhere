import { NAVIGATION_POLICY_V1 } from "@somewhere/contracts";
import { describe, expect, test } from "vitest";
import { type ArrivalEvidence, advanceArrivalState, initialArrivalState } from "./arrival-policy";

const sample = (
  capturedAtMs: number,
  overrides: Partial<ArrivalEvidence> = {},
): ArrivalEvidence => ({
  endpointDistanceM: 30,
  accuracyM: 25,
  finalCorridorDeviationM: 25,
  capturedAtMs,
  routeIsFresh: true,
  progressIsCredible: true,
  ...overrides,
});

describe("strong arrival policy", () => {
  test("TASK16_ARRIVAL_REQUIRES_FOUR_SAMPLES_AND_12S_DWELL", () => {
    let state = initialArrivalState();
    for (const timeMs of [0, 4_000, 8_000]) {
      state = advanceArrivalState(state, sample(timeMs), NAVIGATION_POLICY_V1);
      expect(state.arrived).toBe(false);
    }
    state = advanceArrivalState(state, sample(11_999), NAVIGATION_POLICY_V1);
    expect(state.arrived).toBe(false);

    state = initialArrivalState();
    for (const timeMs of [0, 4_000, 8_000, 12_000]) {
      state = advanceArrivalState(state, sample(timeMs), NAVIGATION_POLICY_V1);
    }
    expect(state.arrived).toBe(true);
  });

  test("TASK16_ARRIVAL_RESETS_ON_EACH_FAILED_GATE_AND_20001MS_WINDOW", () => {
    for (const overrides of [
      { endpointDistanceM: 30.001 },
      { accuracyM: 25.001 },
      { finalCorridorDeviationM: 25.001 },
      { routeIsFresh: false },
      { progressIsCredible: false },
    ]) {
      const seeded = advanceArrivalState(
        initialArrivalState(),
        sample(1_000),
        NAVIGATION_POLICY_V1,
      );
      expect(advanceArrivalState(seeded, sample(2_000, overrides), NAVIGATION_POLICY_V1)).toEqual(
        initialArrivalState(),
      );
    }

    let state = initialArrivalState();
    for (const timeMs of [0, 6_000, 12_000, 20_001]) {
      state = advanceArrivalState(state, sample(timeMs), NAVIGATION_POLICY_V1);
    }
    expect(state.arrived).toBe(false);
    expect(state.qualifyingTimesMs).not.toContain(0);
  });

  test("TASK16_ARRIVAL_LATCH survives later bad samples", () => {
    let state = initialArrivalState();
    for (const timeMs of [0, 4_000, 8_000, 12_000]) {
      state = advanceArrivalState(state, sample(timeMs), NAVIGATION_POLICY_V1);
    }
    expect(
      advanceArrivalState(
        state,
        sample(13_000, { accuracyM: 100, routeIsFresh: false }),
        NAVIGATION_POLICY_V1,
      ).arrived,
    ).toBe(true);
  });
});
