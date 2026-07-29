import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { METER_POLICIES } from "../src/admission/meter";
import { OperationsHealthRepository } from "../src/operations/health-repository";
import { executeSql, SqliteDatabase } from "./d1-sqlite-fixture";

const temporaryPaths: string[] = [];

describe("Task 14 derived operations health", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("derives health from release-bound gates and the least-fresh effective meter", async () => {
    // Given: durable state claims OPEN while one blocking meter has a stale authority sample.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-health-"));
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
    seedHealthState(path);

    // When: production health is reconciled from the persisted meter authorities.
    const health = await new OperationsHealthRepository(new SqliteDatabase(path)).load(
      "production",
      1_000_000,
    );

    // Then: a fresh unrelated meter cannot hide the stale blocker or claim readiness.
    expect(health).toMatchObject({
      admissionState: "METER_BLOCK",
      externalGates: "PASS",
      status: "blocked",
      writeEpoch: 4,
    });
  });
});

function seedHealthState(path: string): void {
  const releaseDigest = "a".repeat(64);
  const meters = METER_POLICIES.map((policy) => {
    const observedAt = policy.id === "worker.dynamic_requests" ? 1 : 1_000_000;
    return `('${policy.id}', 1, 2000000, 1, ${observedAt}, 1, ${observedAt},
      1, 0, 0, 1, '${releaseDigest}', 1000000, 174800000)`;
  }).join(",\n");
  const envelopes = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  )
    .map(
      (policy) =>
        `('${releaseDigest}', '${policy.id}', 1, ${policy.closeAt}, ${
          policy.freshnessMs
        }, ${policy.resetConfirmationRequired ? 1 : 0}, '${"b".repeat(64)}', 1, 2000000)`,
    )
    .join(",\n");
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
       'production', 4, 'OPEN', 'health-test', '${releaseDigest}', 1, NULL
     );
     INSERT INTO operations_admission_state VALUES (
       'production', 'OPEN', 4, '${releaseDigest}', 1, 1, 2, 0, 1
     );
     INSERT INTO operations_meter_windows VALUES ${meters};
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'provider-rights', '${releaseDigest}', '${releaseDigest}',
       '${releaseDigest}', '${"f".repeat(64)}', '[]', 1, 2000000
     );
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'korea-review', '${releaseDigest}', '${"c".repeat(64)}',
       '${"c".repeat(64)}', '${"f".repeat(64)}', '[]', 1, 2000000
     );`,
  );
}
