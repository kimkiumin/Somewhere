import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeSql, queryJson } from "./d1-sqlite-fixture";

describe("D1 durable schema", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("exists as the forward-only V2 migration", () => {
    // Given: the server package root.
    const migration = resolve(process.cwd(), "migrations/0001_v2.sql");

    // When: the durable schema is inspected.
    const exists = existsSync(migration);

    // Then: the first forward-only migration is present.
    expect(exists).toBe(true);
  });

  it.each(["empty", "prior"] as const)("applies from a %s schema", (startingSchema) => {
    // Given: an empty or prior-version SQLite database.
    const root = mkdtempSync(resolve(tmpdir(), `somewhere-d1-${startingSchema}-`));
    temporaryPaths.push(root);
    const database = resolve(root, "database.sqlite");
    if (startingSchema === "prior") {
      executeSql(
        database,
        readFileSync(resolve(process.cwd(), "test/fixtures/d1-prior-schema.sql"), "utf8"),
      );
    }

    // When: the V2 forward migration is applied.
    executeSql(database, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));

    // Then: the complete durable table set exists.
    const tables = queryJson(
      database,
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    );
    expect(tables).toContainEqual({ name: "journey_tombstones" });
    expect(tables).toContainEqual({ name: "selection_receipts" });
    expect(tables).toContainEqual({ name: "browser_session_guards" });
    if (startingSchema === "prior") {
      expect(tables).toContainEqual({ name: "v1_migration_marker" });
    }
  });

  it("uses the candidate and session indexes for bounded lookups", () => {
    // Given: the migrated V2 schema.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-d1-plan-"));
    temporaryPaths.push(root);
    const database = resolve(root, "database.sqlite");
    executeSql(database, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));

    // When: the repository lookup plans are explained.
    const candidatePlan = executeSql(
      database,
      "EXPLAIN QUERY PLAN SELECT evidence_id FROM place_evidence WHERE venue_id = 'venue' AND review_state = 'approved' AND evidence_expires_at > 1 ORDER BY evidence_kind, evidence_version DESC LIMIT 100",
    );
    const sessionPlan = executeSql(
      database,
      "EXPLAIN QUERY PLAN SELECT session_binding_digest FROM browser_session_guards WHERE active_journey_digest = 'digest' AND expires_at > 1 LIMIT 1",
    );

    // Then: SQLite selects the intended bounded indexes.
    expect(candidatePlan).toContain("idx_evidence_candidate");
    expect(sessionPlan).toContain("idx_session_guard_active");
  });

  it("contains no durable exact-location, route, raw trace, or raw binding column", () => {
    // Given: every application table in the V2 schema.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-d1-boundary-"));
    temporaryPaths.push(root);
    const database = resolve(root, "database.sqlite");
    executeSql(database, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    const columns = queryJson(
      database,
      "SELECT m.name AS table_name, p.name AS column_name FROM sqlite_schema m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'",
    );

    // When: durable column names are checked against forbidden data classes.
    const forbidden = columns.filter((row) => {
      const serialized = JSON.stringify(row).toLowerCase();
      return /(latitude|longitude|coordinate|polyline|geometry|raw_trace|raw_binding|origin_)/.test(
        serialized,
      );
    });

    // Then: the canary scan finds no forbidden durable field.
    expect(forbidden).toEqual([]);
  });

  it("restores an export with the same allowed-record digest", () => {
    // Given: a migrated database with one policy record.
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-d1-restore-"));
    temporaryPaths.push(root);
    const source = resolve(root, "source.sqlite");
    const restored = resolve(root, "restored.sqlite");
    const exportPath = resolve(root, "portable.sql");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8");
    executeSql(source, migration);
    executeSql(
      source,
      "INSERT INTO policy_versions VALUES ('policy_0000000000000001','selection',1,lower(hex(randomblob(32))),1,NULL)",
    );
    const sourceRows = queryJson(source, "SELECT * FROM policy_versions ORDER BY policy_id");
    const sourceDigest = createHash("sha256").update(JSON.stringify(sourceRows)).digest("hex");

    // When: the portable export is restored into a fresh local database.
    const portable = execFileSync("sqlite3", [source, ".dump"], { encoding: "utf8" });
    writeFileSync(exportPath, portable);
    executeSql(restored, readFileSync(exportPath, "utf8"));
    const restoredRows = queryJson(restored, "SELECT * FROM policy_versions ORDER BY policy_id");
    const restoredDigest = createHash("sha256").update(JSON.stringify(restoredRows)).digest("hex");

    // Then: allowed durable records have an identical digest.
    expect(restoredDigest).toBe(sourceDigest);
  });
});
