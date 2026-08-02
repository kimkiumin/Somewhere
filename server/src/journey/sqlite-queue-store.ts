import { type AlarmPlan, planJourneyAlarm } from "../async/alarm";
import type { InboxRecord, OutboxRecord } from "./reconciliation";
import { outboxRecordSchema } from "./schemas";
import type { JourneySqliteDeletionStore } from "./sqlite-deletion-store";
import { JourneyNotInitializedError, type JourneySqliteStateStore } from "./sqlite-state-store";

type CountRow = Readonly<{ count: number }>;
type PayloadRow = Readonly<{ payload: string }>;
const OUTBOX_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000] as const;

export class JourneySqliteQueueStore {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly state: JourneySqliteStateStore,
    private readonly deletion: JourneySqliteDeletionStore,
  ) {}

  recordInbox(event: InboxRecord): "recorded" | "duplicate" | "stale_epoch" {
    return this.storage.transactionSync(() => {
      const state = this.state.readState();
      if (state === null) {
        throw new JourneyNotInitializedError();
      }
      if (this.deletion.readDeletionGate() !== null) {
        return "stale_epoch";
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
      if (this.deletion.readDeletionGate() !== null) {
        return [];
      }
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
          nextAttemptAt: now + retryDelayMs(parsed.attempts),
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
      if (this.deletion.readDeletionGate() !== null) {
        return "missing";
      }
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

  markFeedbackEligible(eventId: string): void {
    this.storage.transactionSync(() => {
      if (this.deletion.readDeletionGate() !== null) {
        return;
      }
      const state = this.state.readState();
      if (
        state === null ||
        state.feedback === undefined ||
        state.feedback.eventId !== eventId ||
        state.feedback.status !== "scheduled"
      ) {
        return;
      }
      this.storage.sql.exec(
        "UPDATE journey_state SET payload = ? WHERE singleton = 1",
        JSON.stringify({
          ...state,
          feedback: { ...state.feedback, status: "eligible" },
        }),
      );
    });
  }

  nextAlarmAt(now: number): AlarmPlan {
    if (this.deletion.readDeletionGate() !== null) {
      return { kind: "terminal" };
    }
    const rows = this.storage.sql
      .exec<{ next_attempt_at: number }>(
        "SELECT MIN(next_attempt_at) AS next_attempt_at FROM journey_outbox WHERE status = 'pending' AND expires_at > ?",
        now,
      )
      .toArray();
    return planJourneyAlarm(this.state.readState(), rows[0]?.next_attempt_at ?? null);
  }
}

function outboxRecord(value: unknown): OutboxRecord {
  return outboxRecordSchema.parse(value);
}

function retryDelayMs(attempts: number): number {
  switch (attempts) {
    case 0:
      return OUTBOX_RETRY_DELAYS_MS[0];
    case 1:
      return OUTBOX_RETRY_DELAYS_MS[1];
    case 2:
      return OUTBOX_RETRY_DELAYS_MS[2];
    default:
      return OUTBOX_RETRY_DELAYS_MS[3];
  }
}
