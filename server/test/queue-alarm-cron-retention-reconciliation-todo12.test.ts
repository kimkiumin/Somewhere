import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { buildAsyncMessage } from "../src/async/message";
import { AsyncD1Repository } from "../src/async/repository";
import { RETENTION_MS, type RetentionCleanupCounts } from "../src/async/retention";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const tempRoots: string[] = [];

function databaseFixture(): Readonly<{
  path: string;
  repository: AsyncD1Repository;
}> {
  const root = mkdtempSync(join(tmpdir(), "somewhere-todo12-d1-"));
  tempRoots.push(root);
  const path = join(root, "async.sqlite");
  const migration = readFileSync(join(process.cwd(), "migrations/0001_v2.sql"), "utf8");
  execFileSync("sqlite3", [path], { encoding: "utf8", input: migration });
  return { path, repository: new AsyncD1Repository(new SqliteDatabase(path)) };
}

function insertReceipt(path: string, now: number): void {
  executeSql(
    path,
    `
      INSERT INTO policy_versions VALUES ('policy_todo12_00000001','selection',1,'${DIGEST_A}',${now},NULL);
      INSERT INTO qualified_pools VALUES ('pool_todo12_0000000001','policy_todo12_00000001','sealed',1,0,'${DIGEST_B}',${now},${now + RETENTION_MS.preparedReceipt});
      INSERT INTO selection_receipts VALUES ('receipt_todo12_0000001','pool_todo12_0000000001','${DIGEST_A}','${DIGEST_C}','${DIGEST_B}','prepared',NULL,1,${now},NULL,${now + RETENTION_MS.preparedReceipt});
    `,
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("Todo12 D1 async reconciliation", () => {
  it("deduplicates for exactly 48 hours and rejects late work behind a tombstone", async () => {
    const now = 1_750_000_000_000;
    const { path, repository } = databaseFixture();
    const message = await buildAsyncMessage({
      eventType: "journey.expire",
      occurredAt: now,
      subjectDigest: DIGEST_A,
      writeEpoch: 3,
    });
    executeSql(
      path,
      `
        INSERT INTO journey_tombstones VALUES ('${DIGEST_A}','${DIGEST_B}','deleted',${now},4,204,${now + RETENTION_MS.tombstone});
        INSERT INTO outbox_events VALUES ('outbox_todo12_crash_001','${DIGEST_A}','${message.eventDigest}','journey.expire','pending',3,${now},NULL,${now + RETENTION_MS.inboxOutbox});
      `,
    );

    const first = await repository.consume(message, now);
    executeSql(
      path,
      `UPDATE outbox_events SET delivery_state = 'pending', acknowledged_at = NULL WHERE event_digest = '${message.eventDigest}';`,
    );
    const duplicate = await repository.consume(message, now + 1);

    expect(first).toEqual({ kind: "tombstoned" });
    expect(duplicate).toEqual({ kind: "duplicate", resultCode: "tombstoned" });
    expect(queryJson(path, "SELECT result_code, expires_at FROM inbox_events")).toEqual([
      {
        expires_at: now + RETENTION_MS.inboxOutbox,
        result_code: "tombstoned",
      },
    ]);
    expect(queryJson(path, "SELECT * FROM browser_session_guards")).toEqual([]);
    expect(
      queryJson(path, "SELECT delivery_state, acknowledged_at, expires_at FROM outbox_events"),
    ).toEqual([
      {
        acknowledged_at: now + 1,
        delivery_state: "delivered",
        expires_at: now + 1 + RETENTION_MS.inboxOutbox,
      },
    ]);
  });

  it("activates a prepared receipt once and never after its one-hour expiry", async () => {
    const now = 1_750_000_000_000;
    const first = databaseFixture();
    insertReceipt(first.path, now);
    const activation = await buildAsyncMessage({
      eventType: "journey.activation.repair",
      occurredAt: now,
      subjectDigest: DIGEST_C,
      writeEpoch: 1,
    });

    expect(
      await first.repository.consume(activation, now + RETENTION_MS.preparedReceipt - 1),
    ).toEqual({ kind: "applied", resultCode: "receipt_activated" });
    expect(
      queryJson(first.path, "SELECT receipt_state, expires_at FROM selection_receipts"),
    ).toEqual([
      {
        expires_at: now + RETENTION_MS.preparedReceipt - 1 + RETENTION_MS.sealedReceipt,
        receipt_state: "activated",
      },
    ]);

    const expired = databaseFixture();
    insertReceipt(expired.path, now);
    const late = await buildAsyncMessage({
      eventType: "journey.activation.repair",
      occurredAt: now,
      subjectDigest: DIGEST_C,
      writeEpoch: 1,
    });
    expect(await expired.repository.consume(late, now + RETENTION_MS.preparedReceipt)).toEqual({
      kind: "ignored",
      resultCode: "receipt_expired",
    });
    expect(queryJson(expired.path, "SELECT receipt_state FROM selection_receipts")).toEqual([
      { receipt_state: "prepared" },
    ]);
  });

  it("records a future or stale epoch without mutating the prepared receipt", async () => {
    const now = 1_750_000_000_000;
    const { path, repository } = databaseFixture();
    insertReceipt(path, now);
    const outOfOrder = await buildAsyncMessage({
      eventType: "journey.activation.repair",
      occurredAt: now,
      subjectDigest: DIGEST_C,
      writeEpoch: 2,
    });

    expect(await repository.consume(outOfOrder, now + 1)).toEqual({
      kind: "ignored",
      resultCode: "stale_epoch",
    });
    expect(queryJson(path, "SELECT receipt_state FROM selection_receipts")).toEqual([
      { receipt_state: "prepared" },
    ]);
  });

  it("replays a stable D1 outbox message and retains its dedupe result for 48 hours", async () => {
    const now = 1_750_000_000_000;
    const { path, repository } = databaseFixture();
    const message = await buildAsyncMessage({
      eventType: "session.expire",
      occurredAt: now,
      subjectDigest: DIGEST_A,
      writeEpoch: 1,
    });

    await repository.enqueue(message, now);
    expect(await repository.listPendingOutbox(now, 100)).toEqual([message]);
    expect(await repository.consume(message, now + 1)).toEqual({
      kind: "ignored",
      resultCode: "authority_deferred",
    });

    expect(
      queryJson(
        path,
        "SELECT event_id, event_digest, delivery_state, acknowledged_at, expires_at FROM outbox_events",
      ),
    ).toEqual([
      {
        acknowledged_at: now + 1,
        delivery_state: "delivered",
        event_digest: message.eventDigest,
        event_id: message.eventId,
        expires_at: now + 1 + RETENTION_MS.inboxOutbox,
      },
    ]);
  });

  it("fails closed on an unknown persisted message version or type", async () => {
    const now = 1_750_000_000_000;
    const { path, repository } = databaseFixture();
    executeSql(
      path,
      `INSERT INTO outbox_events VALUES ('outbox_todo12_unknown_01','${DIGEST_A}','${DIGEST_B}','journey.reveal','pending',1,${now},NULL,${now + RETENTION_MS.inboxOutbox});`,
    );

    await expect(repository.listPendingOutbox(now, 100)).rejects.toThrow(
      "Unsupported asynchronous event type",
    );
  });

  it("enforces every durable TTL at the boundary and is idempotent under duplicate Cron", async () => {
    const now = 1_750_000_000_000;
    const { path, repository } = databaseFixture();
    const expiredAt = now;
    const aliveAt = now + 1;
    seedRetentionRows(path, expiredAt, aliveAt);

    const first = await repository.cleanupRetention(now);
    const duplicate = await repository.cleanupRetention(now);

    expect(first).toEqual<RetentionCleanupCounts>({
      auditEvents: 1,
      budgetReservations: 1,
      feedbackEligibility: 1,
      inboxEvents: 1,
      journeyTombstones: 1,
      outboxEvents: 1,
      placeReactions: 1,
      preparedReceipts: 1,
      sealedReceipts: 1,
      sessionGuards: 1,
    });
    expect(duplicate).toEqual(Object.fromEntries(Object.keys(first).map((key) => [key, 0])));
    for (const table of [
      "audit_events",
      "budget_reservations",
      "feedback_eligibility",
      "inbox_events",
      "journey_tombstones",
      "outbox_events",
      "place_reactions",
      "browser_session_guards",
    ]) {
      expect(queryJson(path, `SELECT COUNT(*) AS count FROM ${table}`)).toEqual([{ count: 1 }]);
    }
    expect(
      queryJson(
        path,
        "SELECT receipt_state, COUNT(*) AS count FROM selection_receipts GROUP BY receipt_state ORDER BY receipt_state",
      ),
    ).toEqual([
      { count: 1, receipt_state: "activated" },
      { count: 1, receipt_state: "prepared" },
    ]);
  });
});

function seedRetentionRows(path: string, expiredAt: number, aliveAt: number): void {
  const now = expiredAt - 1_000;
  insertReceipt(path, now - RETENTION_MS.preparedReceipt);
  executeSql(
    path,
    `
      INSERT INTO selection_receipts VALUES ('receipt_todo12_alive_0001','pool_todo12_0000000001','${DIGEST_A}','${DIGEST_B}','${DIGEST_C}','prepared',NULL,1,${now},NULL,${aliveAt});
      INSERT INTO selection_receipts VALUES ('receipt_todo12_sealed_dead','pool_todo12_0000000001','${DIGEST_A}','${DIGEST_B}','${DIGEST_C}','activated','${DIGEST_A}',1,${now - 1000},${now},${expiredAt});
      INSERT INTO selection_receipts VALUES ('receipt_todo12_sealed_live','pool_todo12_0000000001','${DIGEST_A}','${DIGEST_B}','${DIGEST_C}','activated','${DIGEST_B}',1,${now - 1000},${now},${aliveAt});
      INSERT INTO browser_session_guards VALUES ('${DIGEST_A}',1,NULL,NULL,NULL,NULL,NULL,NULL,${expiredAt});
      INSERT INTO browser_session_guards VALUES ('${DIGEST_B}',1,NULL,NULL,NULL,NULL,NULL,NULL,${aliveAt});
      INSERT INTO feedback_eligibility VALUES ('feedback_todo12_dead_001','${DIGEST_A}','${DIGEST_B}','expired',${now},${expiredAt},NULL);
      INSERT INTO feedback_eligibility VALUES ('feedback_todo12_live_001','${DIGEST_B}','${DIGEST_C}','eligible',${now},${aliveAt},NULL);
      INSERT INTO place_reactions VALUES ('reaction_todo12_dead_001','neutral',1,'${DIGEST_A}',${now},${expiredAt});
      INSERT INTO place_reactions VALUES ('reaction_todo12_live_001','neutral',1,'${DIGEST_A}',${now},${aliveAt});
      INSERT INTO audit_events VALUES ('audit_todo12_dead_000001','system','retention','expired',NULL,NULL,${now},${expiredAt});
      INSERT INTO audit_events VALUES ('audit_todo12_live_000001','system','retention','alive',NULL,NULL,${now},${aliveAt});
      INSERT INTO budget_windows VALUES ('budget_todo12_window_0001','queue.operations',${now - 1000},${aliveAt + 1000},'${DIGEST_A}',0);
      INSERT INTO budget_reservations VALUES ('reservation_todo12_dead','budget_todo12_window_0001','${DIGEST_A}',1,'finalized',${now},${expiredAt});
      INSERT INTO budget_reservations VALUES ('reservation_todo12_live','budget_todo12_window_0001','${DIGEST_B}',1,'outstanding',${now},${aliveAt});
      INSERT INTO inbox_events VALUES ('inbox_todo12_dead_0001','${DIGEST_A}','journey.expire','expired',1,${now},${expiredAt});
      INSERT INTO inbox_events VALUES ('inbox_todo12_live_0001','${DIGEST_B}','journey.expire','alive',1,${now},${aliveAt});
      INSERT INTO outbox_events VALUES ('outbox_todo12_dead_001','${DIGEST_A}','${DIGEST_A}','journey.expire','delivered',1,${now},${now},${expiredAt});
      INSERT INTO outbox_events VALUES ('outbox_todo12_live_001','${DIGEST_B}','${DIGEST_B}','journey.expire','pending',1,${now},NULL,${aliveAt});
      INSERT INTO journey_tombstones VALUES ('${DIGEST_A}','${DIGEST_B}','expired',${now},1,204,${expiredAt});
      INSERT INTO journey_tombstones VALUES ('${DIGEST_B}','${DIGEST_C}','expired',${now},1,204,${aliveAt});
    `,
  );
}
