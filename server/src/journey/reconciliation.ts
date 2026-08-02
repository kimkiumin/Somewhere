export type OutboxRecord = Readonly<{
  attempts: number;
  eventDigest: string;
  eventId: string;
  eventType: string;
  expiresAt: number;
  nextAttemptAt: number;
  status: "pending" | "acknowledged";
  writeEpoch: number;
}>;

export type InboxRecord = Readonly<{
  eventDigest: string;
  eventId: string;
  eventType: string;
  expiresAt: number;
  receivedAt: number;
  resultCode: string;
  writeEpoch: number;
}>;

export type JourneyPersistence = Readonly<{
  inbox: Readonly<Record<string, InboxRecord>>;
  outbox: Readonly<Record<string, OutboxRecord>>;
}>;

export function recordInbox(
  persistence: JourneyPersistence,
  event: InboxRecord,
  currentWriteEpoch: number,
): Readonly<{
  kind: "recorded" | "duplicate" | "stale_epoch";
  persistence: JourneyPersistence;
}> {
  if (event.writeEpoch !== currentWriteEpoch) {
    return { kind: "stale_epoch", persistence };
  }
  if (persistence.inbox[event.eventId] !== undefined) {
    return { kind: "duplicate", persistence };
  }
  return {
    kind: "recorded",
    persistence: {
      ...persistence,
      inbox: { ...persistence.inbox, [event.eventId]: event },
    },
  };
}

export function dueOutbox(
  persistence: JourneyPersistence,
  now: number,
): Readonly<{
  events: readonly OutboxRecord[];
  persistence: JourneyPersistence;
}> {
  const due = Object.values(persistence.outbox).filter(
    (event) => event.status === "pending" && event.nextAttemptAt <= now && event.expiresAt > now,
  );
  const leased = due.map((event) => ({
    ...event,
    attempts: event.attempts + 1,
    nextAttemptAt: now + Math.min(60_000, 1_000 * 2 ** event.attempts),
  }));
  const outbox = { ...persistence.outbox };
  for (const event of leased) {
    outbox[event.eventId] = event;
  }
  return { events: leased, persistence: { ...persistence, outbox } };
}

export function acknowledgeOutbox(
  persistence: JourneyPersistence,
  eventId: string,
  acknowledgedAt: number,
): Readonly<{
  kind: "acknowledged" | "already_acknowledged" | "missing";
  persistence: JourneyPersistence;
}> {
  const event = persistence.outbox[eventId];
  if (event === undefined) {
    return { kind: "missing", persistence };
  }
  if (event.status === "acknowledged") {
    return { kind: "already_acknowledged", persistence };
  }
  return {
    kind: "acknowledged",
    persistence: {
      ...persistence,
      outbox: {
        ...persistence.outbox,
        [eventId]: {
          ...event,
          nextAttemptAt: acknowledgedAt,
          status: "acknowledged",
        },
      },
    },
  };
}
