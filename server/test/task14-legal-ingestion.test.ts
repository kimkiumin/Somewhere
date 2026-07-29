import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KoreaReviewRecordV1Schema,
  ProviderRightsRecordV1Schema,
} from "../../contracts/src/provider";
import {
  contentDigest,
  VerifiedLegalGateRepository,
} from "../src/operations/legal-gate-repository";
import { executeSql, queryJson, SqliteDatabase } from "./d1-sqlite-fixture";

const RELEASE = `sha256:${"a".repeat(64)}`;
const temporaryPaths: string[] = [];

describe("Task 14 verified legal gate ingestion", () => {
  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("persists PASS only from release-matched, content-addressed artifacts", async () => {
    // Given: valid provider and Korea artifacts bound to the active production release.
    const fixture = migratedDatabase();
    const artifacts = legalArtifacts();
    const providerContent = JSON.stringify(artifacts.provider);
    const koreaContent = JSON.stringify(artifacts.korea);
    const repository = new VerifiedLegalGateRepository(fixture.database);
    const context = {
      adapterVersion: "adapter-v2",
      dataFlowDigest: artifacts.korea.reviewedDataFlowDigest,
      endpointOrigins: ["https://pilot.provider.example"] as const,
      environment: "production" as const,
      nowIso: "2026-07-29T12:00:00Z",
      providerId: "pilot-provider",
      releaseDigest: RELEASE,
      representedConditionGates: [],
      retentionPolicyDigest: artifacts.korea.reviewedRetentionPolicyDigest,
    };

    // When: a tampered digest is rejected before the same exact bytes are verified.
    const tampered = await repository.ingest({
      context,
      korea: { content: koreaContent, expectedContentDigest: await contentDigest(koreaContent) },
      provider: {
        content: providerContent,
        expectedContentDigest: `sha256:${"f".repeat(64)}`,
      },
    });
    const before = queryJson(fixture.path, "SELECT * FROM operations_release_gates");
    expect(() =>
      executeSql(
        fixture.path,
        `INSERT INTO operations_release_gates VALUES (
          'production', 'provider-rights', '${"a".repeat(64)}', 'PASS',
          '${"a".repeat(64)}', '${"f".repeat(64)}', '[]', 1, 2000000
        )`,
      ),
    ).toThrow(/unverified legal PASS/u);
    executeSql(
      fixture.path,
      `INSERT INTO operations_release_gates VALUES (
        'production', 'provider-rights', '${"e".repeat(64)}', 'BLOCK',
        '${"a".repeat(64)}', '${"d".repeat(64)}', '["manual-block"]', 1, 2000000
      )`,
    );
    expect(() =>
      executeSql(
        fixture.path,
        `UPDATE operations_release_gates
         SET verdict = 'PASS'
         WHERE environment = 'production' AND gate_kind = 'provider-rights'`,
      ),
    ).toThrow(/unverified legal PASS/u);
    executeSql(fixture.path, "DELETE FROM operations_release_gates WHERE verdict = 'BLOCK'");
    const verified = await repository.ingest({
      context,
      korea: { content: koreaContent, expectedContentDigest: await contentDigest(koreaContent) },
      provider: {
        content: providerContent,
        expectedContentDigest: await contentDigest(providerContent),
      },
    });

    // Then: the mismatch writes nothing and verified ingestion creates both release-bound gates.
    expect(tampered).toMatchObject({
      failedRuleIds: expect.arrayContaining(["provider.content-digest"]),
      verdict: "BLOCK",
    });
    expect(before).toEqual([]);
    expect(verified).toEqual({ failedRuleIds: [], verdict: "PASS" });
    expect(
      queryJson(
        fixture.path,
        `SELECT gate_kind, reviewed_release_digest, verdict
         FROM operations_release_gates ORDER BY gate_kind`,
      ),
    ).toEqual([
      {
        gate_kind: "korea-review",
        reviewed_release_digest: "a".repeat(64),
        verdict: "PASS",
      },
      {
        gate_kind: "provider-rights",
        reviewed_release_digest: "a".repeat(64),
        verdict: "PASS",
      },
    ]);
  });
});

function migratedDatabase(): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-task14-legal-"));
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
    `INSERT INTO operations_admission_state VALUES (
      'production', 'BOOT_BLOCKED', 4, '${"a".repeat(64)}', 1, 1, 0, 0, 1
    )`,
  );
  return { database: new SqliteDatabase(path), path };
}

function legalArtifacts() {
  const providerPlaceholder = ProviderRightsRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), "../legal/L01-provider-rights.json"), "utf8")),
  );
  const koreaPlaceholder = KoreaReviewRecordV1Schema.parse(
    JSON.parse(readFileSync(resolve(process.cwd(), "../legal/L05-korea-review.json"), "utf8")),
  );
  return {
    korea: {
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
    },
    provider: {
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
    },
  };
}
