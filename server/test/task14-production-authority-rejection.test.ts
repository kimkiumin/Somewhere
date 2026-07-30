import { afterEach, describe, expect, it } from "vitest";
import { runOperationsAuthorityCycle } from "../src/operations/production-authority";
import { queryJson } from "./d1-sqlite-fixture";
import {
  authorityBody,
  authorityWriteCounts,
  bindings,
  cleanupTask14ProductionAuthorityFixtures,
  fetcher,
  migratedDatabase,
  NOW,
  rejectedCase,
  seedControl,
  signedFetcher,
} from "./support/task14-production-authority-fixture";

describe("Task 14 production operations authority", () => {
  afterEach(cleanupTask14ProductionAuthorityFixtures);

  it("fails closed when the source is absent or its signature is invalid", async () => {
    // Given: a production release starts OPEN but has no configured authority source.
    const fixture = migratedDatabase();
    seedControl(fixture.path);
    const withoutSource = bindings(fixture.database);

    // When: Cron attempts collection without a binding, then with a forged response.
    const absent = await runOperationsAuthorityCycle(withoutSource, NOW);
    const forged = await runOperationsAuthorityCycle(
      {
        ...withoutSource,
        OPERATIONS_AUTHORITY: fetcher(
          authorityBody(NOW),
          NOW,
          "nonce_v1.abcdefghijklmnopqrstuv",
          "0".repeat(64),
        ),
      },
      NOW,
    );

    // Then: both attempts stay fail-closed and no untrusted authority row is admitted.
    expect(absent).toBe(false);
    expect(forged).toBe(false);
    expect(
      queryJson(
        fixture.path,
        "SELECT state, fresh_recovery_samples FROM operations_admission_state",
      ),
    ).toEqual([{ fresh_recovery_samples: 0, state: "METER_BLOCK" }]);
    expect(
      queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_meter_windows"),
    ).toEqual([{ count: 0 }]);
  });

  it("rejects release and epoch spoofing before any authority write", async () => {
    // Given: signed payloads that disagree with the deployed release and current fence epoch.
    const releaseFixture = migratedDatabase();
    seedControl(releaseFixture.path);
    const epochFixture = migratedDatabase();
    seedControl(epochFixture.path);
    const wrongRelease = authorityBody(NOW, {
      releaseDigest: `sha256:${"b".repeat(64)}`,
    });
    const wrongEpoch = authorityBody(NOW, { writeEpoch: 5 });

    // When: each otherwise correctly signed response reaches the production adapter.
    const releaseAccepted = await runOperationsAuthorityCycle(
      {
        ...bindings(releaseFixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          wrongRelease,
          NOW,
          "nonce_v1.release-spoof-000000001",
        ),
      },
      NOW,
    );
    const epochAccepted = await runOperationsAuthorityCycle(
      {
        ...bindings(epochFixture.database),
        OPERATIONS_AUTHORITY: await signedFetcher(
          wrongEpoch,
          NOW,
          "nonce_v1.epoch-spoof-000000001",
        ),
      },
      NOW,
    );

    // Then: neither spoof can populate meters, legal PASS rows, or PostgreSQL receipts.
    expect(releaseAccepted).toBe(false);
    expect(epochAccepted).toBe(false);
    for (const fixture of [releaseFixture, epochFixture]) {
      expect(
        queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_meter_windows"),
      ).toEqual([{ count: 0 }]);
      expect(
        queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_release_gates"),
      ).toEqual([{ count: 0 }]);
      expect(
        queryJson(fixture.path, "SELECT COUNT(*) AS count FROM operations_postgres_decisions"),
      ).toEqual([{ count: 0 }]);
    }
  });

  it("rejects wrong key metadata, stale timestamps, oversized bodies, and unknown fields", async () => {
    // Given: four isolated production databases and release-bound but invalid authority responses.
    const cases = await Promise.all([
      rejectedCase({
        keyId: "operations-authority-wrong-key",
        nonce: "nonce_v1.wrong-key-metadata-0001",
      }),
      rejectedCase({
        nonce: "nonce_v1.stale-timestamp-000001",
        responseTimestamp: NOW - 300_001,
      }),
      rejectedCase({
        body: `${authorityBody(NOW).slice(0, -1)},"padding":"${"x".repeat(66_000)}"}`,
        nonce: "nonce_v1.oversized-response-0001",
      }),
      rejectedCase({
        body: JSON.stringify({ ...JSON.parse(authorityBody(NOW)), unexpected: true }),
        nonce: "nonce_v1.unknown-field-body-0001",
      }),
    ]);

    // When: every response passes through the same production cycle boundary.
    const outcomes = await Promise.all(
      cases.map(({ bindings: candidate, fixture }) =>
        runOperationsAuthorityCycle(candidate, NOW).then((accepted) => ({ accepted, fixture })),
      ),
    );

    // Then: all fail closed before any meter, legal, or PostgreSQL authority is persisted.
    expect(outcomes.map(({ accepted }) => accepted)).toEqual([false, false, false, false]);
    for (const { fixture } of outcomes) {
      expect(authorityWriteCounts(fixture.path)).toEqual({
        gates: 0,
        meters: 0,
        postgres: 0,
      });
    }
  });
});
