import type { AlarmPlan } from "../async/alarm";
import type { JourneyCommand, JourneyState } from "./aggregate";
import type { InboxRecord, OutboxRecord } from "./reconciliation";
import { JourneySqliteDeletionStore } from "./sqlite-deletion-store";
import { JourneySqliteQueueStore } from "./sqlite-queue-store";
import { initializeJourneySqliteSchema } from "./sqlite-schema";
import { JourneySqliteStateStore } from "./sqlite-state-store";

export { JourneyNotInitializedError } from "./sqlite-state-store";

export class JourneySqliteStore {
  private readonly deletion: JourneySqliteDeletionStore;
  private readonly queue: JourneySqliteQueueStore;
  private readonly state: JourneySqliteStateStore;

  constructor(storage: DurableObjectStorage) {
    initializeJourneySqliteSchema(storage);
    this.deletion = new JourneySqliteDeletionStore(storage);
    this.state = new JourneySqliteStateStore(storage, this.deletion);
    this.queue = new JourneySqliteQueueStore(storage, this.state, this.deletion);
  }

  initialize(state: JourneyState, activation?: OutboxRecord): JourneyState {
    return this.state.initialize(state, activation);
  }

  readState(): JourneyState | null {
    return this.state.readState();
  }

  transition(command: JourneyCommand) {
    return this.state.transition(command);
  }

  recordInbox(event: InboxRecord): "recorded" | "duplicate" | "stale_epoch" {
    return this.queue.recordInbox(event);
  }

  leaseDue(now: number): readonly OutboxRecord[] {
    return this.queue.leaseDue(now);
  }

  acknowledge(eventId: string, acknowledgedAt: number): "acknowledged" | "already" | "missing" {
    return this.queue.acknowledge(eventId, acknowledgedAt);
  }

  markFeedbackEligible(eventId: string): void {
    this.queue.markFeedbackEligible(eventId);
  }

  nextAlarmAt(now: number): AlarmPlan {
    return this.queue.nextAlarmAt(now);
  }

  beginDeletion(
    expectedSequence: number,
    deleteRequestDigest: string,
  ): "fenced" | "sequence_conflict" {
    return this.deletion.beginDeletion(expectedSequence, deleteRequestDigest, () =>
      this.readState(),
    );
  }

  isDeletionFenced(): boolean {
    return this.deletion.isDeletionFenced();
  }

  matchesDeletionGate(deleteRequestDigest: string): boolean {
    return this.deletion.matchesDeletionGate(deleteRequestDigest);
  }

  resumeLegacyDeletion(deleteRequestDigest: string): "fenced" | "sequence_conflict" {
    return this.deletion.resumeLegacyDeletion(deleteRequestDigest, () => this.readState());
  }

  deleteJourneyData(deleteRequestDigest: string): void {
    this.deletion.deleteJourneyData(deleteRequestDigest);
  }
}
