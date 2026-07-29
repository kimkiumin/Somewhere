import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AdmissionRepository } from "../src/operations/admission-repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const DIGEST = "a".repeat(64);
const paths: string[] = [];

describe("Task 14 atomic budget reservations", () => {
  afterEach(() => {
    for (const path of paths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("atomically reserves headroom and finalizes it exactly once", async () => {
    // Given: an open write epoch with only one unit below the close threshold.
    const fixture = migratedFixture();
    seedControlState(fixture.path);
    const repository = new AdmissionRepository(fixture.database);
    const firstInput = reservationInput("reservation_000000000001", "b".repeat(64));

    // When: one request reserves, a second request competes, and finalization is retried.
    const first = await repository.reserve(firstInput);
    const replay = await repository.reserve(firstInput);
    const released = await repository.release("reservation_000000000001", 1);
    const reopened = await repository.reserve(firstInput);
    const second = await repository.reserve(
      reservationInput("reservation_000000000002", "c".repeat(64)),
    );
    const finalized = await repository.finalize("reservation_000000000001", 1, 1);
    const finalizedAgain = await repository.finalize("reservation_000000000001", 1, 1);

    // Then: headroom is never oversubscribed and the trigger accounts final usage once.
    expect(first).toEqual({ kind: "reserved", reservationId: "reservation_000000000001" });
    expect(replay).toEqual({ kind: "replayed", reservationId: "reservation_000000000001" });
    expect(released).toBe(true);
    expect(reopened).toEqual({
      kind: "reserved",
      reservationId: "reservation_000000000001",
    });
    expect(second).toEqual({ kind: "closed" });
    expect(finalized).toBe(true);
    expect(finalizedAgain).toBe(true);
    expect(queryJson(fixture.path, "SELECT local_finalized FROM operations_meter_windows")).toEqual(
      [{ local_finalized: 79 }],
    );
  });

  it("rejects reservations behind a fence, old epoch, or provider kill switch", async () => {
    // Given: a valid meter window and a currently open write epoch.
    const fixture = migratedFixture();
    seedControlState(fixture.path);
    const repository = new AdmissionRepository(fixture.database);

    // When: each independent operational control closes admission.
    executeSql(
      fixture.path,
      "UPDATE operations_write_fence SET mode = 'ADMISSION_CLOSED' WHERE environment = 'local'",
    );
    const fenced = await repository.reserve(reservationInput("reservation_000000000003", DIGEST));
    executeSql(
      fixture.path,
      "UPDATE operations_write_fence SET mode = 'OPEN', write_epoch = 2 WHERE environment = 'local'",
    );
    const oldEpoch = await repository.reserve(
      reservationInput("reservation_000000000004", "d".repeat(64)),
    );
    executeSql(
      fixture.path,
      `INSERT INTO operations_kill_switches VALUES (
        'provider', '${"e".repeat(64)}', 1, 'provider-block', 2, 2
      )`,
    );
    const killed = await repository.reserve({
      ...reservationInput("reservation_000000000005", "f".repeat(64)),
      providerDigest: "e".repeat(64),
      writeEpoch: 2,
    });

    // Then: none creates a durable reservation.
    expect([fenced, oldEpoch, killed]).toEqual([
      { kind: "closed" },
      { kind: "closed" },
      { kind: "closed" },
    ]);
  });
});

function migratedFixture(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-reservation-"));
  paths.push(root);
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

function seedControlState(path: string): void {
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
      'local', 1, 'OPEN', 'test', '${DIGEST}', 1, 1000
    );
    INSERT INTO operations_meter_windows VALUES (
      'worker.dynamic_requests', 1, 1000, 78, 1, 78, 1, 78, 0, 0, 1, '${DIGEST}', 1, 172801000
    );`,
  );
}

function reservationInput(reservationId: string, requestDigest: string) {
  return {
    closeAt: 80,
    environment: "local" as const,
    expiresAt: 900,
    meterId: "worker.dynamic_requests" as const,
    now: 2,
    providerDigest: null,
    releaseDigest: DIGEST,
    requestDigest,
    reservationId,
    units: 1,
    windowStartUtc: 1,
    writeEpoch: 1,
  };
}
