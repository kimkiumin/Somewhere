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

test("non-strict validator mutation throws fail closed and leaves the receipt intact", () => {
  const nonStrictValidator = Function("candidate", `
    if (candidate.canonicalVenueId === "venue:a") {
      candidate.evidence.sourceIds[0] = "source:tampered";
    }
    return { pass: true, reasons: [] };
  `);
  const result = selectUniformly(
    [
      { canonicalVenueId: "venue:a", evidence: { sourceIds: ["source:1"] } },
      { canonicalVenueId: "venue:b", evidence: { sourceIds: ["source:2"] } },
    ],
    metadata(),
    () => 0,
    nonStrictValidator,
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.deepEqual(result.receipt.attempts[0], {
    rawDraws: [0],
    remainingPoolSize: 2,
    selectedIndex: 0,
    selectedCanonicalVenueId: "venue:a",
    finalValidation: { pass: false, reasons: ["final-validation-threw"] },
  });
});

test("validator can read nested JSON evidence through its read-only view", () => {
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a", evidence: { sourceIds: ["source:1"] } }],
    metadata(),
    () => 0,
    (candidate) => ({
      pass: candidate.evidence.sourceIds[0] === "source:1",
      reasons: [],
    }),
  );

  assert.equal(result.selected.canonicalVenueId, "venue:a");
  assert.deepEqual(result.receipt.attempts[0].finalValidation, {
    pass: true,
    reasons: [],
  });
});

test("descriptor-reflection validator mutation fails closed without altering canonical selection", () => {
  const expectedDigest = idsDigest(["venue:a", "venue:b"]);
  const result = selectUniformly(
    [
      { canonicalVenueId: "venue:a", evidence: { sourceIds: ["source:1"] } },
      { canonicalVenueId: "venue:b", evidence: { sourceIds: ["source:2"] } },
    ],
    metadata(),
    () => 0,
    (candidate) => {
      if (candidate.canonicalVenueId === "venue:a") {
        Object.getOwnPropertyDescriptor(candidate.evidence, "sourceIds").value[0] = "source:tampered";
      }
      return { pass: true, reasons: [] };
    },
  );

  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.equal(result.receipt.orderedQualifiedSetDigest, expectedDigest);
  assert.equal(result.receipt.attempts[0].selectedCanonicalVenueId, "venue:a");
  assert.deepEqual(result.receipt.attempts[0].finalValidation, {
    pass: false,
    reasons: ["final-validation-threw"],
  });
});

test("validator mutation cannot alter the canonical snapshot, receipt, digest, or returned candidate", () => {
  const candidate = {
    canonicalVenueId: "venue:a",
    evidence: { sourceIds: ["source:1"] },
  };
  const expectedDigest = idsDigest(["venue:a"]);
  const result = selectUniformly(
    [candidate],
    metadata(),
    () => 0,
    (validatorCandidate) => {
      validatorCandidate.canonicalVenueId = "venue:tampered";
      validatorCandidate.evidence.sourceIds.push("source:tampered");
      return { pass: true, reasons: [] };
    },
  );

  assert.deepEqual(candidate, {
    canonicalVenueId: "venue:a",
    evidence: { sourceIds: ["source:1"] },
  });
  assert.equal(result.receipt.orderedQualifiedSetDigest, expectedDigest);
  assert.equal(result.receipt.attempts[0].selectedCanonicalVenueId, "venue:a");
  assert.equal(result.selected, null);
  assert.equal(result.receipt.noFit, true);
});

test("final receipts are deeply immutable and do not retain validator results", () => {
  const validation = { pass: true, reasons: ["fresh-hours"] };
  const successful = selectUniformly(
    [{ canonicalVenueId: "venue:a", evidence: { sourceIds: ["source:1"] } }],
    metadata(),
    () => 0,
    () => validation,
  );
  const noFit = selectUniformly(
    [{ canonicalVenueId: "venue:a" }],
    metadata(),
    () => 0,
    () => ({ pass: false, reasons: ["stale-hours"] }),
  );

  validation.reasons[0] = "tampered";
  assert.equal(Object.isFrozen(successful.selected), true);
  assert.equal(Object.isFrozen(successful.selected.evidence), true);
  assert.equal(Object.isFrozen(successful.selected.evidence.sourceIds), true);
  assert.deepEqual(successful.receipt.attempts[0].finalValidation, {
    pass: true,
    reasons: ["fresh-hours"],
  });

  for (const receipt of [successful.receipt, noFit.receipt]) {
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(Object.isFrozen(receipt.attempts), true);
    assert.equal(Object.isFrozen(receipt.attempts[0]), true);
    assert.equal(Object.isFrozen(receipt.attempts[0].rawDraws), true);
    assert.equal(Object.isFrozen(receipt.attempts[0].finalValidation), true);
    assert.equal(Object.isFrozen(receipt.attempts[0].finalValidation.reasons), true);
  }
  assert.equal(noFit.receipt.noFit, true);
  assert.throws(() => successful.receipt.attempts[0].rawDraws.push(1), TypeError);
  assert.throws(() => noFit.receipt.attempts[0].finalValidation.reasons.push("tampered"), TypeError);
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

test("candidate snapshots reject mutable built-ins", () => {
  for (const invalidValue of [
    new Map([["source", "1"]]),
    new Set(["source:1"]),
    new Date("2026-07-21T09:00:00Z"),
  ]) {
    assert.throws(
      () => selectUniformly([{ canonicalVenueId: "venue:a", invalidValue }], metadata()),
      /candidate must be recursively JSON-like/,
    );
  }
});

test("candidate snapshots reject non-JSON values and cycles", () => {
  const cyclic = { canonicalVenueId: "venue:cycle" };
  cyclic.self = cyclic;
  const customPrototype = Object.create({ inherited: true });
  customPrototype.canonicalVenueId = "venue:prototype";

  for (const candidate of [
    { canonicalVenueId: "venue:undefined", invalidValue: undefined },
    { canonicalVenueId: "venue:function", invalidValue: () => {} },
    { canonicalVenueId: "venue:bigint", invalidValue: 1n },
    { canonicalVenueId: "venue:infinity", invalidValue: Infinity },
    { canonicalVenueId: "venue:nan", invalidValue: Number.NaN },
    { canonicalVenueId: "venue:symbol-value", invalidValue: Symbol("value") },
    Object.assign({ canonicalVenueId: "venue:symbol-key" }, { [Symbol("key")]: "value" }),
    customPrototype,
    cyclic,
  ]) {
    assert.throws(
      () => selectUniformly([candidate], metadata()),
      /candidate must be recursively JSON-like/,
    );
  }
});

test("candidate snapshots reject accessors without invoking them", () => {
  let getterCalls = 0;
  const candidate = { canonicalVenueId: "venue:a" };
  Object.defineProperty(candidate, "evidence", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { sourceIds: ["source:1"] };
    },
  });

  assert.throws(
    () => selectUniformly([candidate], metadata()),
    /candidate must be recursively JSON-like/,
  );
  assert.equal(getterCalls, 0);
});

test("stateful canonical ID accessors cannot change the selected identity", () => {
  let getterCalls = 0;
  const candidate = {};
  Object.defineProperty(candidate, "canonicalVenueId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return getterCalls === 1 ? "venue:a" : "venue:tampered";
    },
  });

  assert.throws(
    () => selectUniformly([candidate], metadata()),
    /candidate must be recursively JSON-like/,
  );
  assert.equal(getterCalls, 0);
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
