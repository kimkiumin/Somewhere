import { type JourneyCommand, type JourneyState, transitionJourney } from "./aggregate";
import type { InboxRecord, OutboxRecord } from "./reconciliation";
import { journeyStateSchema, outboxRecordSchema } from "./schemas";

type PayloadRow = Readonly<{ payload: string }>;
type CountRow = Readonly<{ count: number }>;

export class JourneyNotInitializedError extends Error {
  override readonly name = "JourneyNotInitializedError";

  constructor() {
    super("Journey Durable Object is not initialized");
  }
}

export class JourneySqliteStore {
  constructor(private readonly storage: DurableObjectStorage) {
    const sql = storage.sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS journey_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), payload TEXT NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS journey_outbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, next_attempt_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS journey_inbox (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, write_epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE INDEX IF NOT EXISTS journey_outbox_due ON journey_outbox(status, next_attempt_at, expires_at)",
    );
  }

  initialize(state: JourneyState, activation?: OutboxRecord): JourneyState {
    return this.storage.transactionSync(() => {
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

  recordInbox(event: InboxRecord): "recorded" | "duplicate" | "stale_epoch" {
    return this.storage.transactionSync(() => {
      const state = this.readState();
      if (state === null) {
        throw new JourneyNotInitializedError();
      }
      if (event.writeEpoch !== state.writeEpoch) {
        return "stale_epoch";
      }
      const exists = this.storage.sql
        .exec<CountRow>(
          "SELECT COUNT(*) AS count FROM journey_inbox WHERE event_id = ?",
          event.eventId,
        )
        .one().count;
      if (exists > 0) {
        return "duplicate";
      }
      this.storage.sql.exec(
        "INSERT INTO journey_inbox (event_id, payload, write_epoch, expires_at) VALUES (?, ?, ?, ?)",
        event.eventId,
        JSON.stringify(event),
        event.writeEpoch,
        event.expiresAt,
      );
      return "recorded";
    });
  }

  leaseDue(now: number): readonly OutboxRecord[] {
    return this.storage.transactionSync(() => {
      const rows = this.storage.sql
        .exec<PayloadRow>(
          "SELECT payload FROM journey_outbox WHERE status = 'pending' AND next_attempt_at <= ? AND expires_at > ? ORDER BY next_attempt_at, event_id LIMIT 32",
          now,
          now,
        )
        .toArray();
      return rows.map((row) => {
        const event: unknown = JSON.parse(row.payload);
        const parsed = outboxRecord(event);
        const leased = {
          ...parsed,
          attempts: parsed.attempts + 1,
          nextAttemptAt: now + Math.min(60_000, 1_000 * 2 ** parsed.attempts),
        };
        this.storage.sql.exec(
          "UPDATE journey_outbox SET payload = ?, next_attempt_at = ? WHERE event_id = ?",
          JSON.stringify(leased),
          leased.nextAttemptAt,
          leased.eventId,
        );
        return leased;
      });
    });
  }

  acknowledge(eventId: string, acknowledgedAt: number): "acknowledged" | "already" | "missing" {
    return this.storage.transactionSync(() => {
      const rows = this.storage.sql
        .exec<PayloadRow>("SELECT payload FROM journey_outbox WHERE event_id = ?", eventId)
        .toArray();
      const row = rows[0];
      if (row === undefined) {
        return "missing";
      }
      const event = outboxRecord(JSON.parse(row.payload));
      if (event.status === "acknowledged") {
        return "already";
      }
      const acknowledged: OutboxRecord = {
        ...event,
        nextAttemptAt: acknowledgedAt,
        status: "acknowledged",
      };
      this.storage.sql.exec(
        "UPDATE journey_outbox SET payload = ?, status = 'acknowledged', next_attempt_at = ? WHERE event_id = ?",
        JSON.stringify(acknowledged),
        acknowledgedAt,
        eventId,
      );
      return "acknowledged";
    });
  }

  nextAlarmAt(): number | null {
    const rows = this.storage.sql
      .exec<{ next_attempt_at: number }>(
        "SELECT MIN(next_attempt_at) AS next_attempt_at FROM journey_outbox WHERE status = 'pending'",
      )
      .toArray();
    return rows[0]?.next_attempt_at ?? null;
  }
}

function outboxRecord(value: unknown): OutboxRecord {
  return outboxRecordSchema.parse(value);
}
