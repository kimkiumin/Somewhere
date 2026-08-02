import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { executeSql, SqliteDatabase } from "../d1-sqlite-fixture";

export const CAPABILITY_DIGEST = "a".repeat(64);
export const JOURNEY_DIGEST = "b".repeat(64);

export function cleanupTemporaryPaths(temporaryPaths: string[]): void {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
}

export function migratedFeedbackDeletionDatabase(
  temporaryPaths: string[],
  prefix: string,
): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  for (const migration of [
    "migrations/0001_v2.sql",
    "migrations/0003_feedback_deletion.sql",
    "migrations/0006_journey_deletion_fence.sql",
  ]) {
    executeSql(path, readFileSync(resolve(process.cwd(), migration), "utf8"));
  }
  return { database: new SqliteDatabase(path), path };
}
