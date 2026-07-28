import { describe, expect, test } from "vitest";
import { transitionJourney } from "./journey";

describe("journey state", () => {
  test("stores only the hidden destination identifier before reveal", () => {
    const selecting = transitionJourney({ phase: "idle" }, { type: "start" });
    const hidden = transitionJourney(selecting, {
      type: "destination-selected",
      destinationId: "mirror-pond",
    });

    expect(hidden).toEqual({ phase: "hidden", destinationId: "mirror-pond" });
    expect(JSON.stringify(hidden)).not.toContain("거울연못");
  });

  test("supports the full journey and latches arrival", () => {
    const hidden = transitionJourney(
      { phase: "selecting" },
      { type: "destination-selected", destinationId: "family-yard" },
    );
    const following = transitionJourney(hidden, { type: "follow" });
    const near = transitionJourney(following, { type: "near" });
    const arrived = transitionJourney(near, { type: "arrived" });

    expect(transitionJourney(arrived, { type: "far" })).toEqual(arrived);
    expect(transitionJourney(arrived, { type: "reveal" })).toEqual({
      phase: "revealed",
      destinationId: "family-yard",
    });
  });

  test("keeps safety exits and reroll available while active", () => {
    const following = { phase: "following", destinationId: "lake" } as const;

    expect(transitionJourney(following, { type: "give-up" })).toEqual({
      phase: "give-up",
      destinationId: "lake",
    });
    expect(transitionJourney(following, { type: "reroll" })).toEqual({
      phase: "selecting",
      excludeDestinationId: "lake",
    });
  });
});
