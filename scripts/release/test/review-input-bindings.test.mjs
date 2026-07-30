import { describe, expect, test } from "bun:test";
import { assertReviewInputBindings } from "../lib/review-input-bindings.mjs";

const digest = (value) => `sha256:${value.repeat(64)}`;

describe("Bound reviewer input relationships", () => {
  test("rejects a related raw artifact whose digest does not match its verdict", () => {
    // Given: a verdict requiring one exact raw artifact and a different observed digest.
    const records = [
      {
        path: "/evidence/red-team-verdict.json",
        sha256: digest("a"),
        data: Buffer.from(JSON.stringify({
          reviewBindings: [{ path: "/evidence/red-team-raw.json", sha256: digest("b") }],
        })),
      },
      {
        path: "/evidence/red-team-raw.json",
        sha256: digest("c"),
        data: Buffer.from("{}"),
      },
    ];

    // When/Then: the immutable reviewer boundary rejects the mismatch.
    expect(() => assertReviewInputBindings(records)).toThrow("review input binding mismatch");
  });

  test("accepts exact raw, lockfile, and prepared-build relationships", () => {
    // Given: three receipts whose related inputs are all present with exact digests.
    const related = [
      ["/evidence/red-team-raw.json", digest("a")],
      ["/repo/bun.lock", digest("b")],
      ["/evidence/prepared/build-receipt.json", digest("c")],
    ];
    const records = [
      {
        path: "/evidence/verdict.json",
        sha256: digest("d"),
        data: Buffer.from(JSON.stringify({
          reviewBindings: related.map(([path, sha256]) => ({ path, sha256 })),
        })),
      },
      ...related.map(([path, sha256]) => ({ path, sha256, data: Buffer.from("{}") })),
    ];

    // When/Then: the complete immutable relationship set is accepted.
    expect(() => assertReviewInputBindings(records)).not.toThrow();
  });
});
