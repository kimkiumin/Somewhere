import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { completeStoppedGuard } from "../src/api/journey-lifecycle-mutation";
import { SessionRepository } from "../src/db";
import { migratedDatabase } from "./support/deletion-fence-fixture";

const BINDING_DIGEST = "a".repeat(64);
const TARGET_JOURNEY_DIGEST = "b".repeat(64);
const NEWER_JOURNEY_DIGEST = "c".repeat(64);
const ORIGINAL_CANDIDATE_DIGEST = "d".repeat(64);
const NEWER_CANDIDATE_DIGEST = "e".repeat(64);
const NOW = 2_000_000_000_000;

describe("confirm-stop replay guard state", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it.each([
    ["newer active journey", NEWER_JOURNEY_DIGEST, NEWER_CANDIDATE_DIGEST, null],
    ["newer stopped state", null, NEWER_CANDIDATE_DIGEST, NOW + 1],
  ] as const)(
    "preserves a %s",
    async (_, activeJourneyDigest, previousCandidateDigest, lastStoppedAt) => {
      const fixture = migratedDatabase(temporaryPaths);
      const repository = new SessionRepository(fixture.database, 1);
      await repository.putGuard({
        active_journey_digest: activeJourneyDigest,
        create_request_digest: activeJourneyDigest === null ? null : "f".repeat(64),
        expires_at: Date.now() + 86_400_000,
        guard_version: 8,
        last_stopped_at: lastStoppedAt,
        previous_candidate_digest: previousCandidateDigest,
        recovery_capability_digest: null,
        recovery_consumed_at: null,
        session_binding_digest: BINDING_DIGEST,
      });

      const completed = await completeStoppedGuard({
        bindingDigest: BINDING_DIGEST,
        database: fixture.database as unknown as D1Database,
        journeyDigest: TARGET_JOURNEY_DIGEST,
        previousCandidateDigest: ORIGINAL_CANDIDATE_DIGEST,
        stoppedAt: NOW,
      });

      expect(completed).toBe(true);
      expect(await repository.findGuard(BINDING_DIGEST, Date.now())).toMatchObject({
        active_journey_digest: activeJourneyDigest,
        guard_version: 8,
        last_stopped_at: lastStoppedAt,
        previous_candidate_digest: previousCandidateDigest,
      });
    },
  );

  it("fails closed when a deletion fence retains the original active journey", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    const repository = new SessionRepository(fixture.database, 1);
    await repository.putGuard({
      active_journey_digest: TARGET_JOURNEY_DIGEST,
      create_request_digest: "f".repeat(64),
      expires_at: Date.now() + 86_400_000,
      guard_version: 8,
      last_stopped_at: null,
      previous_candidate_digest: null,
      recovery_capability_digest: null,
      recovery_consumed_at: null,
      session_binding_digest: BINDING_DIGEST,
    });
    await fixture.database
      .prepare(
        "INSERT INTO pending_delete_intents (journey_hmac_digest, delete_request_digest, session_binding_digest, audit_event_id, expected_sequence, stage, requested_at, expires_at) VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)",
      )
      .bind(
        TARGET_JOURNEY_DIGEST,
        "f".repeat(64),
        BINDING_DIGEST,
        "audit_confirm_stop_replay_fence",
        NOW,
        NOW + 86_400_000,
      )
      .run();

    const completed = await completeStoppedGuard({
      bindingDigest: BINDING_DIGEST,
      database: fixture.database as unknown as D1Database,
      journeyDigest: TARGET_JOURNEY_DIGEST,
      previousCandidateDigest: ORIGINAL_CANDIDATE_DIGEST,
      stoppedAt: NOW,
    });

    expect(completed).toBe(false);
    expect(await repository.findGuard(BINDING_DIGEST, Date.now())).toMatchObject({
      active_journey_digest: TARGET_JOURNEY_DIGEST,
      guard_version: 8,
    });
  });
});
