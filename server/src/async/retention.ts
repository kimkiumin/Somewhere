import { z } from "zod";

import type { Database } from "../db/database";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const countRowSchema = z.object({ count: z.number().int().nonnegative() }).strict();

export const RETENTION_MS = {
  audit: 180 * DAY,
  coarseOperations: 7 * DAY,
  feedback: 7 * DAY,
  inboxOutbox: 48 * HOUR,
  journey: 24 * HOUR,
  preparedReceipt: HOUR,
  queueDlq: DAY,
  sealedReceipt: 180 * DAY,
  session: 24 * HOUR,
  tombstone: 48 * HOUR,
} as const;

export type RetentionCleanupCounts = Readonly<{
  auditEvents: number;
  budgetReservations: number;
  feedbackEligibility: number;
  inboxEvents: number;
  journeyTombstones: number;
  outboxEvents: number;
  placeReactions: number;
  preparedReceipts: number;
  sealedReceipts: number;
  sessionGuards: number;
}>;

export async function cleanupRetention(
  database: Database,
  now: number,
): Promise<RetentionCleanupCounts> {
  const preparedReceipts = await countExpired(
    database,
    "selection_receipts",
    now,
    "receipt_state = 'prepared' AND ",
  );
  await database
    .prepare("DELETE FROM selection_receipts WHERE receipt_state = 'prepared' AND expires_at <= ?")
    .bind(now)
    .run();
  const sealedReceipts = await countExpired(
    database,
    "selection_receipts",
    now,
    "receipt_state <> 'prepared' AND ",
  );
  await database
    .prepare("DELETE FROM selection_receipts WHERE receipt_state <> 'prepared' AND expires_at <= ?")
    .bind(now)
    .run();

  return {
    auditEvents: await deleteExpired(database, "audit_events", now),
    budgetReservations: await deleteExpired(database, "budget_reservations", now),
    feedbackEligibility: await deleteExpired(database, "feedback_eligibility", now),
    inboxEvents: await deleteExpired(database, "inbox_events", now),
    journeyTombstones: await deleteExpired(database, "journey_tombstones", now),
    outboxEvents: await deleteExpired(database, "outbox_events", now),
    placeReactions: await deleteExpired(database, "place_reactions", now),
    preparedReceipts,
    sealedReceipts,
    sessionGuards: await deleteExpired(database, "browser_session_guards", now),
  };
}

async function deleteExpired(database: Database, table: string, now: number): Promise<number> {
  const count = await countExpired(database, table, now);
  await database.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).bind(now).run();
  return count;
}

async function countExpired(
  database: Database,
  table: string,
  now: number,
  predicate = "",
): Promise<number> {
  const row = countRowSchema.parse(
    await database
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}expires_at <= ?`)
      .bind(now)
      .first(),
  );
  return row.count;
}
