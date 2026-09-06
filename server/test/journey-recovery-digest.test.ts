import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { resolvePreviousMemberDigest } from "../src/api/journey-recovery-digest";
import { migratedDatabase } from "./support/deletion-fence-fixture";

const NOW = 1_785_283_200_000;

describe("journey recovery digest compatibility", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("resolves a legacy receipt digest to the selected member digest", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    const poolId = "pool:recovery-digest-0001";
    await fixture.database
      .prepare(
        "INSERT INTO qualified_pools (pool_id, policy_id, pool_state, pool_version, member_count, pool_digest, sealed_at, expires_at) VALUES (?, ?, 'sealed', 1, 1, ?, ?, ?)",
      )
      .bind(poolId, "policy:manual-evidence-v1", "d".repeat(64), NOW, NOW + 60_000)
      .run();
    await fixture.database
      .prepare(
        "INSERT INTO selection_receipts (receipt_id, pool_id, policy_digest, randomness_digest, constraint_digest, receipt_state, selected_member_digest, receipt_version, prepared_at, activated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'prepared', ?, 1, ?, NULL, ?)",
      )
      .bind(
        "receipt:recovery-digest-0001",
        poolId,
        "e".repeat(64),
        "a".repeat(64),
        "f".repeat(64),
        "b".repeat(64),
        NOW,
        NOW + 60_000,
      )
      .run();

    expect(
      await resolvePreviousMemberDigest(fixture.database as unknown as D1Database, "a".repeat(64)),
    ).toBe("b".repeat(64));
    expect(
      await resolvePreviousMemberDigest(fixture.database as unknown as D1Database, "c".repeat(64)),
    ).toBe("c".repeat(64));
  });
});
