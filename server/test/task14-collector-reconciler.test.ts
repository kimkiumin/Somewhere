import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { METER_POLICIES } from "../src/admission/meter";
import { collectOperationsMeters, type MeterCollection } from "../src/operations/meter-collector";
import { reconcileOperationsState } from "../src/operations/reconciler";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const NOW = 1_000_000;
const DIGEST = "a".repeat(64);
const temporaryPaths: string[] = [];

describe("Task 14 meter collection and reconciliation", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("ingests exactly 15 meters monotonically and reconciles the durable admission state", async () => {
    // Given: an active release and one complete platform collection at healthy usage.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    const source = {
      collect: async () => collection(0.1),
    };
    await collectOperationsMeters(source, fixture.database, NOW);

    // When: a delayed lower sample arrives, then a fresh threshold sample is reconciled.
    await collectOperationsMeters(
      { collect: async () => collection(0.01) },
      fixture.database,
      NOW + 1,
    );
    const delayedD1 = queryJson(
      fixture.path,
      `SELECT platform_observed FROM operations_meter_windows
       WHERE meter_id = 'd1.rows_read'`,
    );
    await collectOperationsMeters(
      { collect: async () => collection(0.1, "worker.dynamic_requests", 0.8) },
      fixture.database,
      NOW + 2,
    );
    await reconcileOperationsState(fixture.database, "production", NOW + 2, NOW + 2);

    // Then: lower delayed usage never subtracts, all meters exist, and admission closes at 80%.
    expect(delayedD1).toEqual([{ platform_observed: 500_000 }]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_meter_windows"),
    ).toEqual([{ count: 15 }]);
    expect(
      queryJson(
        fixture.path,
        "SELECT state, fresh_recovery_samples FROM operations_admission_state",
      ),
    ).toEqual([{ fresh_recovery_samples: 0, state: "METER_BLOCK" }]);
  });

  it("requires two consecutive healthy samples before reopening a blocked release", async () => {
    // Given: an externally blocked release receives a complete healthy authoritative sample.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    executeSql(
      fixture.path,
      `UPDATE operations_admission_state
       SET state = 'EXTERNAL_BLOCK', fresh_recovery_samples = 0
       WHERE environment = 'production'`,
    );
    await collectOperationsMeters({ collect: async () => collection(0.1) }, fixture.database, NOW);

    // When: the scheduled reconciler observes the same healthy authorities twice.
    await reconcileOperationsState(fixture.database, "production", NOW, NOW);
    const first = queryJson(
      fixture.path,
      "SELECT state, fresh_recovery_samples FROM operations_admission_state",
    );
    await collectOperationsMeters(
      { collect: async () => collection(0.1, undefined, undefined, NOW + 300_000) },
      fixture.database,
      NOW + 300_000,
    );
    await reconcileOperationsState(fixture.database, "production", NOW + 300_000, NOW + 300_000);
    const second = queryJson(
      fixture.path,
      "SELECT state, fresh_recovery_samples FROM operations_admission_state",
    );

    // Then: the first observation remains closed and only the second reopens admission.
    expect(first).toEqual([{ fresh_recovery_samples: 1, state: "RECOVERY_VERIFY" }]);
    expect(second).toEqual([{ fresh_recovery_samples: 2, state: "OPEN" }]);
  });
});

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-collector-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
  ]) {
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations", migration), "utf8"));
  }
  return { database: new SqliteDatabase(path), path };
}

function seedControl(path: string): void {
  const envelopes = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  )
    .map(
      (policy) =>
        `('${DIGEST}', '${policy.id}', 1, ${policy.closeAt}, ${policy.freshnessMs}, ${
          policy.resetConfirmationRequired ? 1 : 0
        }, '${"b".repeat(64)}', 1, 2000000)`,
    )
    .join(",\n");
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
       'production', 4, 'OPEN', 'collector-test', '${DIGEST}', 1, NULL
     );
     INSERT INTO operations_admission_state VALUES (
       'production', 'OPEN', 4, '${DIGEST}', 1, 1, 2, 0, 1
     );
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'provider-rights', '${DIGEST}', '${DIGEST}', '${DIGEST}',
       '${"f".repeat(64)}', '[]', 1, 2000000
     );
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'korea-review', '${DIGEST}', '${"c".repeat(64)}',
       '${"c".repeat(64)}', '${"f".repeat(64)}', '[]', 1, 2000000
     );`,
  );
}

function collection(
  fraction: number,
  overrideId?: (typeof METER_POLICIES)[number]["id"],
  overrideFraction?: number,
  capturedAt = NOW,
): MeterCollection {
  return {
    authorityDigest: DIGEST,
    capturedAt,
    meters: METER_POLICIES.map((policy) => {
      const used = Math.floor(
        policy.cap * (policy.id === overrideId ? (overrideFraction ?? fraction) : fraction),
      );
      return {
        expiresAt: 174_800_000,
        immediateObserved: used,
        immediateObservedAt: capturedAt,
        localFinalized: 0,
        meterId: policy.id,
        outstandingReservations: 0,
        platformObserved: used,
        platformObservedAt: capturedAt,
        resetConfirmed: true,
        unrelatedBaseline: 0,
        uncertaintyReserve: 0,
        windowEndUtc: 2_000_000,
        windowStartUtc: 1,
      };
    }),
  };
}
