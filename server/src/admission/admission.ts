import { evaluateIndependentMeters } from "./meter";
import type { MeterSample } from "./meter";

export const ENDPOINT_CLASSES = [
  "LOCAL_TERMINAL",
  "SAFETY_SERVER",
  "ACTIVE_MUTATION",
  "NEW_WORK",
  "BACKGROUND_DRAIN",
  "BACKGROUND_NEW",
] as const;
export type EndpointClass = (typeof ENDPOINT_CLASSES)[number];

export type AdmissionInput = Readonly<{
  endpointClass: EndpointClass;
  emergencyFreeze: boolean;
  meters: readonly MeterSample[];
  now: number;
  requiredStoresReachable: boolean;
  rightsApproved: boolean;
  koreaReviewApproved: boolean;
  writeFenceOpen: boolean;
  workerReachable: boolean;
}>;

export type AdmissionDecision = Readonly<{
  allowed: boolean;
  state:
    | "LOCAL_ONLY"
    | "PLATFORM_UNREACHABLE"
    | "EMERGENCY_FROZEN"
    | "WRITE_FENCED"
    | "EXTERNAL_BLOCK"
    | "METER_BLOCK"
    | "DEGRADED"
    | "WARN"
    | "OPEN";
}>;

export function decideAdmission(input: AdmissionInput): AdmissionDecision {
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
  state: "EMERGENCY_FROZEN" | "WRITE_FENCED" | "EXTERNAL_BLOCK" | "METER_BLOCK",
): AdmissionDecision {
  return {
    allowed: endpointClass === "SAFETY_SERVER" && storesReachable,
    state,
  };
}
