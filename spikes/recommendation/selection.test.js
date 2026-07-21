"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { drawUniformIndex, selectUniformly } = require("./selection.js");

function metadata(overrides = {}) {
  return {
    requestId: "req-1",
    provider: "fixture-provider",
    providerQueryVersion: "fixture-query-v1",
    paginationVersion: "page-v1",
    coverageVersion: "coverage-v1",
    canonicalizationVersion: "canonical-v1",
    ruleVersion: "rules-v1",
    modelVersion: "fixture-model-v1",
    promptVersion: "prompt-v1",
    evidencePolicyVersion: "evidence-v1",
    snapshotTimestamp: "2026-07-21T09:00:00Z",
    ...overrides,
  };
}

function idsDigest(ids) {
  return crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

test("receipt fixes canonical pool order, draw, selected index, and final validation", () => {
  const candidates = [
    { canonicalVenueId: "venue:b" },
    { canonicalVenueId: "venue:a" },
  ];
  const result = selectUniformly(
    candidates,
    metadata(),
    () => 1,
    () => ({ pass: true, reasons: [] }),
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.equal(result.receipt.qualifiedPoolSize, 2);
  assert.equal(result.receipt.orderedQualifiedSetDigest, idsDigest(["venue:a", "venue:b"]));
  assert.equal(result.receipt.rngAlgorithm, "uint32-rejection-v1");
  assert.deepEqual(result.receipt.attempts, [{
    rawDraws: [1],
    remainingPoolSize: 2,
    selectedIndex: 1,
    selectedCanonicalVenueId: "venue:b",
    finalValidation: { pass: true, reasons: [] },
  }]);
  assert.deepEqual(candidates.map((candidate) => candidate.canonicalVenueId), ["venue:b", "venue:a"]);
});

test("receipt retains every required frozen-snapshot metadata field", () => {
  const frozenMetadata = metadata();
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }],
    frozenMetadata,
    () => 0,
    () => ({ pass: true, reasons: [] }),
  );

  for (const [field, value] of Object.entries(frozenMetadata)) {
    assert.equal(result.receipt[field], value);
  }
});

test("missing or blank provider identity is rejected", () => {
  const { provider, ...missingProvider } = metadata();
  for (const invalidMetadata of [
    missingProvider,
    metadata({ provider: "" }),
    metadata({ provider: "  " }),
  ]) {
    assert.throws(
      () => selectUniformly([{ canonicalVenueId: "venue:a" }], invalidMetadata),
      /metadata\.provider/,
    );
  }
});

