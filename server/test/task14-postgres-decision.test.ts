import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPostgresDecisionReceipt,
  PostgresDecisionRepository,
} from "../src/operations/postgres-decision";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const DIGEST = `sha256:${"a".repeat(64)}`;
const temporaryPaths: string[] = [];

describe("Task 14 PostgreSQL trigger decision", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("records measured trigger facts without introducing dual-write", async () => {
    // Given: healthy D1 facts and a second observation that requires a serializable invariant.
    const healthy = facts();
    const triggered = { ...healthy, serializableCrossAggregateInvariantRequired: true };
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-postgres-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(
      path,
      readFileSync(resolve(process.cwd(), "migrations/0004_operations_control.sql"), "utf8"),
    );
    const repository = new PostgresDecisionRepository(new SqliteDatabase(path));

    // When: both measured fact sets produce and persist decision receipts.
    const stay = await createPostgresDecisionReceipt({
      decidedAt: "2026-07-29T12:00:00Z",
      facts: healthy,
      reviewedReleaseDigest: DIGEST,
      reviewerDigest: DIGEST,
    });
    const plan = await createPostgresDecisionReceipt({
      decidedAt: "2026-07-29T12:05:00Z",
      facts: triggered,
      reviewedReleaseDigest: DIGEST,
      reviewerDigest: DIGEST,
    });
    await repository.record(stay);
    await repository.record(plan);

    // Then: only measured triggers plan a cutover and neither receipt enables dual-write.
    expect(stay).toMatchObject({ decision: "STAY_D1", dualWrite: false });
    expect(plan).toMatchObject({ decision: "PLAN_POSTGRES_CUTOVER", dualWrite: false });
    expect(
      queryJson(
        path,
        `SELECT decision, trigger_facts_digest
         FROM operations_postgres_decisions ORDER BY decided_at`,
      ),
    ).toEqual([
      { decision: "STAY_D1", trigger_facts_digest: stay.triggerFactsDigest.slice(7) },
      { decision: "PLAN_POSTGRES_CUTOVER", trigger_facts_digest: plan.triggerFactsDigest.slice(7) },
    ]);
  });
});

function facts() {
  return {
    crossDomainJoinsOperationallyCentral: false,
    d1StorageFraction: 0.2,
    multiRegionControlRequired: false,
    recoveryObjectiveHours: 24,
    serializableCrossAggregateInvariantRequired: false,
    sustainedWriteContentionP95Ms: 8,
    writeContentionObjectiveMs: 20,
  };
}
