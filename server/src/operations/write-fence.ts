import type { EndpointClass } from "../admission/admission";

export const WRITE_FENCE_MODES = [
  "OPEN",
  "ADMISSION_CLOSED",
  "PRODUCERS_FENCED",
  "ALL_NONTERMINAL_FENCED",
  "RECOVERY_VERIFY",
] as const;
export type WriteFenceMode = (typeof WRITE_FENCE_MODES)[number];

export type WriteFence = Readonly<{
  mode: WriteFenceMode;
  writeEpoch: number;
}>;

export type WriteAuthorization = Readonly<{
  allowed: boolean;
  persistEpoch: number;
  reason: "open" | "safety-lane" | "fenced" | "future-epoch" | "stale-epoch";
}>;

export function authorizeWrite(
  fence: WriteFence,
  endpointClass: EndpointClass,
  submittedEpoch: number,
  storesReachable: boolean,
): WriteAuthorization {
  if (submittedEpoch > fence.writeEpoch) {
    return { allowed: false, persistEpoch: fence.writeEpoch, reason: "future-epoch" };
  }
  if (endpointClass === "LOCAL_TERMINAL") {
    return { allowed: true, persistEpoch: fence.writeEpoch, reason: "safety-lane" };
  }
  if (isSafetyLane(endpointClass) && storesReachable) {
    return { allowed: true, persistEpoch: fence.writeEpoch, reason: "safety-lane" };
  }
  if (submittedEpoch !== fence.writeEpoch) {
    return { allowed: false, persistEpoch: fence.writeEpoch, reason: "stale-epoch" };
  }
  if (fence.mode !== "OPEN") {
    return { allowed: false, persistEpoch: fence.writeEpoch, reason: "fenced" };
  }
  return { allowed: true, persistEpoch: fence.writeEpoch, reason: "open" };
}

function isSafetyLane(endpointClass: EndpointClass): boolean {
  return endpointClass === "SAFETY_SERVER";
}
