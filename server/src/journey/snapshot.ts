import type { JourneyState } from "./aggregate";
import type { JourneyPhase, RouteRepair } from "./types";

export type InternalJourneySnapshot = Readonly<{
  activeRoute:
    | Readonly<{
        geometry: readonly (readonly [number, number])[];
        originZoneRef: string;
        routeDigest: string;
      }>
    | undefined;
  expiresAt: number;
  feedback: Readonly<{ dueAt: number }> | undefined;
  openStop:
    | Readonly<{
        confirmationId: string;
        phaseBeforePause: "ready" | "committed" | "following" | "route-recovery" | "near";
      }>
    | undefined;
  phase: JourneyPhase;
  recoveryExpiresAt?: number | undefined;
  revealed: boolean;
  routeRepair: RouteRepair | undefined;
  selectedSnapshot: Readonly<{
    createRequestDigest?: string;
    destinationSnapshotCiphertext: string;
    receiptDigest?: string;
    selectionReceiptId: string;
  }>;
  sequence: number;
  stopReasonState?: "required-or-skip" | "recorded" | "skipped" | undefined;
  stopReason?:
    | "safety-concern"
    | "route-or-sensor"
    | "hard-condition"
    | "venue-situation"
    | "changed-mind"
    | "schedule-changed"
    | "skip"
    | undefined;
  stoppedAt?: number | undefined;
}>;

export function projectInternalJourneySnapshot(state: JourneyState): InternalJourneySnapshot {
  return {
    activeRoute: state.activeRoute,
    expiresAt: state.expiresAt,
    feedback: state.feedback === undefined ? undefined : { dueAt: state.feedback.dueAt },
    openStop: state.openStop,
    phase: state.phase,
    recoveryExpiresAt: state.recoveryExpiresAt,
    revealed: state.revealed,
    routeRepair: state.routeRepair,
    selectedSnapshot: state.selectedSnapshot,
    sequence: state.sequence,
    stopReasonState: state.stopReasonState,
    stopReason: state.stopReason,
    stoppedAt: state.stoppedAt,
  };
}
