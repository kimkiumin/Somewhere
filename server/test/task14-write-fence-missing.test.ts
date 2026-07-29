import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AdmissionRepository } from "../src/operations/admission-repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const DIGEST = "a".repeat(64);
const temporaryPaths: string[] = [];

describe("task14 write fence", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("TASK14_WRITE_FENCE_REQUIRED persists the current maintenance epoch", async () => {
    // Given: a fresh operational meter window with no durable write-fence authority.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-fence-"));
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
    executeSql(
      path,
      `INSERT INTO operations_meter_windows VALUES (
        'worker.dynamic_requests', 1, 1000, 1, 1, 1, 1, 1, 0, 0, 1,
        '${DIGEST}', 1, 172801000
      )`,
    );
    const repository = new AdmissionRepository(new SqliteDatabase(path));
    const input = {
      closeAt: 80,
      environment: "local" as const,
      expiresAt: 900,
      meterId: "worker.dynamic_requests" as const,
      now: 2,
      providerDigest: null,
      releaseDigest: DIGEST,
      requestDigest: "b".repeat(64),
      reservationId: "reservation_000000000001",
      units: 1,
      windowStartUtc: 1,
      writeEpoch: 4,
    };

    // When: admission runs before and after an OPEN fence establishes epoch four.
    const missingFence = await repository.reserve(input);
    executeSql(
      path,
      `INSERT INTO operations_write_fence VALUES (
        'local', 4, 'OPEN', 'test', '${DIGEST}', 1, 1000
      )`,
    );
    const openFence = await repository.reserve(input);

    // Then: absence fail-closes and the admitted reservation persists the current epoch.
    expect(missingFence).toEqual({ kind: "closed" });
    expect(openFence).toEqual({
      kind: "reserved",
      reservationId: "reservation_000000000001",
    });
    expect(queryJson(path, "SELECT write_epoch FROM operations_meter_reservations")).toEqual([
      { write_epoch: 4 },
    ]);
  });
});
