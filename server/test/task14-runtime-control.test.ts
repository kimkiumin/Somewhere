import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { METER_POLICIES } from "../src/admission/meter";
import { OperationsRuntimeControl } from "../src/operations/runtime-control";
import { executeSql, SqliteDatabase } from "./d1-sqlite-fixture";

const temporaryPaths: string[] = [];

describe("Task 14 production operations boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("fail-closes new journeys while preserving Stop, Reveal, and Delete", async () => {
    // Given: production admission is closed at write epoch four.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    executeSql(
      fixture.path,
      `INSERT INTO operations_write_fence VALUES (
        'production', 4, 'ADMISSION_CLOSED', 'pilot-close',
        '${"a".repeat(64)}', 1, NULL
      )`,
    );
    const control = new OperationsRuntimeControl(fixture.database);

    // When: new work and each terminal safety route cross the production boundary.
    const create = await control.authorize(request("POST", "/api/v1/journeys"), "production", 2);
    const stop = await control.authorize(
      request("POST", "/api/v1/journeys/j_v1.AAAAAAAAAAAAAAAAAAAAAA/stop/request"),
      "production",
      2,
    );
    const reveal = await control.authorize(
      request("POST", "/api/v1/journeys/j_v1.AAAAAAAAAAAAAAAAAAAAAA/reveal"),
      "production",
      2,
    );
    const deletion = await control.authorize(
      request("DELETE", "/api/v1/journeys/j_v1.AAAAAAAAAAAAAAAAAAAAAA"),
      "production",
      2,
    );
    const snapshot = await control.authorize(
      request("GET", "/api/v1/journeys/j_v1.AAAAAAAAAAAAAAAAAAAAAA"),
      "production",
      2,
    );

    // Then: only terminal convergence remains available.
    expect(create.allowed).toBe(false);
    expect([stop.allowed, reveal.allowed, deletion.allowed, snapshot.allowed]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("classifies unbound session issuance as new work and feedback reaction as active mutation", async () => {
    // Given: production admission is closed while the current epoch remains available to safety.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    executeSql(
      fixture.path,
      `INSERT INTO operations_write_fence VALUES (
        'production', 4, 'ADMISSION_CLOSED', 'pilot-close',
        '${"a".repeat(64)}', 1, NULL
      )`,
    );
    const control = new OperationsRuntimeControl(fixture.database);

    // When: an unbound session request and a feedback reaction cross the same boundary.
    const session = await control.authorize(request("GET", "/api/v1/session"), "production", 2);
    const reaction = await control.authorize(
      request("POST", "/api/v1/feedback/fid_v1.AAAAAAAAAAAAAAAAAAAAAA/reaction"),
      "production",
      2,
    );

    // Then: neither write bypasses closed admission through a generic GET or feedback route.
    expect(session.allowed).toBe(false);
    expect(reaction.allowed).toBe(false);
  });

  it("rejects a future terminal write epoch before the safety exemption", async () => {
    // Given: an OPEN production fence at epoch four.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    executeSql(
      fixture.path,
      `INSERT INTO operations_write_fence VALUES (
        'production', 4, 'OPEN', 'pilot-open', '${"a".repeat(64)}', 1, NULL
      )`,
    );

    // When: a reveal claims an unsigned future epoch.
    const result = await new OperationsRuntimeControl(fixture.database).authorize(
      request("POST", "/api/v1/journeys/j_v1.AAAAAAAAAAAAAAAAAAAAAA/reveal", {
        "x-write-epoch": "5",
      }),
      "production",
      2,
    );

    // Then: it is rejected instead of being rewritten silently to epoch four.
    expect(result.allowed).toBe(false);
  });

  it("admits through legal, meter, kill-switch, fence, reservation, and log controls", async () => {
    // Given: every independent production authority is fresh, OPEN, and release-matched.
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    seedOpenProduction(fixture.path);
    const control = new OperationsRuntimeControl(fixture.database);

    // When: an authenticated controller explicitly reserves and completes the new work.
    const result = await control.authorize(
      request("POST", "/api/v1/journeys", { "idempotency-key": "idem_v1.test" }),
      "production",
      2,
    );
    if (result.allowed && result.reserveNewWork !== undefined) {
      const reservation = await result.reserveNewWork("idem_v1.test");
      await reservation?.finalize();
    }

    // Then: one atomic reservation finalizes and its allowlisted log contains no URL or secret.
    expect(result.allowed).toBe(true);
    await expect(
      fixture.database
        .prepare(
          `SELECT COUNT(*) AS count FROM operations_meter_reservations
           WHERE reservation_state = 'finalized'`,
        )
        .first(),
    ).resolves.toEqual({ count: 12 });
    const serializedLog = String(log.mock.calls[0]?.[0] ?? "");
    expect(serializedLog).toContain('"outcome":"allowed"');
    expect(serializedLog).not.toContain("http");
    expect(serializedLog).not.toContain("idem_v1.test");
  });

  it("defers a release-bound journey envelope until application authentication succeeds", async () => {
    // Given: every production authority is OPEN at write epoch four.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    seedOpenProduction(fixture.path);

    // When: the HTTP operations boundary authorizes a create before the controller authenticates it.
    const result = await new OperationsRuntimeControl(fixture.database).authorize(
      request("POST", "/api/v1/journeys", { "idempotency-key": "ik_v1.pre_auth_probe" }),
      "production",
      2,
    );

    // Then: it exposes the current epoch but does not consume any meter before authentication.
    expect(result.allowed).toBe(true);
    expect(result.allowed && "writeEpoch" in result ? result.writeEpoch : undefined).toBe(4);
    await expect(
      fixture.database
        .prepare("SELECT COUNT(*) AS count FROM operations_meter_reservations")
        .first(),
    ).resolves.toEqual({ count: 0 });
  });

  it("reopens released work for same-release retry without replaying across releases", async () => {
    // Given: release A is OPEN and an authenticated create has reserved its full envelope.
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fixture = migratedDatabase();
    seedOpenProduction(fixture.path);
    const control = new OperationsRuntimeControl(fixture.database);
    const firstGate = await control.authorize(request("POST", "/api/v1/journeys"), "production", 2);
    expect(firstGate.allowed && firstGate.reserveNewWork !== undefined).toBe(true);
    const firstReservation =
      firstGate.allowed && firstGate.reserveNewWork !== undefined
        ? await firstGate.reserveNewWork("ik_v1.same_authenticated_request")
        : undefined;

    // When: the application releases, retries successfully, then release B admits the same key.
    await firstReservation?.release();
    const sameReleaseReservation =
      firstGate.allowed && firstGate.reserveNewWork !== undefined
        ? await firstGate.reserveNewWork("ik_v1.same_authenticated_request")
        : undefined;
    await sameReleaseReservation?.finalize();
    seedReplacementRelease(fixture.path);
    const secondGate = await control.authorize(
      request("POST", "/api/v1/journeys"),
      "production",
      3,
    );
    const secondReservation =
      secondGate.allowed && secondGate.reserveNewWork !== undefined
        ? await secondGate.reserveNewWork("ik_v1.same_authenticated_request")
        : undefined;
    await secondReservation?.finalize();

    // Then: both release-matched attempts finalize without cross-release replay.
    expect(sameReleaseReservation).toBeDefined();
    expect(secondReservation).toBeDefined();
    await expect(
      fixture.database
        .prepare(
          `SELECT release_digest, reservation_state, COUNT(*) AS count
           FROM operations_meter_reservations
           GROUP BY release_digest, reservation_state
           ORDER BY release_digest`,
        )
        .all(),
    ).resolves.toEqual({
      results: [
        { count: 12, release_digest: "a".repeat(64), reservation_state: "finalized" },
        { count: 12, release_digest: "b".repeat(64), reservation_state: "finalized" },
      ],
    });
  });
});

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-runtime-"));
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

