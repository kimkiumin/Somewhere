import { type JourneyCommand, type JourneyState, transitionJourney } from "./aggregate";
import type { OutboxRecord } from "./reconciliation";
import { journeyStateSchema } from "./schemas";
import type { JourneySqliteDeletionStore } from "./sqlite-deletion-store";

type PayloadRow = Readonly<{ payload: string }>;

export class JourneyNotInitializedError extends Error {
  override readonly name = "JourneyNotInitializedError";

  constructor() {
    super("Journey Durable Object is not initialized");
  }
}

export class JourneySqliteStateStore {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly deletion: JourneySqliteDeletionStore,
  ) {}

  initialize(state: JourneyState, activation?: OutboxRecord): JourneyState {
    return this.storage.transactionSync(() => {
      if (this.deletion.readDeletionGate() !== null) {
        throw new Error("Journey deletion is fenced");
      }
      const existing = this.readState();
      if (existing !== null) {
        return existing;
      }
      this.storage.sql.exec(
        "INSERT INTO journey_state (singleton, payload) VALUES (1, ?)",
        JSON.stringify(state),
      );
      if (activation !== undefined) {
        this.storage.sql.exec(
          "INSERT INTO journey_outbox (event_id, payload, status, next_attempt_at, expires_at) VALUES (?, ?, ?, ?, ?)",
          activation.eventId,
          JSON.stringify(activation),
          activation.status,
          activation.nextAttemptAt,
          activation.expiresAt,
        );
      }
      return state;
    });
  }

  readState(): JourneyState | null {
    const rows = this.storage.sql
      .exec<PayloadRow>("SELECT payload FROM journey_state WHERE singleton = 1")
      .toArray();
    const row = rows[0];
    if (row === undefined) {
      return null;
    }
    const parsed = journeyStateSchema.parse(JSON.parse(row.payload));
    return {
      ...parsed,
      activeRoute: parsed.activeRoute,
      feedback: parsed.feedback,
      openStop: parsed.openStop,
      routeRepair: parsed.routeRepair,
      selectedSnapshot: {
        destinationSnapshotCiphertext: parsed.selectedSnapshot.destinationSnapshotCiphertext,
        disclosure: parsed.selectedSnapshot.disclosure,
        selectionReceiptId: parsed.selectedSnapshot.selectionReceiptId,
        ...(parsed.selectedSnapshot.createRequestDigest === undefined
          ? {}
          : { createRequestDigest: parsed.selectedSnapshot.createRequestDigest }),
        ...(parsed.selectedSnapshot.receiptDigest === undefined
          ? {}
          : { receiptDigest: parsed.selectedSnapshot.receiptDigest }),
      },
    };
  }

  transition(command: JourneyCommand) {
    return this.storage.transactionSync(() => {
      const state = this.readState();
      if (state === null) {
        throw new JourneyNotInitializedError();
      }
      if (this.deletion.readDeletionGate() !== null) {
        return { kind: "sequence_conflict" as const, outbox: [], state };
      }
      const result = transitionJourney(state, command);
      if (result.kind !== "applied") {
        return result;
      }
      this.storage.sql.exec(
        "UPDATE journey_state SET payload = ? WHERE singleton = 1",
        JSON.stringify(result.state),
      );
      for (const event of result.outbox) {
        this.storage.sql.exec(
          "INSERT INTO journey_outbox (event_id, payload, status, next_attempt_at, expires_at) VALUES (?, ?, ?, ?, ?)",
          event.eventId,
          JSON.stringify(event),
          event.status,
          event.nextAttemptAt,
          event.expiresAt,
        );
      }
      return result;
    });
  }
}
