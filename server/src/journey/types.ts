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
  destinationSnapshotCiphertext: string;
  disclosure: Readonly<{
    category: "cafe" | "restaurant";
    hint: string;
  }>;
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
  routeRepair:
    | Readonly<{
        status: "checking" | "unavailable";
        updatedAt: number;
      }>
    | undefined;
  selectedSnapshot: SelectedSnapshot;
  sequence: number;
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
        stopConfirmationId: string;
        type: "stop-request" | "continue" | "confirm-stop";
      }>)
  | (CommandBase & Readonly<{ type: "arrival" | "reveal" }>);

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
  selectedSnapshot: SelectedSnapshot;
  sequence: number;
  writeEpoch: number;
}>;
