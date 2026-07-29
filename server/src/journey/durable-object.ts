import { DurableObject } from "cloudflare:workers";

import { createReadyJourney, type JourneyTransition } from "./aggregate";
import {
  inboxEventSchema,
  journeyCommandSchema,
  readyJourneyInputSchema,
  tombstoneReceiptSchema,
} from "./schemas";
import { JourneySqliteStore } from "./sqlite-store";
import { finalizeDeleteAfterTombstone } from "./tombstone";

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
  phase: string;
  revealed: boolean;
  selectedSnapshot: Readonly<{
    createRequestDigest?: string;
    destinationSnapshotCiphertext: string;
    receiptDigest?: string;
    selectionReceiptId: string;
  }>;
  sequence: number;
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
      phase: state.phase,
      revealed: state.revealed,
      selectedSnapshot: state.selectedSnapshot,
      sequence: state.sequence,
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

  override async alarm(): Promise<void> {
    if (this.deleted) {
      return;
    }
    const now = Date.now();
    const events = this.store.leaseDue(now);
    for (const event of events) {
      await this.env.EVENTS_QUEUE.send({
        eventDigest: event.eventDigest,
        eventId: event.eventId,
        eventType: event.eventType,
        schemaVersion: 1,
        writeEpoch: event.writeEpoch,
      });
    }
    await this.scheduleAlarm();
  }

  private async scheduleAlarm(): Promise<void> {
    const nextAlarmAt = this.store.nextAlarmAt();
    if (nextAlarmAt === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(nextAlarmAt);
  }
}
