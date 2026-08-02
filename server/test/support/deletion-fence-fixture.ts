import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { DeletionRepository } from "../../src/deletion/repository";
import { FeedbackRepository } from "../../src/feedback/repository";
import { executeSql, SqliteDatabase } from "../d1-sqlite-fixture";

export const JOURNEY_DIGEST = "b".repeat(64);
export const SESSION_DIGEST = "c".repeat(64);
export const DELETE_DIGEST = "d".repeat(64);
export const CAPABILITY_DIGEST = "e".repeat(64);
export const NOW = 1_785_283_200_000;

export async function advanceToObjectDeleted(
  repository: DeletionRepository,
  intent: Awaited<ReturnType<DeletionRepository["prepare"]>>,
): Promise<void> {
  await repository.advance(intent, "fenced");
  await repository.advance(intent, "tombstoned");
  await repository.advance(intent, "object-deleted");
}

export function feedback(database: SqliteDatabase): FeedbackRepository {
  return new FeedbackRepository(database, 1);
}

export function feedbackInput() {
  return {
    capabilityDigest: CAPABILITY_DIGEST,
    consentGranted: true,
    dueAt: NOW,
    expiresAt: NOW + 86_400_000,
    feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
    journeyDigest: JOURNEY_DIGEST,
  } as const;
}

export function preparedJourney() {
  return {
    disclosure: {
      policyVersion: "policy-v1",
      priceBand: "medium" as const,
      representativeCategories: ["coffee"] as [string],
      routeDistanceM: 500,
      routeDurationMinutes: 8,
    },
    identity: { address: "address", name: "name" },
    journeyId: "j_v1.AAAAAAAAAAAAAAAAAAAAAA",
    kind: "ready" as const,
    receipt: {
      poolDigest: "2".repeat(64),
      poolId: "pool:deletion-fence",
      receiptDigest: "3".repeat(64),
      receiptId: "receipt:deletion-fence",
      selectedMemberDigest: "4".repeat(64),
    },
    route: {
      encodedPolyline: "encoded",
      expiresAt: NOW + 3_600_000,
      geometry: [
        [127, 37],
        [127.01, 37.01],
      ] as [number, number][],
      originZoneRef: "zone",
      routeDigest: `route:${"5".repeat(64)}`,
      routeVersion: "route-v1",
    },
  };
}

export function migratedDatabase(
  temporaryPaths: string[],
  includeFence = true,
): Readonly<{ database: SqliteDatabase; path: string }> {
  const root = mkdtempSync(resolve(tmpdir(), "somewhere-deletion-fence-"));
  temporaryPaths.push(root);
  const path = resolve(root, "database.sqlite");
  const migrations = [
    "0001_v2.sql",
    "0002_http_sessions.sql",
    "0003_feedback_deletion.sql",
    "0004_operations_control.sql",
    "0005_operations_epoch_extensions.sql",
    ...(includeFence ? ["0006_journey_deletion_fence.sql"] : []),
  ];
  for (const migration of migrations) {
    executeSql(path, readFileSync(resolve(process.cwd(), "migrations", migration), "utf8"));
  }
  return { database: new SqliteDatabase(path), path };
}
