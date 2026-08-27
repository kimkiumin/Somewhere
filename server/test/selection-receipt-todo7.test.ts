import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { digestMember, digestMembers, type SealedPool } from "../src/provider/pool";
import { drawUnbiasedIndex, projectPreReveal, selectDestination } from "../src/provider/selection";

const POOL: SealedPool = Object.freeze({
  schemaVersion: 1,
  poolId: "pool:test",
  sealedAt: "2026-07-29T00:00:00.000Z",
  orderedMemberDigest: `sha256:${"a".repeat(64)}`,
  providerId: "provider:test",
  providerCapabilityVersion: "capability:test",
  providerQueryVersion: "query:test",
  providerPaginationVersion: "pagination:test",
  providerCoverageVersion: "coverage:test",
  canonicalizationVersion: "canonicalization:test",
  ruleVersion: "manual-hard-filter-v1",
  evidencePolicyVersion: "manual-evidence-v1",
  disclosureVersion: "broad-menu-v1",
  modelVersion: "disabled",
  promptVersion: "disabled",
  members: Object.freeze([
    Object.freeze({
      canonicalId: "canonical:a",
      candidateId: "candidate:a",
      snapshotVersion: "snapshot:a",
      category: "restaurant",
      priceBand: 1,
      broadMenuCategory: "Korean food",
    }),
    Object.freeze({
      canonicalId: "canonical:b",
      candidateId: "candidate:b",
      snapshotVersion: "snapshot:b",
      category: "cafe",
      priceBand: 2,
      broadMenuCategory: "Coffee",
    }),
    Object.freeze({
      canonicalId: "canonical:c",
      candidateId: "candidate:c",
      snapshotVersion: "snapshot:c",
      category: "cafe",
      priceBand: 3,
      broadMenuCategory: "Tea",
    }),
  ]),
});

describe("Todo7 unbiased selection receipt", () => {
  const remainingMembers = Object.freeze(POOL.members.slice(0, 2));
  const recoveryPool: SealedPool = Object.freeze({
    ...POOL,
    members: remainingMembers,
    orderedMemberDigest: digestMembers(remainingMembers),
  });

  it("records rejected random values before accepting an unbiased index", () => {
    // Given: a three-member set and injected values at then below the rejection limit
    const values = [4_294_967_295, 4];
    let cursor = 0;

    // When: an index is drawn with uint32 rejection sampling
    const draw = drawUnbiasedIndex(3, () => values[cursor++] ?? 0);

    // Then: the biased tail is rejected and every raw attempt is retained
    expect(draw.index).toBe(1);
    expect(draw.rawAttempts).toEqual([4_294_967_295, 4]);
    expect(Object.isFrozen(draw.rawAttempts)).toBe(true);
  });

  it("selects each candidate equally across a deterministic complete residue set", () => {
    // Given: 300 sequential accepted uint32 values
    const counts = [0, 0, 0];

    // When: each value is mapped through the production rejection sampler
    for (let value = 0; value < 300; value += 1) {
      const draw = drawUnbiasedIndex(3, () => value);
      counts[draw.index] = (counts[draw.index] ?? 0) + 1;
    }

    // Then: every candidate receives exactly one third of the draws
    expect(counts).toEqual([100, 100, 100]);
  });

  it("excludes the previous destination and records final revalidation attempts", async () => {
    // Given: a recovery pool sealed after the prior destination was excluded
    const randomValues = [0, 0];
    let cursor = 0;

    // When: selection revalidates candidates from the already-filtered pool
    const result = await selectDestination({
      requestId: "request:test",
      pool: recoveryPool,
      randomUint32: () => randomValues[cursor++] ?? 0,
      revalidate: async (member) =>
        member.candidateId === "candidate:a"
          ? { verdict: "reject", code: "FINAL_EVIDENCE_EXPIRED" }
          : { verdict: "pass" },
    });

    // Then: selection never sees the prior candidate and preserves both attempts
    expect(result.kind).toBe("selected");
    if (result.kind !== "selected") {
      throw new TypeError("expected selected result");
    }
    expect(result.member.candidateId).toBe("candidate:b");
    expect(result.receipt.attempts.map((attempt) => attempt.validation)).toEqual([
      "FINAL_EVIDENCE_EXPIRED",
      "PASS",
    ]);
    expect(result.receipt.attempts.some((attempt) => attempt.candidateId === "candidate:c")).toBe(
      false,
    );
    expect(result.receipt).toEqual(
      expect.objectContaining({
        qualifiedPoolSize: 2,
        providerId: "provider:test",
        providerQueryVersion: "query:test",
        providerPaginationVersion: "pagination:test",
        providerCoverageVersion: "coverage:test",
        canonicalizationVersion: "canonicalization:test",
        evidencePolicyVersion: "manual-evidence-v1",
      }),
    );
    expect(Object.isFrozen(result.receipt.attempts)).toBe(true);
  });

  it("uses the canonical member identity tuple for digesting", () => {
    const member = POOL.members[0];
    if (member === undefined) {
      throw new TypeError("fixture member is missing");
    }
    const expected = createHash("sha256")
      .update("canonical:a\0candidate:a\0snapshot:a", "utf8")
      .digest("hex");
    expect(digestMember(member)).toBe(`sha256:${expected}`);
  });

  it("projects only non-identifying pre-Reveal fields", async () => {
    // Given: a successful hidden destination selection
    const result = await selectDestination({
      requestId: "request:projection",
      pool: POOL,
      randomUint32: () => 0,
      revalidate: async () => ({ verdict: "pass" }),
    });
    if (result.kind !== "selected") {
      throw new TypeError("expected selected result");
    }

    // When: the server creates the pre-Reveal projection
    const projection = projectPreReveal(result.member, 650, 540);

    // Then: identity, pool, receipt, coordinates, and direct bearing are absent
    expect(projection).toEqual({
      category: "restaurant",
      priceBand: 1,
      broadMenuCategory: "Korean food",
      routeDistanceM: 650,
      routeDurationSeconds: 540,
    });
  });
});
