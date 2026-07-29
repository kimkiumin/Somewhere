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

export class JourneyDurableObject extends DurableObject<Env> {
  private deleted = false;
  private readonly store: JourneySqliteStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new JourneySqliteStore(ctx.storage);
  }

  async initialize(value: unknown): Promise<SafeMutationResult> {
    const input = readyJourneyInputSchema.parse(value);
    const state = this.store.initialize(createReadyJourney(input));
    await this.scheduleAlarm();
    return {
      kind: "applied",
      outcomeCiphertext: undefined,
      phase: state.phase,
      revealed: state.revealed,
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
