import {
  type DatedMeterSample,
  evaluateDatedMeters,
  evaluateIndependentMeters,
  type MeterSample,
} from "./meter";

export const ENDPOINT_CLASSES = [
  "LOCAL_TERMINAL",
  "SAFETY_SERVER",
  "ACTIVE_MUTATION",
  "NEW_WORK",
  "BACKGROUND_DRAIN",
  "BACKGROUND_NEW",
] as const;
export type EndpointClass = (typeof ENDPOINT_CLASSES)[number];

export const ADMISSION_STATES = [
  "BOOT_BLOCKED",
  "OPEN",
  "WARN",
  "METER_BLOCK",
  "EXTERNAL_BLOCK",
  "WRITE_FENCED",
  "DEGRADED",
  "EMERGENCY_FROZEN",
  "RECOVERY_VERIFY",
] as const;
export type AdmissionState = (typeof ADMISSION_STATES)[number];

export type AdmissionDecision = Readonly<{
  allowed: boolean;
  state: AdmissionState | "LOCAL_ONLY" | "PLATFORM_UNREACHABLE";
}>;

type DatedAdmissionInput = Readonly<{
  currentState: AdmissionState;
  emergencyFreeze: boolean;
  endpointClass: EndpointClass;
  externalGatesPass: boolean;
  freshRecoverySamples: number;
  killSwitchActive: boolean;
  meters: readonly DatedMeterSample[];
  now: number;
  oldEpochReservations: number;
  providerBudgetAvailable: boolean;
  queueHealthy: boolean;
  requiredStoresReachable: boolean;
  workerReachable: boolean;
  writeFenceMode:
    | "OPEN"
    | "ADMISSION_CLOSED"
    | "PRODUCERS_FENCED"
    | "ALL_NONTERMINAL_FENCED"
    | "RECOVERY_VERIFY";
}>;

type LegacyAdmissionInput = Readonly<{
  emergencyFreeze: boolean;
  endpointClass: EndpointClass;
  koreaReviewApproved: boolean;
  meters: readonly MeterSample[];
  now: number;
  requiredStoresReachable: boolean;
  rightsApproved: boolean;
  workerReachable: boolean;
  writeFenceOpen: boolean;
}>;

export type AdmissionInput = DatedAdmissionInput | LegacyAdmissionInput;

export function decideAdmission(input: AdmissionInput): AdmissionDecision {
  if ("externalGatesPass" in input) {
    return decideDatedAdmission(input);
  }
  return decideLegacyAdmission(input);
}

function decideDatedAdmission(input: DatedAdmissionInput): AdmissionDecision {
  if (input.endpointClass === "LOCAL_TERMINAL") {
    return { allowed: true, state: "LOCAL_ONLY" };
  }
  if (!input.workerReachable) {
    return { allowed: false, state: "PLATFORM_UNREACHABLE" };
  }
  if (input.emergencyFreeze || input.killSwitchActive) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "EMERGENCY_FROZEN");
  }
  if (input.writeFenceMode !== "OPEN") {
    const state = input.writeFenceMode === "RECOVERY_VERIFY" ? "RECOVERY_VERIFY" : "WRITE_FENCED";
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, state);
  }
  if (!input.externalGatesPass || !input.providerBudgetAvailable) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "EXTERNAL_BLOCK");
  }
  const meters = evaluateDatedMeters(input.meters, input.now);
  const resetPending = meters.some(
    (meter) => meter.blocksAdmission && meter.status === "RECOVERY_VERIFY",
  );
  const meterBlocked = meters.some((meter) => meter.blocksAdmission && meter.status === "CLOSED");
  if (resetPending || recoveryPending(input)) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "RECOVERY_VERIFY");
  }
  if (meterBlocked) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "METER_BLOCK");
  }
  if (!input.requiredStoresReachable) {
    return { allowed: false, state: "DEGRADED" };
  }
  if (!input.queueHealthy) {
    return {
      allowed: input.endpointClass === "SAFETY_SERVER" || input.endpointClass === "ACTIVE_MUTATION",
      state: "DEGRADED",
    };
  }
  return {
    allowed: true,
    state: meters.some((meter) => meter.blocksAdmission && meter.status === "WARN")
      ? "WARN"
      : "OPEN",
  };
}

function recoveryPending(input: DatedAdmissionInput): boolean {
  const recovering = [
    "BOOT_BLOCKED",
    "METER_BLOCK",
    "EXTERNAL_BLOCK",
    "WRITE_FENCED",
    "DEGRADED",
    "EMERGENCY_FROZEN",
    "RECOVERY_VERIFY",
  ].some((state) => state === input.currentState);
  return recovering && (input.freshRecoverySamples < 2 || input.oldEpochReservations > 0);
}

function decideLegacyAdmission(input: LegacyAdmissionInput): AdmissionDecision {
  if (input.endpointClass === "LOCAL_TERMINAL") {
    return { allowed: true, state: "LOCAL_ONLY" };
  }
  if (!input.workerReachable) {
    return { allowed: false, state: "PLATFORM_UNREACHABLE" };
  }
  if (input.emergencyFreeze) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "EMERGENCY_FROZEN");
  }
  if (!input.writeFenceOpen) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "WRITE_FENCED");
  }
  if (!input.rightsApproved || !input.koreaReviewApproved) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "EXTERNAL_BLOCK");
  }
  const meters = evaluateIndependentMeters(input.meters, input.now);
  if (meters === undefined || meters.some((meter) => meter.status === "CLOSED")) {
    return terminalDecision(input.endpointClass, input.requiredStoresReachable, "METER_BLOCK");
  }
  if (!input.requiredStoresReachable) {
    return { allowed: false, state: "DEGRADED" };
  }
  return {
    allowed: true,
    state: meters.some((meter) => meter.status === "WARN") ? "WARN" : "OPEN",
  };
}

function terminalDecision(
  endpointClass: EndpointClass,
  storesReachable: boolean,
  state: "EMERGENCY_FROZEN" | "WRITE_FENCED" | "EXTERNAL_BLOCK" | "METER_BLOCK" | "RECOVERY_VERIFY",
): AdmissionDecision {
  return {
    allowed: endpointClass === "SAFETY_SERVER" && storesReachable,
    state,
  };
}