function request(method: string, pathname: string, headers?: HeadersInit): Request {
  return new Request(`https://somewhere.invalid${pathname}`, {
    ...(headers === undefined ? {} : { headers }),
    method,
  });
}

function seedOpenProduction(path: string): void {
  const digest = "a".repeat(64);
  const meters = METER_POLICIES.map(
    (policy) => `('${policy.id}', 1, 1000, 1, 1, 1, 1, 1, 0, 0, 1, '${digest}', 1, 172801000)`,
  ).join(",\n");
  const envelopes = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  )
    .map(
      (policy) =>
        `('${digest}', '${policy.id}', 1, ${policy.closeAt}, ${policy.freshnessMs}, ${
          policy.resetConfirmationRequired ? 1 : 0
        }, '${"c".repeat(64)}', 1, 1000)`,
    )
    .join(",\n");
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
       'production', 4, 'OPEN', 'pilot-open', '${digest}', 1, NULL
     );
     INSERT INTO operations_admission_state VALUES (
       'production', 'OPEN', 4, '${digest}', 1, 1, 2, 0, 1
     );
     INSERT INTO operations_meter_windows VALUES ${meters};
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'provider-rights', '${digest}', '${digest}', '${digest}',
       '${"f".repeat(64)}', '[]', 1, 1000
     );
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'korea-review', '${digest}', '${"b".repeat(64)}',
       '${"b".repeat(64)}', '${"f".repeat(64)}', '[]', 1, 1000
     );`,
  );
}

function seedReplacementRelease(path: string): void {
  const digest = "b".repeat(64);
  const envelopes = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  )
    .map(
      (policy) =>
        `('${digest}', '${policy.id}', 1, ${policy.closeAt}, ${policy.freshnessMs}, ${
          policy.resetConfirmationRequired ? 1 : 0
        }, '${"d".repeat(64)}', 2, 1000)`,
    )
    .join(",\n");
  executeSql(
    path,
    `UPDATE operations_admission_state
       SET release_digest = '${digest}', updated_at = 2
       WHERE environment = 'production';
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'provider-rights', '${digest}', '${digest}', '${digest}',
       '${"f".repeat(64)}', '[]', 2, 1000
     );
     INSERT INTO operations_verified_legal_artifacts VALUES (
       'production', 'korea-review', '${digest}', '${"c".repeat(64)}',
       '${"c".repeat(64)}', '${"f".repeat(64)}', '[]', 2, 1000
     );`,
  );
}
