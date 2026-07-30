import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DeletionRepository } from "../src/deletion/repository";
import { queryJson } from "./d1-sqlite-fixture";
import {
  advanceToObjectDeleted,
  CAPABILITY_DIGEST,
  DELETE_DIGEST,
  feedback,
  feedbackInput,
  JOURNEY_DIGEST,
  migratedDatabase,
  NOW,
  SESSION_DIGEST,
} from "./support/deletion-fence-fixture";

describe("journey deletion fence", () => {
  const temporaryPaths: string[] = [];

  afterEach(() => {
    for (const path of temporaryPaths.splice(0)) {
      rmSync(path, { force: true, recursive: true });
    }
  });

  it("rejects an arrival feedback write that reaches D1 after delete preparation", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    const deletion = new DeletionRepository(fixture.database);
    await deletion.prepare({
      deleteRequestDigest: DELETE_DIGEST,
      expectedSequence: 4,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      sessionBindingDigest: SESSION_DIGEST,
    });

    const issued = await feedback(fixture.database).issue(feedbackInput());

    expect(issued).toBe(false);
    expect(queryJson(fixture.path, "SELECT * FROM feedback_eligibility")).toEqual([]);
  });

  it("atomically cleans a feedback write that wins before delete preparation", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    const feedbackRepository = feedback(fixture.database);
    expect(await feedbackRepository.issue(feedbackInput())).toBe(true);
    const deletion = new DeletionRepository(fixture.database);
    const intent = await deletion.prepare({
      deleteRequestDigest: DELETE_DIGEST,
      expectedSequence: 4,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      sessionBindingDigest: SESSION_DIGEST,
    });

    await advanceToObjectDeleted(deletion, intent);
    await deletion.cleanupBindings(intent);

    expect(queryJson(fixture.path, "SELECT * FROM feedback_eligibility")).toEqual([]);
  });

  it("prevents feedback consumption from racing the deletion cleanup batch", async () => {
    const fixture = migratedDatabase(temporaryPaths);
    const feedbackRepository = feedback(fixture.database);
    await feedbackRepository.issue(feedbackInput());
    const deletion = new DeletionRepository(fixture.database);
    const intent = await deletion.prepare({
      deleteRequestDigest: DELETE_DIGEST,
      expectedSequence: 4,
      journeyDigest: JOURNEY_DIGEST,
      now: NOW,
      sessionBindingDigest: SESSION_DIGEST,
    });

    await advanceToObjectDeleted(deletion, intent);
    const consumed = await feedbackRepository.consume({
      capabilityDigest: CAPABILITY_DIGEST,
      feedbackId: "fid_v1.AAAAAAAAAAAAAAAAAAAAAA",
      idempotencyDigest: "1".repeat(64),
      now: NOW + 1,
      reaction: "love",
    });
    await deletion.cleanupBindings(intent);

    expect(consumed).toEqual({ kind: "capability_invalid" });
    expect(queryJson(fixture.path, "SELECT * FROM place_reactions")).toEqual([]);
    expect(queryJson(fixture.path, "SELECT * FROM feedback_reaction_outcomes")).toEqual([]);
  });
});
