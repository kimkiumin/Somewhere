import { describe, expect, it } from "vitest";
import { OPERATIONS_POLICY_V1 } from "../../contracts/src";

import { decideAdmission, type EndpointClass } from "../src/admission/admission";
import {
  type DatedMeterSample,
  evaluateDatedMeters,
  METER_POLICIES,
  type MeterId,
} from "../src/admission/meter";

const NOW = Date.parse("2026-07-29T12:00:00Z");

function samples(fraction = 0.1): readonly DatedMeterSample[] {
  return METER_POLICIES.map((policy) => ({
    immediateObserved: policy.cap * fraction,
    immediateObservedAt: NOW,
    localFinalized: 0,
    meterId: policy.id,
    outstandingReservations: 0,
    platformObserved: policy.cap * fraction,
    platformObservedAt: NOW,
    resetConfirmed: true,
    unrelatedBaseline: 0,
    uncertaintyReserve: 0,
    windowEndUtc: NOW + 12 * 60 * 60 * 1_000,
    windowStartUtc: NOW - 12 * 60 * 60 * 1_000,
  }));
}

function atFraction(meterId: MeterId, fraction: number): readonly DatedMeterSample[] {
  const cap = METER_POLICIES.find((policy) => policy.id === meterId)?.cap ?? Number.NaN;
  return samples().map((sample) =>
    sample.meterId === meterId
      ? {
          ...sample,
          immediateObserved: cap * fraction,
          platformObserved: cap * fraction,
        }
      : sample,
  );
}

function decision(meters: readonly DatedMeterSample[], endpointClass: EndpointClass = "NEW_WORK") {
  return decideAdmission({
    currentState: "OPEN",
    emergencyFreeze: false,
    endpointClass,
    externalGatesPass: true,
    freshRecoverySamples: 2,
    killSwitchActive: false,
    meters,
    now: NOW,
    oldEpochReservations: 0,
    providerBudgetAvailable: true,
    queueHealthy: true,
    requiredStoresReachable: true,
    workerReachable: true,
    writeFenceMode: "OPEN",
  });
}

describe("Todo14 dated meters and admission", () => {
  it("materializes every frozen dated Cloudflare meter exactly once", () => {
    // Given: the normative operations-policy meter registry.
    const expected = [...OPERATIONS_POLICY_V1.meterIds].sort();

    // When: the runtime policy IDs are materialized.
    const actual = METER_POLICIES.map((policy) => policy.id).sort();

    // Then: runtime admission cannot omit or invent a Cloudflare meter.
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(15);
  });

  it.each([
    ["TASK14-METER-80-WORKER", "worker.dynamic_requests"],
    ["TASK14-METER-80-D1", "d1.rows_read"],
    ["TASK14-METER-80-DO", "do.requests"],
    ["TASK14-METER-80-QUEUE", "queue.operations"],
  ] as const)("%s closes only new work at the frozen threshold", (_caseId, meterId) => {
    // Given: one independent authority reaches 80 percent.
    const meters = atFraction(meterId, 0.8);

    // When: new work and terminal safety work are evaluated.
    const newWork = decision(meters);
    const safety = decision(meters, "SAFETY_SERVER");

    // Then: admission closes without intentionally closing Stop/Reveal/Delete.
    expect(newWork).toEqual({ allowed: false, state: "METER_BLOCK" });
    expect(safety).toEqual({ allowed: true, state: "METER_BLOCK" });
  });

  it("keeps the greater local authority when a delayed platform sample is lower", () => {
    // Given: local finalized usage is closed while delayed platform usage is low.
    const worker = atFraction("worker.dynamic_requests", 0.1).map((sample) =>
      sample.meterId === "worker.dynamic_requests"
        ? { ...sample, localFinalized: 80_000, platformObserved: 1 }
        : sample,
    );

    // When: effective usage is reconciled.
    const evaluation = evaluateDatedMeters(worker, NOW);

    // Then: the delayed sample never reopens the Worker budget.
    expect(evaluation.find((meter) => meter.meterId === "worker.dynamic_requests")).toMatchObject({
      effectiveUsed: 80_000,
      status: "CLOSED",
    });
  });

  it("requires provider headroom and respects a global kill switch", () => {
    // Given: Cloudflare meters are healthy but independent provider/global controls close.
    const healthy = samples();

    // When: each non-Cloudflare authority is evaluated.
    const providerClosed = decideAdmission({
      currentState: "OPEN",
      emergencyFreeze: false,
      endpointClass: "NEW_WORK",
      externalGatesPass: true,
      freshRecoverySamples: 2,
      killSwitchActive: false,
      meters: healthy,
      now: NOW,
      oldEpochReservations: 0,
      providerBudgetAvailable: false,
      queueHealthy: true,
      requiredStoresReachable: true,
      workerReachable: true,
      writeFenceMode: "OPEN",
    });
    const globalClosed = decideAdmission({
      currentState: "OPEN",
      emergencyFreeze: false,
      endpointClass: "NEW_WORK",
      externalGatesPass: true,
      freshRecoverySamples: 2,
      killSwitchActive: true,
      meters: healthy,
      now: NOW,
      oldEpochReservations: 0,
      providerBudgetAvailable: true,
      queueHealthy: true,
      requiredStoresReachable: true,
      workerReachable: true,
      writeFenceMode: "OPEN",
    });

    // Then: the provider check is explicit and the global switch freezes new work.
    expect(providerClosed).toEqual({ allowed: false, state: "EXTERNAL_BLOCK" });
    expect(globalClosed).toEqual({ allowed: false, state: "EMERGENCY_FROZEN" });
  });

  it("does not reopen a reset window without two fresh samples", () => {
    // Given: a previously blocked controller at UTC rollover.
    const resetPending = samples().map((sample) => ({ ...sample, resetConfirmed: false }));

    // When: only one fresh recovery sample exists.
    const result = decideAdmission({
      currentState: "METER_BLOCK",
      emergencyFreeze: false,
      endpointClass: "NEW_WORK",
      externalGatesPass: true,
      freshRecoverySamples: 1,
      killSwitchActive: false,
      meters: resetPending,
      now: NOW,
      oldEpochReservations: 0,
      providerBudgetAvailable: true,
      queueHealthy: true,
      requiredStoresReachable: true,
      workerReachable: true,
      writeFenceMode: "OPEN",
    });

    // Then: wall-clock rollover remains closed in recovery verification.
    expect(result).toEqual({ allowed: false, state: "RECOVERY_VERIFY" });
  });

  it("sheds unconfirmed Worker logs without closing journey admission", () => {
    // Given: only the non-admission Worker log window lacks reset confirmation.
    const meters = samples().map((sample) =>
      sample.meterId === "worker.logs_written" ? { ...sample, resetConfirmed: false } : sample,
    );

    // When: new journey admission is evaluated.
    const result = decision(meters);

    // Then: the logging lane can shed output without becoming a journey dependency.
    expect(result).toEqual({ allowed: true, state: "OPEN" });
  });
});
