import { type AdmissionState, decideAdmission } from "../admission/admission";
import type { Database } from "../db/database";
import { type OperationsHealthInput, operationsHealth } from "./health";
import { RuntimeStateRepository } from "./runtime-state-repository";

export class OperationsHealthRepository {
  constructor(private readonly database: Database) {}

  async load(environment: "local" | "staging" | "production", now: number) {
    if (environment === "local") {
      return operationsHealth(blockedInput(now));
    }
    const repository = new RuntimeStateRepository(this.database);
    const [fence, snapshot] = await Promise.all([
      repository.loadFence(environment),
      repository.loadSnapshot(environment, now),
    ]);
    if (fence === null || snapshot.state === null) {
      return operationsHealth(blockedInput(now));
    }
    const decision = decideAdmission({
      currentState: snapshot.state.state,
      emergencyFreeze: false,
      endpointClass: "NEW_WORK",
      externalGatesPass: snapshot.gateCount === 2,
      freshRecoverySamples: snapshot.state.fresh_recovery_samples,
      killSwitchActive: snapshot.killCount > 0,
      meters: snapshot.meters,
      now,
      oldEpochReservations: snapshot.state.old_epoch_reservations,
      providerBudgetAvailable: snapshot.state.provider_budget_available === 1,
      queueHealthy: snapshot.state.queue_healthy === 1,
      requiredStoresReachable: true,
      workerReachable: true,
      writeFenceMode: fence.mode,
    });
    const admissionState = isDurableAdmissionState(decision.state)
      ? decision.state
      : "BOOT_BLOCKED";
    const input: OperationsHealthInput = {
      admissionState,
      externalGatesPass: snapshot.gateCount === 2,
      lastMeterSampleAt: leastFreshAuthority(snapshot.meters),
      meterRegistryComplete: snapshot.meters.length === 15 && snapshot.journeyEnvelopeValid,
      now,
      writeEpoch: fence.writeEpoch,
      writeFenceMode: fence.mode,
    };
    return operationsHealth(input);
  }
}

function blockedInput(now: number): OperationsHealthInput {
  return {
    admissionState: "BOOT_BLOCKED",
    externalGatesPass: false,
    lastMeterSampleAt: null,
    meterRegistryComplete: false,
    now,
    writeEpoch: null,
    writeFenceMode: null,
  };
}

function leastFreshAuthority(
  meters: readonly Readonly<{
    immediateObservedAt: number | null;
    platformObservedAt: number | null;
  }>[],
): number | null {
  const authorities = meters.flatMap((meter) =>
    [meter.immediateObservedAt, meter.platformObservedAt].filter(
      (observedAt): observedAt is number => observedAt !== null,
    ),
  );
  return authorities.length === 0 ? null : Math.min(...authorities);
}

function isDurableAdmissionState(value: string): value is AdmissionState {
  return !["LOCAL_ONLY", "PLATFORM_UNREACHABLE"].includes(value);
}
