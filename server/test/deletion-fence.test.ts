import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { persistPreparation } from "../src/api/journey-persistence";
import { queryJson } from "./d1-sqlite-fixture";
import {
  DELETE_DIGEST,
  JOURNEY_DIGEST,
  migratedDatabase,
  NOW,
  preparedJourney,
  SESSION_DIGEST,
} from "./support/deletion-fence-fixture";

describe("journey deletion fence", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("does not recreate journey bindings when the original create key is retried after deletion", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    await fixture.database
      .prepare(
        "INSERT INTO journey_tombstones (journey_hmac_digest, delete_request_digest, terminal_type, coarse_utc_bucket, write_epoch, replay_status, expires_at, replay_expires_at) VALUES (?, ?, 'deleted', ?, 1, 204, ?, ?)",
      )
      .bind(JOURNEY_DIGEST, DELETE_DIGEST, NOW, NOW + 172_800_000, NOW + 86_400_000)
      .run();

    const persisted = await persistPreparation({
      bindingDigest: SESSION_DIGEST,
      bodyDigest: "1".repeat(64),
      database: fixture.database as unknown as D1Database,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      prepared: preparedJourney(),
    });

    expect(persisted).toBe(false);
    expect(
      queryJson(
        fixture.path,
        "SELECT request_digest FROM budget_reservations WHERE request_digest = '" +
          JOURNEY_DIGEST +
          "'",
      ),
    ).toEqual([]);
    expect(
      queryJson(
        fixture.path,
        "SELECT active_journey_digest FROM browser_session_guards WHERE active_journey_digest = '" +
          JOURNEY_DIGEST +
          "'",
      ),
    ).toEqual([]);
  });
});
