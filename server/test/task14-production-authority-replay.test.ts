import { afterEach, describe, expect, it } from "vitest";
import { runOperationsAuthorityCycle } from "../src/operations/production-authority";
import { executeSql, queryJson } from "./d1-sqlite-fixture";
import {
  authorityBody,
  authorityWriteCounts,
  bindings,
  cleanupTask14ProductionAuthorityFixtures,
  migratedDatabase,
  NOW,
  seedControl,
  signedFetcher,
} from "./support/task14-production-authority-fixture";

describe("Task 14 production operations authority", () => {
  afterEach(cleanupTask14ProductionAuthorityFixtures);

  it("separates transport nonce replay from semantic idempotency and concurrent replay", async () => {
    // Given: one valid command is applied once under a fresh transport nonce.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    const body = authorityBody(NOW);
    const nonce = "nonce_v1.semantic-replay-first01";
    const first = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(body, NOW, nonce),
      },
      NOW,
    );

    // When: the nonce is reused, the command body conflicts, then an exact command races twice.
    const nonceReplay = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(body, NOW, nonce),
      },
      NOW,
    );
    executeSql(
      fixture.path,
      "UPDATE operations_admission_state SET state = 'RECOVERY_VERIFY' WHERE environment = 'production'",
    );
    const conflictingBody = authorityBody(NOW + 1);
    const bodyConflict = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          conflictingBody,
          NOW + 1,
          "nonce_v1.semantic-body-conflict01",
        ),
      },
      NOW + 1,
    );
    executeSql(
      fixture.path,
      "UPDATE operations_admission_state SET state = 'RECOVERY_VERIFY' WHERE environment = 'production'",
    );
    const replayResults = await Promise.all([
      runOperationsAuthorityCycle(
        {
          ...bindings(fixture.database),
          OPERATIONS_AUTHORITY: await signedFetcher(
            body,
            NOW + 2,
            "nonce_v1.concurrent-replay-left01",
          ),
        },
        NOW + 2,
      ),
      runOperationsAuthorityCycle(
        {
          ...bindings(fixture.database),
          OPERATIONS_AUTHORITY: await signedFetcher(
            body,
            NOW + 2,
            "nonce_v1.concurrent-replay-right1",
          ),
        },
        NOW + 2,
      ),
    ]);

    // Then: nonce/body conflicts block, while exact semantic replays are idempotent and write once.
    expect(first).toBe(true);
    expect(nonceReplay).toBe(false);
    expect(bodyConflict).toBe(false);
    expect(replayResults).toEqual([true, true]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_authority_commands"),
    ).toEqual([{ count: 1 }]);
    expect(authorityWriteCounts(fixture.path)).toEqual({
      gates: 2,
      meters: 15,
      postgres: 1,
    });
  });

  it("rolls back legal and meter writes when the final receipt statement fails", async () => {
    // Given: the database fails the final PostgreSQL receipt inside the authority D1 batch.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    executeSql(
      fixture.path,
      `CREATE TRIGGER task14_force_postgres_failure
       BEFORE INSERT ON operations_postgres_decisions
       BEGIN
         SELECT RAISE(ABORT, 'forced receipt failure');
       END;`,
    );

    // When: a fully authenticated exact-meter command reaches the atomic persistence boundary.
    const accepted = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          authorityBody(NOW),
          NOW,
          "nonce_v1.atomic-rollback-command1",
        ),
      },
      NOW,
    );

    // Then: the command fails and neither trigger-created legal PASS nor meters survive the batch.
    expect(accepted).toBe(false);
    expect(authorityWriteCounts(fixture.path)).toEqual({
      gates: 0,
      meters: 0,
      postgres: 0,
    });
    expect(queryJson(fixture.path, "SELECT status FROM operations_authority_commands")).toEqual([
      { status: "FAILED" },
    ]);
  });

  it("rejects a duplicate exact-meter registry without partial authority writes", async () => {
    // Given: a signed payload has 15 entries but duplicates one frozen meter ID.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    const candidate = JSON.parse(authorityBody(NOW)) as {
      meters: Record<string, unknown>[];
    };
    candidate.meters[1] = { ...candidate.meters[0] };
    const body = JSON.stringify(candidate);

    // When: the malformed registry reaches runtime validation and the atomic apply boundary.
    const accepted = await runOperationsAuthorityCycle(
      {
        ...bindings(fixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(body, NOW, "nonce_v1.duplicate-meter-body01"),
      },
      NOW,
    );

    // Then: the registry fails closed and leaves every authority projection empty.
    expect(accepted).toBe(false);
    expect(authorityWriteCounts(fixture.path)).toEqual({
      gates: 0,
      meters: 0,
      postgres: 0,
    });
  });
});
