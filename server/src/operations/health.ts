import { OPERATIONS_POLICY_V1 } from "../../../contracts/src/policy";
import type { AdmissionState } from "../admission/admission";
import type { WriteFenceMode } from "./write-fence";

export const OPERATIONS_SCHEMA = {
  contractVersion: 1,
  d1TimeTravelDays: OPERATIONS_POLICY_V1.retention.d1TimeTravelDays,
  durableObjectPitrDays: OPERATIONS_POLICY_V1.retention.durableObjectPitrDays,
  encryptedExportDeleteDaysAfterCutover: 30,
  meterCount: OPERATIONS_POLICY_V1.meterIds.length,
  queueRetentionHours: OPERATIONS_POLICY_V1.retention.queueDlqHours,
  schemaVersion: 1,
} as const;

export type OperationsHealthInput = Readonly<{
  admissionState: AdmissionState;
  externalGatesPass: boolean;
  lastMeterSampleAt: number | null;
  meterRegistryComplete: boolean;
  now: number;
  writeEpoch: number | null;
  writeFenceMode: WriteFenceMode | null;
}>;

export function operationsHealth(input: OperationsHealthInput) {
  const authorityMissing =
    input.writeEpoch === null ||
    input.writeFenceMode === null ||
    input.lastMeterSampleAt === null ||
    !input.meterRegistryComplete ||
    !input.externalGatesPass;
  const blocked =
    authorityMissing || (input.admissionState !== "OPEN" && input.admissionState !== "WARN");
  return {
    ...OPERATIONS_SCHEMA,
    admissionState: authorityMissing ? ("BOOT_BLOCKED" as const) : input.admissionState,
    externalGates: input.externalGatesPass ? ("PASS" as const) : ("BLOCK" as const),
    generatedAt: input.now,
    status: blocked ? ("blocked" as const) : ("ready" as const),
    writeEpoch: input.writeEpoch,
    writeFenceMode: input.writeFenceMode,
  };
}