test("rejection sampling removes uint32 modulo bias", () => {
  const draws = [0xffffffff, 1];
  const result = selectUniformly(
    [
      { canonicalVenueId: "venue:a" },
      { canonicalVenueId: "venue:b" },
      { canonicalVenueId: "venue:c" },
    ],
    metadata({ requestId: "req-3" }),
    () => draws.shift(),
    () => ({ pass: true, reasons: [] }),
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.deepEqual(result.receipt.attempts[0].rawDraws, [0xffffffff, 1]);
});

test("uint32 sampling rejects pools larger than its representable range", () => {
  assert.throws(
    () => drawUniformIndex(0x100000001, () => -1),
    /poolSize/,
  );
});

test("failed final validation is recorded before reselection", () => {
  const draws = [0, 0];
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    metadata({ requestId: "req-2" }),
    () => draws.shift(),
    (candidate) => ({
      pass: candidate.canonicalVenueId === "venue:b",
      reasons: ["stale-hours"],
    }),
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.equal(result.receipt.attempts.length, 2);
  assert.deepEqual(result.receipt.attempts[0].finalValidation, {
    pass: false,
    reasons: ["stale-hours"],
  });
});

test("malformed final validation fails closed and is recorded before reselection", () => {
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    metadata(),
    () => 0,
    (candidate) => candidate.canonicalVenueId === "venue:a" ? { pass: "true" } : { pass: true, reasons: [] },
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.deepEqual(result.receipt.attempts[0].finalValidation, {
    pass: false,
    reasons: ["final-validation-malformed"],
  });
});

test("validator mutation throws fail closed and is recorded before reselection", () => {
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    metadata(),
    () => 0,
    (candidate) => {
      if (candidate.canonicalVenueId === "venue:a") {
        candidate.canonicalVenueId = "venue:tampered";
      }
      return { pass: true, reasons: [] };
    },
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.deepEqual(result.receipt.attempts[0].finalValidation, {
    pass: false,
    reasons: ["final-validation-threw"],
  });
});

test("validator mutation cannot alter the frozen snapshot, receipt, digest, or returned candidate", () => {
  const candidate = {
    canonicalVenueId: "venue:a",
    evidence: { sourceIds: ["source:1"] },
  };
  const expectedDigest = idsDigest(["venue:a"]);
  const result = selectUniformly(
    [candidate],
    metadata(),
    () => 0,
    (frozenCandidate) => {
      assert.throws(() => {
        frozenCandidate.canonicalVenueId = "venue:tampered";
      }, TypeError);
      assert.throws(() => {
        frozenCandidate.evidence.sourceIds.push("source:tampered");
      }, TypeError);
      return { pass: true, reasons: [] };
    },
  );

  assert.deepEqual(candidate, {
    canonicalVenueId: "venue:a",
    evidence: { sourceIds: ["source:1"] },
  });
  assert.equal(result.receipt.orderedQualifiedSetDigest, expectedDigest);
  assert.equal(result.receipt.attempts[0].selectedCanonicalVenueId, "venue:a");
  assert.deepEqual(result.selected, candidate);
  assert.equal(Object.isFrozen(result.selected), true);
  assert.equal(Object.isFrozen(result.selected.evidence), true);
  assert.equal(Object.isFrozen(result.selected.evidence.sourceIds), true);
});

test("false final validation for every candidate returns an auditable no-fit receipt", () => {
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    metadata(),
    () => 0,
    () => ({ pass: false, reasons: ["stale-hours"] }),
  );

  assert.equal(result.selected, null);
  assert.equal(result.receipt.noFit, true);
  assert.equal(result.receipt.attempts.length, 2);
});

test("zero qualified candidates returns no-fit without drawing or validating", () => {
  const result = selectUniformly(
    [],
    metadata(),
    () => { throw new Error("must not draw"); },
    () => { throw new Error("must not validate"); },
  );

  assert.equal(result.selected, null);
  assert.equal(result.receipt.noFit, true);
  assert.equal(result.receipt.qualifiedPoolSize, 0);
  assert.equal(result.receipt.orderedQualifiedSetDigest, idsDigest([]));
  assert.deepEqual(result.receipt.attempts, []);
});

test("missing or blank required receipt metadata is rejected", () => {
  for (const invalidMetadata of [
    metadata({ provider: undefined }),
    metadata({ ruleVersion: "  " }),
    metadata({ snapshotTimestamp: "not-a-timestamp" }),
    metadata({ snapshotTimestamp: "2026-02-30T09:00:00Z" }),
  ]) {
    assert.throws(
      () => selectUniformly([{ canonicalVenueId: "venue:a" }], invalidMetadata),
      /metadata/,
    );
  }
});

test("duplicate or malformed canonical venue IDs are rejected before a receipt is produced", () => {
  for (const candidates of [
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:a" }],
    [{ canonicalVenueId: " venue:a" }],
    [{ canonicalVenueId: "" }],
    [{}],
  ]) {
    assert.throws(
      () => selectUniformly(candidates, metadata()),
      /canonicalVenueId/,
    );
  }
});

test("receipt contains a digest rather than the qualified pool", () => {
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    metadata(),
    () => 0,
    () => ({ pass: true, reasons: [] }),
  );

  assert.equal(Object.hasOwn(result.receipt, "orderedQualifiedSet"), false);
  assert.equal(Object.hasOwn(result.receipt, "pool"), false);
  assert.equal(Object.hasOwn(result.receipt, "candidates"), false);
});
