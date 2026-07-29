import { describe, expect, it } from "vitest";

import { JourneyCreateBodyV1Schema, JourneyProjectionV1Schema } from "../../contracts/src/journey";
import {
  buildJourneyPreparation,
  projectCommittedJourney,
  projectReadyJourney,
  projectRevealedJourney,
} from "../src/api/journey-composition";

const CREATE_INPUT = JourneyCreateBodyV1Schema.parse({
  contractVersion: 1,
  constraints: {
    accessibility: [],
    budgetBand: "medium",
    category: "restaurant",
    dietary: [],
    maxWalkMinutes: 30,
  },
  disclosureLevel: "standard",
  origin: {
    accuracyM: 5,
    capturedAt: Date.parse("2026-07-29T00:00:00Z"),
    latitude: 37.54385,
    longitude: 127.03695,
  },
  recoveryCapability: null,
});

describe("hidden journey composition", () => {
  it("builds a real reviewed selection and hides identity before Commit", async () => {
    // Given: the reviewed Seoul Forest fixture and an in-zone restaurant request.
    const prepared = await buildJourneyPreparation({
      body: CREATE_INPUT,
      journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
      now: new Date("2026-07-29T00:00:00Z"),
      requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
      randomUint32: () => 0,
    });

    // When: the ready journey is projected before Commit.
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") {
      throw new TypeError("reviewed fixture unexpectedly failed");
    }
    const projection = projectReadyJourney(prepared, 1, false);

    // Then: it is contract-valid and contains no identity, route, pool, receipt, or endpoint.
    expect(JourneyProjectionV1Schema.safeParse(projection).success).toBe(true);
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("소문난성수감자탕");
    expect(serialized).not.toContain("연무장길");
    expect(serialized).not.toContain("encodedPolyline");
    expect(serialized).not.toContain("receipt");
    expect(serialized).not.toContain("pool");
    expect(serialized).not.toContain("provider");
  });

  it("releases route only after Commit and Reveal preserves phase", async () => {
    // Given: a ready journey produced by the reviewed fixture.
    const prepared = await buildJourneyPreparation({
      body: CREATE_INPUT,
      journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
      now: new Date("2026-07-29T00:00:00Z"),
      requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
      randomUint32: () => 0,
    });
    if (prepared.kind !== "ready") {
      throw new TypeError("reviewed fixture unexpectedly failed");
    }

    // When: Commit projects guidance and Reveal adds identity.
    const committed = projectCommittedJourney(prepared, 2, false);
    const revealed = projectRevealedJourney(committed, prepared.identity, 3);

    // Then: both are exact contracts, route exists after Commit, and phase is stable on Reveal.
    expect(JourneyProjectionV1Schema.safeParse(committed).success).toBe(true);
    expect(committed.phase).toBe("following");
    expect(committed.guidance.kind).toBe("route");
    expect(JourneyProjectionV1Schema.safeParse(revealed).success).toBe(true);
    expect(revealed.phase).toBe(committed.phase);
    expect(revealed.revealed).toBe(true);
  });

  it("fails closed for unsupported origin and constraint mismatch", async () => {
    // Given: requests outside the reviewed origin and outside the fixture category.
    const offZone = {
      ...CREATE_INPUT,
      origin: { ...CREATE_INPUT.origin, latitude: 37.5, longitude: 127.0 },
    };
    const noFit = {
      ...CREATE_INPUT,
      constraints: { ...CREATE_INPUT.constraints, maxWalkMinutes: 1 },
    };

    // When: both requests cross the truthful preparation boundary.
    const [routeResult, fitResult] = await Promise.all([
      buildJourneyPreparation({
        body: offZone,
        journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
        now: new Date("2026-07-29T00:00:00Z"),
        requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
        randomUint32: () => 0,
      }),
      buildJourneyPreparation({
        body: noFit,
        journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
        now: new Date("2026-07-29T00:00:00Z"),
        requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
        randomUint32: () => 0,
      }),
    ]);

    // Then: neither case relaxes policy or invents bearing guidance.
    expect(routeResult).toEqual({ code: "route_unavailable", kind: "error" });
    expect(fitResult).toEqual({ code: "no_fit", kind: "error" });
  });
});
