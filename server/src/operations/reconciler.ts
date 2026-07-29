import { z } from "zod";
import { OPERATIONS_POLICY_V1 } from "../../../contracts/src/policy";
import { type AdmissionState, decideAdmission } from "../admission/admission";
import type { Database } from "../db/database";
import { RuntimeStateRepository } from "./runtime-state-repository";

export async function reconcileOperationsState(
  database: Database,
  environment: "local" | "staging" | "production",
  now: number,
  authorityCapturedAt?: number,
): Promise<void> {
  if (environment === "local") {
    return;
  }
  await database
    .prepare(
      `UPDATE operations_admission_state
       SET old_epoch_reservations = (
         SELECT COUNT(*) FROM operations_meter_reservations AS reservation
         WHERE reservation.write_epoch <> operations_admission_state.write_epoch
           AND reservation.reservation_state = 'reserved'
           AND reservation.expires_at > ?
       )
       WHERE environment = ?`,
    )
    .bind(now, environment)
    .run();
  const repository = new RuntimeStateRepository(database);
  const [fence, snapshot] = await Promise.all([
    repository.loadFence(environment),
    repository.loadSnapshot(environment, now),
  ]);
  if (fence === null || snapshot.state === null) {
    return;
  }
  const state = snapshot.state;
  const authoritiesMatch = state.write_epoch === fence.writeEpoch && snapshot.journeyEnvelopeValid;
  const probe = authoritiesMatch
    ? decideAdmission({
        currentState: "OPEN",
        emergencyFreeze: false,
        endpointClass: "NEW_WORK",
        externalGatesPass: snapshot.gateCount === 2,
        freshRecoverySamples: 2,
        killSwitchActive: snapshot.killCount > 0,
        meters: snapshot.meters,
        now,
        oldEpochReservations: state.old_epoch_reservations,
        providerBudgetAvailable: state.provider_budget_available === 1,
        queueHealthy: state.queue_healthy === 1,
        requiredStoresReachable: true,
        workerReachable: true,
        writeFenceMode: fence.mode,
      })
    : { allowed: false as const, state: "BOOT_BLOCKED" as const };
  const healthy = probe.state === "OPEN" || probe.state === "WARN";
  const lastAuthority = await database
    .prepare("SELECT last_collection_at FROM operations_recovery_authorities WHERE environment = ?")
    .bind(environment)
    .first();
  const lastCollectionAt = parseLastCollection(lastAuthority);
  const sampleIsNew =
    authorityCapturedAt !== undefined &&
    (lastCollectionAt === null ||
      authorityCapturedAt - lastCollectionAt >=
        OPERATIONS_POLICY_V1.reopenFreshSampleSpacingSeconds * 1_000);
  const freshSamples =
    healthy && sampleIsNew
      ? Math.min(state.fresh_recovery_samples + 1, OPERATIONS_POLICY_V1.reopenFreshSampleCount)
      : healthy
        ? state.fresh_recovery_samples
        : 0;
  const recovering = !["OPEN", "WARN"].includes(state.state);
  const candidate: AdmissionState =
    healthy && recovering && freshSamples < 2 ? "RECOVERY_VERIFY" : durableState(probe.state);
  await database
    .prepare(
      `UPDATE operations_admission_state
       SET
         state = ?,
         fresh_recovery_samples = ?,
         updated_at = ?
       WHERE environment = ?`,
    )
    .bind(candidate, freshSamples, now, environment)
    .run();
  if (healthy && sampleIsNew && authorityCapturedAt !== undefined) {
    await database
      .prepare(
        `INSERT INTO operations_recovery_authorities (environment, last_collection_at)
         VALUES (?, ?)
         ON CONFLICT(environment) DO UPDATE SET last_collection_at = excluded.last_collection_at`,
      )
      .bind(environment, authorityCapturedAt)
      .run();
  }
}

function durableState(
  state: AdmissionState | "LOCAL_ONLY" | "PLATFORM_UNREACHABLE",
): AdmissionState {
  return state === "LOCAL_ONLY" || state === "PLATFORM_UNREACHABLE" ? "BOOT_BLOCKED" : state;
}

function parseLastCollection(value: unknown): number | null {
  const result = z
    .object({ last_collection_at: z.number().int().positive() })
    .strict()
    .nullable()
    .safeParse(value);
  return result.success ? (result.data?.last_collection_at ?? null) : null;
}
