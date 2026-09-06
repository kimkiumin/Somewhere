import { beforeEach, describe, expect, it, vi } from "vitest";

import { JourneyCreateBodyV1Schema } from "../../contracts/src/journey";

const qualifyCandidatesSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/provider/evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/provider/evidence")>();
  qualifyCandidatesSpy.mockImplementation(actual.qualifyCandidates);
  return { ...actual, qualifyCandidates: qualifyCandidatesSpy };
});

import { buildJourneyPreparation } from "../src/api/journey-composition";

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

describe("journey composition hot path", () => {
  beforeEach(() => {
    qualifyCandidatesSpy.mockClear();
  });

  it("qualifies the fixture only once per journey preparation", async () => {
    const result = await buildJourneyPreparation({
      body: CREATE_INPUT,
      journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
      now: new Date("2026-07-29T00:00:00Z"),
      randomUint32: () => 0,
      requestId: "req_v1.AAAAAAAAAAAAAAAAAAAAAA",
    });

    expect(result.kind).toBe("ready");
    expect(qualifyCandidatesSpy).toHaveBeenCalledTimes(1);
  });
});
