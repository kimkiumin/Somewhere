import { describe, expect, it } from "vitest";

import { decideAdmission } from "../src/admission/admission";
import type { MeterSample } from "../src/admission/meter";

function meters(fraction: number): readonly MeterSample[] {
  return (["worker", "d1", "do", "queue", "provider"] as const).map((group) => ({
    cap: 100,
    group,
    localFinalized: 0,
    observed: fraction * 100,
    observedAt: 1_000,
    outstandingReservations: 0,
    staleAfterMs: 900_000,
    uncertaintyReserve: 0,
    unrelatedBaseline: 0,
  }));
}

function decision(endpointClass: "NEW_WORK" | "SAFETY_SERVER", samples: readonly MeterSample[]) {
  return decideAdmission({
    emergencyFreeze: false,
    endpointClass,
    koreaReviewApproved: true,
    meters: samples,
    now: 2_000,
    requiredStoresReachable: true,
    rightsApproved: true,
    workerReachable: true,
    writeFenceOpen: true,
  });
}

describe("budget admission", () => {
  it("warns at 50 percent of any independent meter", () => {
    // Given: one independent provider meter reaches the warning threshold.
    const samples = meters(0.1).map((sample) =>
      sample.group === "provider" ? { ...sample, observed: 50 } : sample,
    );

    // When: a new-work reservation is evaluated.
    const result = decision("NEW_WORK", samples);

    // Then: work remains admitted in WARN.
    expect(result).toEqual({ allowed: true, state: "WARN" });
  });

  it("FI-COST-01 closes new work at 80 percent but preserves the safety lane", () => {
    // Given: the D1 meter reaches the close threshold.
    const samples = meters(0.1).map((sample) =>
      sample.group === "d1" ? { ...sample, observed: 80 } : sample,
    );

    // When: new work and a reachable Reveal/Stop/Delete path are evaluated.
    const newWork = decision("NEW_WORK", samples);
    const safety = decision("SAFETY_SERVER", samples);

    // Then: only the bound safety path remains admitted.
    expect(newWork).toEqual({ allowed: false, state: "METER_BLOCK" });
    expect(safety).toEqual({ allowed: true, state: "METER_BLOCK" });
  });

  it("fails closed when any independent authority is missing or stale", () => {
    // Given: provider authority is absent and Worker authority is stale.
    const missing = meters(0.1).filter((sample) => sample.group !== "provider");
    const stale = meters(0.1).map((sample) =>
      sample.group === "worker" ? { ...sample, observedAt: -1_000_000 } : sample,
    );

    // When: each meter set is evaluated for new work.
    const missingDecision = decision("NEW_WORK", missing);
    const staleDecision = decision("NEW_WORK", stale);

    // Then: both fail closed.
    expect(missingDecision).toEqual({ allowed: false, state: "METER_BLOCK" });
    expect(staleDecision).toEqual({ allowed: false, state: "METER_BLOCK" });
  });
});
