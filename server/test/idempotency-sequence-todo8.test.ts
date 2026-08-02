import { describe, expect, it } from "vitest";

import { IdempotencyService, InMemoryReplayRepository } from "../src/security/idempotency";
import { sequenceMatches } from "../src/security/sequence";
import { importHmacKey } from "../src/security/tokens";

const KEY = `ik_v1.${"A".repeat(43)}`;
const INPUT = {
  body: { action: "reveal", contractVersion: 1 },
  contractVersion: 1,
  expectedSequence: "4",
  method: "POST",
  objectId: "j_v1.object",
  routeTemplate: "/journeys/:journeyId/reveal",
} as const;

async function service(): Promise<IdempotencyService> {
  return new IdempotencyService(
    new InMemoryReplayRepository(),
    await importHmacKey(new Uint8Array(32).fill(9)),
  );
}

describe("idempotency and sequence", () => {
  it("FI-IDEMP-01 gives 20 concurrent same-key attempts one exact outcome", async () => {
    // Given: one accepted attempt that has not completed.
    const idempotency = await service();
    const first = await idempotency.lookup(KEY, "session-a", INPUT, 1_000);
    expect(first.kind).toBe("new");

    // When: nineteen duplicates race while the first outcome commits.
    const duplicates = Array.from({ length: 19 }, () =>
      idempotency.lookup(KEY, "session-a", INPUT, 1_000),
    );
    if (first.kind === "new") {
      await first.complete(200, '{"contractVersion":1,"sequence":5}');
    }
    const decisions = await Promise.all(duplicates);

    // Then: every duplicate replays the exact original bytes.
    expect(decisions).toHaveLength(19);
    expect(
      decisions.every(
        (decision) =>
          decision.kind === "replay" && decision.body === '{"contractVersion":1,"sequence":5}',
      ),
    ).toBe(true);
  });

  it("FI-IDEMP-02 replays key-order equivalents and conflicts on semantic changes", async () => {
    // Given: a completed canonical request.
    const idempotency = await service();
    const first = await idempotency.lookup(KEY, "session-a", INPUT, 1_000);
    if (first.kind === "new") {
      await first.complete(200, "original-bytes");
    }

    // When: key order changes, then the accepted action changes.
    const equivalent = await idempotency.lookup(
      KEY,
      "session-a",
      { ...INPUT, body: { contractVersion: 1, action: "reveal" } },
      1_001,
    );
    const changed = await idempotency.lookup(
      KEY,
      "session-a",
      { ...INPUT, body: { contractVersion: 1, action: "stop" } },
      1_001,
    );

    // Then: representation differences replay and semantic differences conflict.
    expect(equivalent).toMatchObject({ body: "original-bytes", kind: "replay", status: 200 });
    expect(changed).toEqual({ kind: "conflict" });
  });

  it("FI-IDEMP-03 replays a committed outcome after service restart", async () => {
    // Given: a completed outcome in the persistence interface.
    const repository = new InMemoryReplayRepository();
    const key = await importHmacKey(new Uint8Array(32).fill(9));
    const beforeRestart = new IdempotencyService(repository, key);
    const first = await beforeRestart.lookup(KEY, "session-a", INPUT, 1_000);
    if (first.kind === "new") {
      await first.complete(201, "committed-before-crash");
    }

    // When: a new service instance receives the retry.
    const afterRestart = new IdempotencyService(repository, key);
    const retried = await afterRestart.lookup(KEY, "session-a", INPUT, 1_001);

    // Then: it replays instead of running a second effect.
    expect(retried).toMatchObject({
      body: "committed-before-crash",
      kind: "replay",
      status: 201,
    });
  });

  it("rejects stale, future, padded, and unsafe expected sequence values", () => {
    // Given: a journey currently at sequence four.
    const current = 4;

    // When: non-exact sequence encodings are checked.
    const results = ["3", "5", "04", " 4", "9007199254740992"].map((value) =>
      sequenceMatches(value, current),
    );

    // Then: every non-exact value fails closed.
    expect(results).toEqual([false, false, false, false, false]);
  });
});
