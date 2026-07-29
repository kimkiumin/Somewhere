import { describe, expect, it } from "vitest";

import {
  acknowledgeOutbox,
  dueOutbox,
  type JourneyPersistence,
  recordInbox,
} from "../src/journey/reconciliation";

const DIGEST = "d".repeat(64);

function persistence(): JourneyPersistence {
  return {
    inbox: {},
    outbox: {
      outbox_todo9_00000001: {
        attempts: 0,
        eventDigest: DIGEST,
        eventId: "outbox_todo9_00000001",
        eventType: "journey.activation",
        expiresAt: 50_000,
        nextAttemptAt: 2_000,
        status: "pending",
        writeEpoch: 12,
      },
    },
  };
}

describe("journey outbox reconciliation", () => {
  it("deduplicates inbox effects and fences stale restore epochs", () => {
    // Given: a fresh event followed by its duplicate and an old-epoch event.
    const initial = persistence();
    const event = {
      eventDigest: DIGEST,
      eventId: "inbox_todo9_00000001",
      eventType: "journey.activation.ack",
      expiresAt: 50_000,
      receivedAt: 3_000,
      resultCode: "acknowledged",
      writeEpoch: 12,
    } as const;

    // When: reconciliation records all three deliveries.
    const first = recordInbox(initial, event, 12);
    const duplicate = recordInbox(first.persistence, event, 12);
    const stale = recordInbox(
      duplicate.persistence,
      { ...event, eventId: "inbox_todo9_stale_0001", writeEpoch: 11 },
      12,
    );

    // Then: only one event qualifies for an effect and stale work is fenced.
    expect(first.kind).toBe("recorded");
    expect(duplicate.kind).toBe("duplicate");
    expect(stale.kind).toBe("stale_epoch");
    expect(Object.keys(stale.persistence.inbox)).toHaveLength(1);
  });

  it("schedules retry after a crash and acknowledges exactly once", () => {
    // Given: one due activation outbox item.
    const initial = persistence();

    // When: a failed attempt is leased again and then acknowledged twice.
    const due = dueOutbox(initial, 2_000);
    const acknowledged = acknowledgeOutbox(due.persistence, "outbox_todo9_00000001", 2_500);
    const duplicate = acknowledgeOutbox(acknowledged.persistence, "outbox_todo9_00000001", 2_600);

    // Then: one stable event converges to one acknowledgement.
    expect(due.events).toHaveLength(1);
    expect(due.events[0]?.attempts).toBe(1);
    expect(acknowledged.kind).toBe("acknowledged");
    expect(duplicate.kind).toBe("already_acknowledged");
  });
});
