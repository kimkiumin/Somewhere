import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceRepository, RepositoryDataError, SelectionRepository } from "../src/db";
import { executeSql, SqliteDatabase } from "./d1-sqlite-fixture";

const A_DIGEST = "a".repeat(64);
const B_DIGEST = "b".repeat(64);
const C_DIGEST = "c".repeat(64);
const D_DIGEST = "d".repeat(64);
const E_DIGEST = "e".repeat(64);

describe("typed D1 repositories", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  function migratedDatabase(): SqliteDatabase {
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-repository-d1-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    return new SqliteDatabase(path);
  }

  it("persists and reads versioned policy, venue, provenance, and evidence records", async () => {
    // Given: a migrated D1 database and valid normalized evidence.
    const repository = new EvidenceRepository(migratedDatabase());
    await repository.insertPolicy({
      policy_id: "policy_0000000000000001",
      policy_kind: "selection",
      version: 1,
      document_digest: A_DIGEST,
      effective_at: 1,
      retired_at: null,
    });
    await repository.insertVenue({
      venue_id: "venue_00000000000000001",
      lifecycle_state: "active",
      record_version: 1,
      record_digest: B_DIGEST,
      rights_expires_at: 100,
      created_at: 1,
    });
    await repository.insertVenueSource({
      source_id: "source_0000000000000001",
      venue_id: "venue_00000000000000001",
      provider_code: "manual",
      provider_reference_digest: C_DIGEST,
      source_version: 1,
      rights_expires_at: 100,
    });

    // When: approved evidence is inserted and queried before expiry.
    const inserted = await repository.insertEvidence({
      evidence_id: "evidence_000000000000001",
      venue_id: "venue_00000000000000001",
      source_id: "source_0000000000000001",
      evidence_kind: "safety",
      normalized_value: "reviewed",
      confidence_basis_points: 9000,
      review_state: "approved",
      evidence_version: 1,
      evidence_digest: D_DIGEST,
      reviewed_at: 2,
      evidence_expires_at: 90,
    });
    const records = await repository.listEligibleEvidence(inserted.venue_id, 10);

    // Then: only the typed normalized record is returned.
    expect(records).toEqual([inserted]);
  });

  it("persists sealed pool membership and append-only selection attempts", async () => {
    // Given: durable policy and venue parents.
    const database = migratedDatabase();
    const evidence = new EvidenceRepository(database);
    const selection = new SelectionRepository(database);
    await evidence.insertPolicy({
      policy_id: "policy_0000000000000001",
      policy_kind: "selection",
      version: 1,
      document_digest: A_DIGEST,
      effective_at: 1,
      retired_at: null,
    });
    await evidence.insertVenue({
      venue_id: "venue_00000000000000001",
      lifecycle_state: "active",
      record_version: 1,
      record_digest: B_DIGEST,
      rights_expires_at: 100,
      created_at: 1,
    });
    await selection.insertPool({
      pool_id: "pool_0000000000000000001",
      policy_id: "policy_0000000000000001",
      pool_state: "sealed",
      pool_version: 1,
      member_count: 1,
      pool_digest: C_DIGEST,
      sealed_at: 2,
      expires_at: 100,
    });
    await selection.insertMember({
      pool_id: "pool_0000000000000000001",
      ordinal: 0,
      venue_id: "venue_00000000000000001",
      evidence_digest: D_DIGEST,
      member_digest: E_DIGEST,
    });
    await selection.insertReceipt({
      receipt_id: "receipt_0000000000000001",
      pool_id: "pool_0000000000000000001",
      policy_digest: A_DIGEST,
      randomness_digest: B_DIGEST,
      constraint_digest: C_DIGEST,
      receipt_state: "prepared",
      selected_member_digest: null,
      receipt_version: 1,
      prepared_at: 3,
      activated_at: null,
      expires_at: 100,
    });

    // When: one pending draw attempt is durably appended.
    const inserted = await selection.insertAttempt({
      receipt_id: "receipt_0000000000000001",
      attempt_number: 1,
      remaining_set_digest: D_DIGEST,
      candidate_member_digest: E_DIGEST,
      validation_result: "pending",
      result_digest: null,
      attempted_at: 4,
    });
    const attempts = await selection.listAttempts(inserted.receipt_id);

    // Then: the immutable attempt can be resumed without another draw.
    expect(attempts).toEqual([inserted]);
  });

  it("rejects unknown boundary fields before constructing a D1 statement", async () => {
    // Given: a repository input containing exact location.
    const repository = new EvidenceRepository(migratedDatabase());
    const unsafePolicy = {
      policy_id: "policy_0000000000000001",
      policy_kind: "selection",
      version: 1,
      document_digest: A_DIGEST,
      effective_at: 1,
      retired_at: null,
      latitude: 37.5,
    };

    // When: the unknown field crosses the repository boundary.
    const insertion = repository.insertPolicy(unsafePolicy);

    // Then: strict parsing rejects it before durable mutation.
    await expect(insertion).rejects.toBeInstanceOf(RepositoryDataError);
  });
});
