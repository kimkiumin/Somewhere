export const JOURNEY_PHASES = [
  "ready",
  "committed",
  "following",
  "route-recovery",
  "near",
  "arrived",
  "paused",
  "stopped",
  "completed",
] as const;

export type JourneyPhase = (typeof JOURNEY_PHASES)[number];
export type ResumablePhase = Exclude<JourneyPhase, "arrived" | "paused" | "stopped" | "completed">;

export type ActiveRoute = Readonly<{
  geometry: readonly (readonly [number, number])[];
  originZoneRef: string;
  routeDigest: string;
}>;

export type SelectedSnapshot = Readonly<{
  createRequestDigest?: string;
  destinationSnapshotCiphertext: string;
  disclosure: Readonly<{
    category: "cafe" | "restaurant";
    hint: string;
  }>;
  receiptDigest?: string;
  selectionReceiptId: string;
}>;

export type StoredOutcome = Readonly<{
  bodyDigest: string;
  expiresAt: number;
  outcomeCiphertext: string;
}>;

export type OpenStop = Readonly<{
  confirmationId: string;
  pauseEpoch: number;
  phaseBeforePause: ResumablePhase;
}>;

export type FeedbackState = Readonly<{
  dueAt: number;
  eventId: string;
  status: "scheduled" | "eligible" | "consumed";
}>;

export type StopReason =
  | "safety-concern"
  | "route-or-sensor"
  | "hard-condition"
  | "venue-situation"
  | "changed-mind"
  | "schedule-changed"
  | "skip";

export type RouteRepair = Readonly<
  | { status: "idle" }
  | {
      choice: "recalibrate" | "reroute" | "cached-route";
      status: "repairing";
    }
  | { routeVersion: string; status: "ready" }
  | { status: "external-map-handed-off" }
  | {
      reason: "route-stale" | "location-poor" | "heading-poor" | "provider";
      status: "failed";
    }
>;

export type JourneyState = Readonly<{
  activeRoute: ActiveRoute | undefined;
  browserBindingDigest: string;
  contractVersion: 1;
  expiresAt: number;
  feedback: FeedbackState | undefined;
  idempotency: Readonly<Record<string, StoredOutcome>>;
  journeyId: string;
  openStop: OpenStop | undefined;
  pauseEpoch: number;
  phase: JourneyPhase;
  revealed: boolean;
  recoveryExpiresAt?: number | undefined;
  recoveryIntent?:
    | Readonly<{
        expiresAt: number;
        intentId: string;
      }>
    | undefined;
  routeRepair: RouteRepair | undefined;
  selectedSnapshot: SelectedSnapshot;
  sequence: number;
  stopReason?: StopReason | undefined;
  stopReasonState?: "required-or-skip" | "recorded" | "skipped" | undefined;
  stoppedAt?: number | undefined;
  writeEpoch: number;
}>;

type CommandBase = Readonly<{
  bodyDigest: string;
  expectedSequence: number;
  idempotencyKeyDigest: string;
  now: number;
  outcomeCiphertext: string;
  writeEpoch: number;
}>;

export type JourneyCommand =
  | (CommandBase & Readonly<{ type: "commit" }>)
  | (CommandBase &
      Readonly<{
        capturedPauseEpoch: number;
        route: ActiveRoute;
        type: "route-activate";
      }>)
  | (CommandBase & Readonly<{ type: "route-repair" }>)
  | (CommandBase &
      Readonly<{
        choice: "recalibrate" | "reroute" | "cached-route" | "external-map";
        routeVersion?: string | undefined;
        type: "route-recover";
      }>)
  | (CommandBase &
      Readonly<{
        stopConfirmationId: string;
        type: "stop-request" | "continue" | "confirm-stop";
      }>)
  | (CommandBase &
      Readonly<{
        accuracyBand: "poor" | "acceptable" | "good";
        consecutiveSamples: number;
        dwellMs: number;
        endpointDistanceBand: "outside" | "near" | "within-arrival-threshold";
        routeConsistency: "unknown" | "inconsistent" | "consistent";
        type: "arrival";
      }>)
  | (CommandBase & Readonly<{ reason: StopReason; type: "stop-reason" }>)
  | (CommandBase &
      Readonly<{
        expiresAt: number;
        intentId: string;
        type: "recovery-intent";
      }>)
  | (CommandBase &
      Readonly<{
        intentId: string;
        type: "recovery-confirm";
      }>)
  | (CommandBase & Readonly<{ type: "reveal" }>);

export type JourneyOutboxEvent = Readonly<{
  attempts: number;
  eventDigest: string;
  eventId: string;
  eventType: string;
  expiresAt: number;
  nextAttemptAt: number;
  status: "pending";
  writeEpoch: number;
}>;

type TransitionKind =
  | "applied"
  | "replay"
  | "idempotency_conflict"
  | "sequence_conflict"
  | "stale_epoch"
  | "illegal_transition"
  | "expired";

export type JourneyTransition = Readonly<{
  kind: TransitionKind;
  outbox: readonly JourneyOutboxEvent[];
  outcomeCiphertext?: string;
  state: JourneyState;
}>;

export type ReadyJourneyInput = Readonly<{
  browserBindingDigest: string;
  expiresAt: number;
  journeyId: string;
  preparedRoute?: ActiveRoute;
  selectedSnapshot: SelectedSnapshot;
  sequence: number;
  writeEpoch: number;
}>;
