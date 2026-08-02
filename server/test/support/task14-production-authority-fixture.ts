import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../../contracts/src/provider";
import { METER_POLICIES } from "../../src/admission/meter";
import {
  authorityResponseSignature,
  type OperationsAuthorityBindings,
} from "../../src/operations/production-authority";
import { executeSql, queryJson, SqliteDatabase } from "../d1-sqlite-fixture";

export const NOW = Date.parse("2026-07-29T12:00:00Z");
export const RELEASE = `sha256:${"a".repeat(64)}`;
const KEY_ID = "operations-authority-2026-07";
const HMAC_KEY = "test-only-authority-key-with-at-least-32-bytes";
const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryPaths: string[] = [];
type AuthorityFixture = Readonly<{ database: SqliteDatabase; path: string }>;

export function cleanupTask14ProductionAuthorityFixtures(): void {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
}

export function migratedDatabase(): AuthorityFixture {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-authority-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
    "0005_operations_epoch_extensions.sql",
    "0006_journey_deletion_fence.sql",
  ]) {
    executeSql(path, readFileSync(resolve(SERVER_ROOT, "migrations", migration), "utf8"));
  }
  return { database: new SqliteDatabase(path), path };
}

export function seedControl(path: string): void {
  const envelopes = METER_POLICIES.filter(
    (policy) => policy.blocksAdmission && policy.kind !== "cpu" && policy.kind !== "retention",
  )
    .map(
      (policy) =>
        `('${RELEASE.slice(7)}', '${policy.id}', 1, ${policy.closeAt}, ${policy.freshnessMs}, ${
          policy.resetConfirmationRequired ? 1 : 0
        }, '${"b".repeat(64)}', ${NOW - 1}, ${NOW + 86_400_000})`,
    )
    .join(",\n");
  executeSql(
    path,
    `INSERT INTO operations_write_fence VALUES (
       'production', 4, 'OPEN', 'authority-test', '${RELEASE.slice(7)}', ${NOW - 1}, NULL
     );
     INSERT INTO operations_admission_state VALUES (
       'production', 'METER_BLOCK', 4, '${RELEASE.slice(7)}', 1, 1, 0, 0, ${NOW - 1}
     );
     INSERT INTO operations_journey_envelopes VALUES ${envelopes};`,
  );
}

export function bindings(database: SqliteDatabase): OperationsAuthorityBindings {
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

export async function rejectedCase(
  override: Readonly<{ body?: string; keyId?: string; nonce: string; responseTimestamp?: number }>,
): Promise<Readonly<{ bindings: OperationsAuthorityBindings; fixture: AuthorityFixture }>> {
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

export function authorityWriteCounts(
  path: string,
): Readonly<{ gates: number; meters: number; postgres: number }> {
  return queryJson(
    path,
    `SELECT
       (SELECT COUNT(*) FROM operations_release_gates) AS gates,
       (SELECT COUNT(*) FROM operations_meter_windows) AS meters,
       (SELECT COUNT(*) FROM operations_postgres_decisions) AS postgres`,
  )[0] as { gates: number; meters: number; postgres: number };
}

export function fetcher(
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

export async function signedFetcher(
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

export function authorityBody(
  capturedAt: number,
  override: Readonly<{ commandId?: string; releaseDigest?: string; writeEpoch?: number }> = {},
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
    korea: { content: koreaContent, contentDigest: artifacts.koreaDigest },
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
    provider: { content: providerContent, contentDigest: artifacts.providerDigest },
    releaseDigest: override.releaseDigest ?? RELEASE,
    schemaVersion: 1,
    writeEpoch: override.writeEpoch ?? 4,
  });
}

function legalArtifacts() {
  const providerPlaceholder = ProviderRightsRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(SERVER_ROOT, "../legal/L01-provider-rights.json"), "utf8")),
  );
  const koreaPlaceholder = KoreaReviewRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(SERVER_ROOT, "../legal/L05-korea-review.json"), "utf8")),
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
