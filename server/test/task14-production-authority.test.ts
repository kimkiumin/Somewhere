import { afterEach, describe, expect, it } from "vitest";
import { runOperationsAuthorityCycle } from "../src/operations/production-authority";
import { authorizeBackgroundWork } from "../src/operations/runtime-state-repository";
import { executeSql, queryJson } from "./d1-sqlite-fixture";
import {
  authorityBody,
  bindings,
  cleanupTask14ProductionAuthorityFixtures,
  migratedDatabase,
  NOW,
  seedControl,
  signedFetcher,
} from "./support/task14-production-authority-fixture";

describe("Task 14 production operations authority", () => {
  afterEach(cleanupTask14ProductionAuthorityFixtures);

  it("wires exact meters, verified legal gates, and PostgreSQL receipts into Cron recovery", async () => {
    // Given: a private authority signs a complete release-bound production snapshot.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    executeSql(
      fixture.path,
      `INSERT INTO operations_authority_failures VALUES (
        '${"f".repeat(64)}', 'production', 'expired_fixture',
        ${NOW - 8 * 86_400_000}, ${NOW - 86_400_000}
      )`,
    );
    const firstBody = authorityBody(NOW);
    const first = {
      ...bindings(fixture.database),
      OPERATIONS_AUTHORITY: await signedFetcher(firstBody, NOW, "nonce_v1.first-authority-000001"),
    };

    // When: two distinct authoritative samples arrive at the frozen five-minute spacing.
    const firstAccepted = await runOperationsAuthorityCycle(first, NOW);
    const afterFirst = queryJson(
      fixture.path,
      "SELECT state, fresh_recovery_samples FROM operations_admission_state",
    );
    const producerAfterFirst = await authorizeBackgroundWork(
      fixture.database,
      "production",
      "producer",
    );
    const sameSampleAccepted = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          firstBody,
          NOW + 1,
          "nonce_v1.first-authority-replay01",
        ),
      },
      NOW + 1,
    );
    const afterReplay = queryJson(
      fixture.path,
      "SELECT state, fresh_recovery_samples FROM operations_admission_state",
    );
    const tooSoonAt = NOW + 299_000;
    const tooSoonAccepted = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          authorityBody(tooSoonAt, { commandId: "opauth_v1.too-soon-authority-01" }),
          tooSoonAt,
          "nonce_v1.too-soon-authority-0001",
        ),
      },
      tooSoonAt,
    );
    const afterTooSoon = queryJson(
      fixture.path,
      "SELECT state, fresh_recovery_samples FROM operations_admission_state",
    );
    const secondAt = NOW + 300_000;
    const secondAccepted = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          authorityBody(secondAt, { commandId: "opauth_v1.second-authority-0001" }),
          secondAt,
          "nonce_v1.second-authority-00001",
        ),
      },
      secondAt,
    );

    // Then: production call sites persist all three authorities and only a fresh sample reopens.
    expect(
      firstAccepted,
      JSON.stringify(
        queryJson(fixture.path, "SELECT failure_code FROM operations_authority_failures"),
      ),
    ).toBe(true);
    expect(sameSampleAccepted).toBe(true);
    expect(tooSoonAccepted).toBe(true);
    expect(secondAccepted).toBe(true);
    expect(afterFirst).toEqual([{ fresh_recovery_samples: 1, state: "RECOVERY_VERIFY" }]);
    expect(producerAfterFirst.allowed).toBe(false);
    expect(afterReplay).toEqual([{ fresh_recovery_samples: 1, state: "RECOVERY_VERIFY" }]);
    expect(afterTooSoon).toEqual([{ fresh_recovery_samples: 1, state: "RECOVERY_VERIFY" }]);
    expect(
      queryJson(
        fixture.path,
        "SELECT state, fresh_recovery_samples FROM operations_admission_state",
      ),
    ).toEqual([{ fresh_recovery_samples: 2, state: "OPEN" }]);
    await expect(
      authorizeBackgroundWork(fixture.database, "production", "producer"),
    ).resolves.toMatchObject({ allowed: true, writeEpoch: 4 });
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_meter_windows"),
    ).toEqual([{ count: 15 }]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_release_gates"),
    ).toEqual([{ count: 2 }]);
    expect(queryJson(fixture.path, "SELECT decision FROM operations_postgres_decisions")).toEqual([
      { decision: "STAY_D1" },
    ]);
    expect(
      queryJson(
        fixture.path,
        "SELECT status, COUNT(*) AS count FROM operations_authority_commands GROUP BY status",
      ),
    ).toEqual([{ count: 3, status: "APPLIED" }]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_authority_failures"),
    ).toEqual([{ count: 0 }]);
  });
});
