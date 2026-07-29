import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../contracts/src/provider";
import { METER_POLICIES } from "../src/admission/meter";
import {
  authorityResponseSignature,
  type OperationsAuthorityBindings,
  runOperationsAuthorityCycle,
} from "../src/operations/production-authority";
import { authorizeBackgroundWork } from "../src/operations/runtime-state-repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const NOW = Date.parse("2026-07-29T12:00:00Z");
const RELEASE = `sha256:${"a".repeat(64)}`;
const RAW_RELEASE = RELEASE.slice(7);
const KEY_ID = "operations-authority-2026-07";
const HMAC_KEY = "test-only-authority-key-with-at-least-32-bytes";
const temporaryPaths: string[] = [];

describe("Task 14 production operations authority", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

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

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-authority-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
    "0005_operations_epoch_extensions.sql",
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
        `('${RAW_RELEASE}', '${policy.id}', 1, ${policy.closeAt}, ${policy.freshnessMs}, ${
          policy.resetConfirmationRequired ? 1 : 0
        }, '${"b".repeat(64)}', ${NOW - 1}, ${NOW + 86_400_000})`,
    )
    .join(",\n");
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
       'production', 4, 'OPEN', 'authority-test', '${RAW_RELEASE}', ${NOW - 1}, NULL
     );
     INSERT INTO operations_admission_state VALUES (
       'production', 'METER_BLOCK', 4, '${RAW_RELEASE}', 1, 1, 0, 0, ${NOW - 1}
     );
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};`,
  );
}

function bindings(database: SqliteDatabase): OperationsAuthorityBindings {
  return {
    DB: database,
    ENVIRONMENT: "production",
    OPERATIONS_AUTHORITY_HMAC_KEY: HMAC_KEY,
    OPERATIONS_AUTHORITY_KEY_ID: KEY_ID,
    OPERATIONS_DATA_FLOW_DIGEST: `sha256:${"b".repeat(64)}`,
    OPERATIONS_PROVIDER_ADAPTER_VERSION: "adapter-v2",
    OPERATIONS_PROVIDER_ID: "pilot-provider",
    OPERATIONS_PROVIDER_ORIGINS: '["https://pilot.provider.example"]',
    OPERATIONS_RELEASE_DIGEST: RELEASE,
    OPERATIONS_REPRESENTED_CONDITION_GATES: "[]",
    OPERATIONS_RETENTION_POLICY_DIGEST: `sha256:${"c".repeat(64)}`,
    OPERATIONS_REVIEWER_DIGEST: `sha256:${"e".repeat(64)}`,
  };
}

async function rejectedCase(
  override: Readonly<{
    body?: string;
    keyId?: string;
    nonce: string;
    responseTimestamp?: number;
  }>,
): Promise<
  Readonly<{
    bindings: OperationsAuthorityBindings;
    fixture: Readonly<{ database: SqliteDatabase; path: string }>;
  }>
> {
  const fixture = migratedDatabase();
  seedControl(fixture.path);
  const body = override.body ?? authorityBody(NOW);
  const responseTimestamp = override.responseTimestamp ?? NOW;
  return {
    bindings: {
      ...bindings(fixture.database),
      OPERATIONS_AUTHORITY: await signedFetcher(body, responseTimestamp, override.nonce, {
        ...(override.keyId === undefined ? {} : { keyId: override.keyId }),
      }),
    },
    fixture,
  };
}

function authorityWriteCounts(path: string): Readonly<{
  gates: number;
  meters: number;
  postgres: number;
}> {
  const rows = queryJson(
    path,
    `SELECT
       (SELECT COUNT(*) FROM operations_release_gates) AS gates,
       (SELECT COUNT(*) FROM operations_meter_windows) AS meters,
       (SELECT COUNT(*) FROM operations_postgres_decisions) AS postgres`,
  );
  return rows[0] as { gates: number; meters: number; postgres: number };
}

function fetcher(
  body: string,
  timestamp: number,
  nonce: string,
  signature: string,
  keyId = KEY_ID,
): Pick<Fetcher, "fetch"> {
  return {
    fetch: async () =>
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "x-somewhere-authority-key-id": keyId,
          "x-somewhere-authority-nonce": nonce,
          "x-somewhere-authority-signature": `v1=${signature}`,
          "x-somewhere-authority-timestamp": String(timestamp),
        },
      }),
  };
}

async function signedFetcher(
  body: string,
  timestamp: number,
  nonce: string,
  override: Readonly<{ hmacKey?: string; keyId?: string }> = {},
): Promise<Pick<Fetcher, "fetch">> {
  const hmacKey = override.hmacKey ?? HMAC_KEY;
  const keyId = override.keyId ?? KEY_ID;
  return fetcher(
    body,
    timestamp,
    nonce,
    await authorityResponseSignature({
      body,
      environment: "production",
      hmacKey,
      keyId,
      nonce,
      releaseDigest: RELEASE,
      timestamp,
      writeEpoch: 4,
    }),
    keyId,
  );
}

function authorityBody(
  capturedAt: number,
  override: Readonly<{
    commandId?: string;
    releaseDigest?: string;
    writeEpoch?: number;
  }> = {},
): string {
  const windowStartUtc = Math.floor(capturedAt / 86_400_000) * 86_400_000;
  const windowEndUtc = windowStartUtc + 86_400_000;
  const artifacts = legalArtifacts();
  const providerContent = JSON.stringify(artifacts.provider);
  const koreaContent = JSON.stringify(artifacts.korea);
  return JSON.stringify({
    capturedAt,
    commandId: override.commandId ?? "opauth_v1.first-authority-0001",
    environment: "production",
    korea: {
      content: koreaContent,
      contentDigest: artifacts.koreaDigest,
    },
    meters: METER_POLICIES.map((policy) => ({
      expiresAt: windowEndUtc + 2 * 86_400_000,
      immediateObserved: Math.floor(policy.cap * 0.1),
      immediateObservedAt: capturedAt,
      meterId: policy.id,
      platformObserved: Math.floor(policy.cap * 0.1),
      platformObservedAt: capturedAt,
      resetConfirmed: true,
      unrelatedBaseline: 0,
      uncertaintyReserve: 0,
      windowEndUtc,
      windowStartUtc,
    })),
    postgresFacts: {
      crossDomainJoinsOperationallyCentral: false,
      d1StorageFraction: 0.2,
      multiRegionControlRequired: false,
      recoveryObjectiveHours: 24,
      serializableCrossAggregateInvariantRequired: false,
      sustainedWriteContentionP95Ms: 8,
      writeContentionObjectiveMs: 20,
    },
    provider: {
      content: providerContent,
      contentDigest: artifacts.providerDigest,
    },
    releaseDigest: override.releaseDigest ?? RELEASE,
    schemaVersion: 1,
    writeEpoch: override.writeEpoch ?? 4,
  });
}

function legalArtifacts() {
  const providerPlaceholder = ProviderRightsRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), "../legal/L01-provider-rights.json"), "utf8")),
  );
  const koreaPlaceholder = KoreaReviewRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), "../legal/L05-korea-review.json"), "utf8")),
  );
  const korea = {
    ...koreaPlaceholder,
    classification: {
      ...koreaPlaceholder.classification,
      locationBasedServiceBusiness: "DOES_NOT_APPLY" as const,
      locationInformationBusiness: "DOES_NOT_APPLY" as const,
      registrationOrReportingRequired: "NOT_REQUIRED" as const,
    },
    conditions: [],
    decision: "PASS" as const,
    expiresAt: "2026-08-29T00:00:00Z",
    openFindings: [],
    reviewedAt: "2026-07-28T00:00:00Z",
  };
  const provider = {
    ...providerPlaceholder,
    adapterVersion: "adapter-v2",
    credential: {
      ...providerPlaceholder.credential,
      expiresAt: "2026-08-29T00:00:00Z",
      rotatedAt: "2026-07-28T00:00:00Z",
    },
    dataFlow: {
      ...providerPlaceholder.dataFlow,
      endpointOrigins: ["https://pilot.provider.example"],
    },
    decision: "PASS" as const,
    evidence: { ...providerPlaceholder.evidence, signedAt: "2026-07-28T00:00:00Z" },
    providerId: "pilot-provider",
    quota: { ...providerPlaceholder.quota, checkedAt: "2026-07-28T00:00:00Z" },
    terms: {
      ...providerPlaceholder.terms,
      expiresAt: "2026-08-29T00:00:00Z",
      reviewedAt: "2026-07-28T00:00:00Z",
    },
  };
  return {
    korea,
    koreaDigest: digestForFixture(JSON.stringify(korea)),
    provider,
    providerDigest: digestForFixture(JSON.stringify(provider)),
  };
}

function digestForFixture(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
