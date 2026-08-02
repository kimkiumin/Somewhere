import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { findForbiddenDurableColumns } from "../src/db";
import { executeSql, queryJson } from "./d1-sqlite-fixture";

const A_DIGEST = "a".repeat(64);
const B_DIGEST = "b".repeat(64);
const C_DIGEST = "c".repeat(64);

describe("D1 negative durability boundaries", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  function migratedPath(): string {
    const root = mkdtempSync(resolve(tmpdir(), "somewhere-negative-d1-"));
    temporaryPaths.push(root);
    const path = resolve(root, "database.sqlite");
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations/0001_v2.sql"), "utf8"));
    return path;
  }

  it("rejects a duplicate selection receipt", () => {
    // Given: an existing prepared receipt.
    const database = migratedPath();
    executeSql(
      database,
      `INSERT INTO policy_versions VALUES ('policy_0000000000000001','selection',1,'${A_DIGEST}',1,NULL);
       INSERT INTO qualified_pools VALUES ('pool_0000000000000000001','policy_0000000000000001','sealed',1,0,'${B_DIGEST}',2,100);
       INSERT INTO selection_receipts VALUES ('receipt_0000000000000001','pool_0000000000000000001','${A_DIGEST}','${B_DIGEST}','${C_DIGEST}','prepared',NULL,1,3,NULL,100);`,
    );

    // When: the same opaque receipt ID is inserted again.
    const duplicate = () =>
      executeSql(
        database,
        `INSERT INTO selection_receipts VALUES ('receipt_0000000000000001','pool_0000000000000000001','${A_DIGEST}','${B_DIGEST}','${C_DIGEST}','prepared',NULL,1,3,NULL,100);`,
      );

    // Then: SQLite enforces receipt uniqueness.
    expect(duplicate).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects an incompatible zero policy version", () => {
    // Given: the strict V2 policy table.
    const database = migratedPath();

    // When: an incompatible non-positive version is inserted.
    const incompatible = () =>
      executeSql(
        database,
        `INSERT INTO policy_versions VALUES ('policy_0000000000000001','selection',0,'${A_DIGEST}',1,NULL);`,
      );

    // Then: the version check constraint rejects it.
    expect(incompatible).toThrow(/CHECK constraint failed/);
  });

  it("detects a forbidden coordinate column mutation", () => {
    // Given: a migrated schema mutated with a precise coordinate column.
    const database = migratedPath();
    executeSql(database, "ALTER TABLE audit_events ADD COLUMN latitude REAL");

    // When: the schema canary inspects every durable column.
    const rows = queryJson(
      database,
      "SELECT p.name AS column_name FROM sqlite_schema m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'",
    );
    const columnSchema = z.object({ column_name: z.string() });
    const columnNames = rows.map((row) => columnSchema.parse(row).column_name);
    const forbidden = findForbiddenDurableColumns(columnNames);

    // Then: the unsafe mutation is caught.
    expect(forbidden).toEqual(["latitude"]);
  });

  it("detects an unindexed candidate lookup mutation", () => {
    // Given: a migrated schema with its candidate index removed.
    const database = migratedPath();
    executeSql(database, "DROP INDEX idx_evidence_candidate");

    // When: SQLite plans the bounded candidate lookup.
    const plan = execFileSync(
      "sqlite3",
      [
        database,
        "EXPLAIN QUERY PLAN SELECT evidence_id FROM place_evidence WHERE venue_id = 'venue' AND review_state = 'approved' AND evidence_expires_at > 1 ORDER BY evidence_kind, evidence_version DESC LIMIT 100",
      ],
      { encoding: "utf8" },
    );

    // Then: the missing intended index is observable.
    expect(plan).not.toContain("idx_evidence_candidate");
    expect(plan).toContain("SCAN");
  });
});
