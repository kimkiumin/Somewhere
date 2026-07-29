import { DurableObject } from "cloudflare:workers";

import { type AlarmPlan, alarmWork } from "../async/alarm";
import { type AsyncEventType, type AsyncMessage, buildAsyncMessage } from "../async/message";
import { RETENTION_MS } from "../async/retention";
import { createReadyJourney, type JourneyTransition } from "./aggregate";
import type { OutboxRecord } from "./reconciliation";
import {
  inboxEventSchema,
  journeyCommandSchema,
  readyJourneyInputSchema,
  tombstoneReceiptSchema,
} from "./schemas";
import { JourneySqliteStore } from "./sqlite-store";
import { finalizeDeleteAfterTombstone } from "./tombstone";
import type { JourneyPhase, RouteRepair } from "./types";

type SafeMutationResult = Readonly<{
  kind: JourneyTransition["kind"];
  outcomeCiphertext: string | undefined;
  phase: string;
  revealed: boolean;
  sequence: number;
}>;

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

export class JourneyDurableObject extends DurableObject<Env> {
  private deleted = false;
  private readonly store: JourneySqliteStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new JourneySqliteStore(ctx.storage);
  }

  async initialize(value: unknown): Promise<SafeMutationResult> {
    const input = readyJourneyInputSchema.parse(value);
    const receiptDigest = input.selectedSnapshot.receiptDigest;
    const readyInput = {
      browserBindingDigest: input.browserBindingDigest,
      expiresAt: input.expiresAt,
      journeyId: input.journeyId,
      selectedSnapshot: {
        destinationSnapshotCiphertext: input.selectedSnapshot.destinationSnapshotCiphertext,
        disclosure: input.selectedSnapshot.disclosure,
        selectionReceiptId: input.selectedSnapshot.selectionReceiptId,
        ...(input.selectedSnapshot.createRequestDigest === undefined
          ? {}
          : { createRequestDigest: input.selectedSnapshot.createRequestDigest }),
        ...(input.selectedSnapshot.receiptDigest === undefined
          ? {}
          : { receiptDigest: input.selectedSnapshot.receiptDigest }),
      },
      sequence: input.sequence,
      writeEpoch: input.writeEpoch,
      ...(input.preparedRoute === undefined ? {} : { preparedRoute: input.preparedRoute }),
    };
    const state = this.store.initialize(
      createReadyJourney(readyInput),
      receiptDigest === undefined
        ? undefined
        : {
            attempts: 0,
            eventDigest: receiptDigest,
            eventId: `activation_${receiptDigest.slice(0, 48)}`,
            eventType: "journey.activated",
            expiresAt: input.expiresAt,
            nextAttemptAt: Date.now() + 1_000,
            status: "pending",
            writeEpoch: input.writeEpoch,
          },
    );
    await this.scheduleAlarm();
    return {
      kind: "applied",
      outcomeCiphertext: undefined,
      phase: state.phase,
      revealed: state.revealed,
      sequence: state.sequence,
    };
  }

  async snapshot(browserBindingDigest: string): Promise<InternalJourneySnapshot | undefined> {
    const state = this.store.readState();
    if (state === null || state.browserBindingDigest !== browserBindingDigest || this.deleted) {
      return undefined;
    }
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

  async transition(value: unknown): Promise<SafeMutationResult> {
    const result = this.store.transition(journeyCommandSchema.parse(value));
    await this.scheduleAlarm();
    return {
      kind: result.kind,
      outcomeCiphertext: result.outcomeCiphertext,
      phase: result.state.phase,
      revealed: result.state.revealed,
      sequence: result.state.sequence,
    };
  }

  async recordInbox(value: unknown): Promise<"recorded" | "duplicate" | "stale_epoch"> {
    return this.store.recordInbox(inboxEventSchema.parse(value));
  }

  async acknowledgeOutbox(
    eventId: string,
    acknowledgedAt: number,
  ): Promise<"acknowledged" | "already" | "missing"> {
    const result = this.store.acknowledge(eventId, acknowledgedAt);
    await this.scheduleAlarm();
    return result;
  }

  async deleteAfterTombstone(value: unknown): Promise<Readonly<{ status: 204 }>> {
    const receipt = tombstoneReceiptSchema.parse(value);
    await finalizeDeleteAfterTombstone(this.ctx.storage, receipt);
    this.deleted = true;
    return { status: 204 };
  }

  async reconcileAlarm(now: number): Promise<AlarmPlan> {
    if (this.deleted) {
      return { kind: "terminal" };
    }
    const state = this.store.readState();
    switch (alarmWork(state, now)) {
      case "terminal":
      case "expire":
        await this.deleteTerminalState();
        return { kind: "terminal" };
      case "feedback":
      case "outbox":
        return this.scheduleAlarm(now);
    }
  }

  override async alarm(): Promise<void> {
    if (this.deleted) {
      return;
    }
    const now = Date.now();
    const work = alarmWork(this.store.readState(), now);
    if (work === "terminal" || work === "expire") {
      await this.deleteTerminalState();
      return;
    }
    const events = this.store.leaseDue(now);
    for (const event of events) {
      const message = await queueMessage(event);
      if (message === undefined) {
        this.store.acknowledge(event.eventId, now);
        continue;
      }
      try {
        await this.env.EVENTS_QUEUE.send(message);
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        continue;
      }
      this.store.acknowledge(event.eventId, now);
      if (message.eventType === "journey.feedback.schedule") {
        this.store.markFeedbackEligible(event.eventId);
      }
    }
    await this.scheduleAlarm(now);
  }

  private async deleteTerminalState(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.deleted = true;
  }

  private async scheduleAlarm(now = Date.now()): Promise<AlarmPlan> {
    const plan = this.store.nextAlarmAt(now);
    if (plan.kind === "terminal") {
      await this.ctx.storage.deleteAlarm();
      return plan;
    }
    await this.ctx.storage.setAlarm(plan.alarmAt);
    return plan;
  }
}

async function queueMessage(event: OutboxRecord): Promise<AsyncMessage | undefined> {
  const eventType = asyncEventType(event.eventType);
  if (eventType === undefined) {
    return undefined;
  }
  return buildAsyncMessage({
    eventType,
    occurredAt: Math.max(1, event.expiresAt - RETENTION_MS.journey),
    subjectDigest: event.eventDigest,
    writeEpoch: event.writeEpoch,
  });
}

function asyncEventType(value: string): AsyncEventType | undefined {
  switch (value) {
    case "journey.activated":
      return "journey.activation.repair";
    case "journey.feedback.eligible":
      return "journey.feedback.schedule";
    default:
      return undefined;
  }
}
