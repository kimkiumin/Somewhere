# Somewhere vNext Foundation and Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the repository with the approved vNext blueprint and produce a tested feasibility package for recommendation data, route-aware direction, iOS sensors, and the physical compass before integrated product implementation begins.

**Architecture:** Preserve `prototype/` as the historical v0.1 static prototype. Put provider-neutral, disposable feasibility code under `spikes/`, keep product decisions in `BLUEPRINT.md` and `docs/blueprint/`, and use Node's built-in test runner so the repository gains no runtime framework dependency. The plan ends with an evidence-based Phase 1 gate report; it does not pretend that unresolved provider access, iOS field accuracy, or hardware behavior is already solved.

**Tech Stack:** Plain JavaScript on Node.js 24, Node `node:test`, PowerShell 7/Windows PowerShell compatibility, plain HTML/CSS for diagnostic views, SwiftUI/Core Location on macOS for the iOS spike, and full-scale physical mockups or Wizard-of-Oz control for embodied tests.

## Global Constraints

- `BLUEPRINT.md` and `docs/blueprint/*.md` are the canonical vNext product specification.
- `prototype/` remains a v0.1 historical implementation until a task explicitly migrates behavior.
- Return one evidence-qualified destination; never add candidate lists, rankings, swiping, reviews, ratings, or a primary map UI.
- Do not connect a live provider or LLM until its rights, freshness, evidence, benchmark, and fallback gates pass.
- Straight-line distance is a coarse prefilter only; final limits use a valid walking route and opening status at ETA plus a versioned entry buffer.
- High-consequence allergy, medical-diet, and accessibility unknowns fail closed.
- The first Stop action pauses guidance immediately; confirmed Stop ends the session and always leads to a skippable reason step.
- Five-minute friction applies only to a new recommendation after an ended journey.
- The physical compass uses its own heading or a tested absolute-bearing contract; the iPhone heading is not the heading of a separately held product.
- The fixed display rows are distance, representative menu, and price. Network and Bluetooth state use a separate lower-center status channel.
- Product-improvement upload remains disabled until the user confirms the pilot data parameters and legal, deletion, retention, and access gates pass.
- Every implementation task follows red-green TDD and ends with a focused commit.

## Planned File Structure

```text
package.json                         # dependency-free verification commands
tests/
  project_contract.test.js          # source-priority and vNext/v0.1 boundary
spikes/
  recommendation/
    candidate.js                    # normalization, canonical identity, hard filters
    candidate.test.js
    selection.js                    # uniform draw and auditable receipt
    selection.test.js
    merit-validator.js              # deterministic structured-output validation
    merit-validator.test.js
    benchmark-cases.js              # frozen adversarial cases
  navigation/
    geometry.js                     # bearing and angle math
    geometry.test.js
    confidence.js                   # stale/error/pause state rules
    confidence.test.js
  physical-display/
    display-state.js                # device-relative pointing and status behavior
    display-state.test.js
    index.html                      # diagnostic display, not product UI
    app.js
  web-sensors/
    index.html                      # developer-only location/heading diagnostic
    app.js
ios/
  SensorSpike/
    SensorSpike/
      SensorSpikeApp.swift
      LocationHeadingModel.swift
      ContentView.swift
    SensorSpikeTests/
      LocationHeadingModelTests.swift
    SensorSpike.xcodeproj/
    README.md
research/
  provider-capabilities.json        # dated evidence matrix
  phase1-evidence.json              # machine-readable gate evidence
docs/research/
  provider_capability_matrix.md
  ios_sensor_spike_protocol.md
  physical_orientation_protocol.md
  pilot_analytics_review.md
  phase1_gate_report.md
scripts/
  validate-provider-matrix.js
  run-phase1-gate.ps1
```

---

### Task 1: Establish the vNext Source Hierarchy and Verification Entry Point

**Files:**
- Create: `package.json`
- Create: `tests/project_contract.test.js`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/prototype_spec.md`
- Modify: `docs/prototype_notes.md`

**Interfaces:**
- Consumes: `BLUEPRINT.md`, `docs/blueprint/roadmap.md`, and the current v0.1 files.
- Produces: `npm test`, `npm run check:prototype`, and an explicit source-priority contract for every later task.

- [ ] **Step 1: Write the failing source-priority test**

```js
// tests/project_contract.test.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("repository declares the approved vNext source hierarchy", () => {
  const agents = read("AGENTS.md");
  const readme = read("README.md");
  const prototypeSpec = read("docs/prototype_spec.md");

  assert.match(agents, /BLUEPRINT\.md.*docs\/blueprint/s);
  assert.match(agents, /v0\.1 historical implementation/i);
  assert.match(readme, /approved vNext blueprint/i);
  assert.match(readme, /physical compass/i);
  assert.match(prototypeSpec, /Historical v0\.1 Specification/i);
});

test("vNext rules do not preserve immediate reroll as an active contract", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /no active Reroll/i);
  assert.match(agents, /five-minute/i);
  assert.match(agents, /skippable reason/i);
});
```

- [ ] **Step 2: Run the test and verify that the old contract fails**

Run: `node --test tests/project_contract.test.js`

Expected: FAIL because `AGENTS.md`, `README.md`, and `docs/prototype_spec.md` still present v0.1 as the active product contract.

- [ ] **Step 3: Add the dependency-free test entry point**

```json
{
  "name": "somewhere-vnext",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "test": "node --test",
    "check:prototype": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File harness/check-prototype-contract.ps1",
    "verify": "npm test && npm run check:prototype"
  }
}
```

- [ ] **Step 4: Reconcile the active instructions without rewriting v0.1 history**

Add this exact priority block near the top of `AGENTS.md` and mirror it in `README.md`:

```markdown
## vNext Source Priority

For vNext work, read sources in this order:

1. `BLUEPRINT.md`
2. `docs/blueprint/*.md`
3. `AGENTS.md` and `README.md`
4. v0.1 documents and `prototype/` as historical evidence

The v0.1 prototype remains a historical implementation. It does not override the approved vNext rule that there is no active Reroll: Stop pauses immediately, confirmed Stop is followed by a skippable reason, and a new recommendation within five minutes uses guarded recovery. The required final product form is a physical compass supported by an iOS field experience.
```

Rename the first heading in `docs/prototype_spec.md` to `# Historical v0.1 Specification for Codex` and add this status notice immediately below it:

```markdown
> This file preserves the original v0.1 implementation brief. For vNext work, `BLUEPRINT.md` and `docs/blueprint/*.md` take priority.
```

Append a dated entry to `docs/prototype_notes.md` stating that v0.1 remains runnable but immediate Reroll and mock-only selection are superseded for vNext.

- [ ] **Step 5: Run the complete current verification set**

Run: `npm run verify`

Expected: the new contract tests pass, all existing prototype tests pass, and `Prototype UX contract markers OK.` remains present.

- [ ] **Step 6: Commit the contract migration**

```powershell
git add package.json tests/project_contract.test.js AGENTS.md README.md docs/prototype_spec.md docs/prototype_notes.md
git commit -m "docs: establish vnext source priority"
```

---

### Task 2: Build the Provider-Neutral Candidate and Hard-Filter Spike

**Files:**
- Create: `spikes/recommendation/candidate.test.js`
- Create: `spikes/recommendation/candidate.js`

**Interfaces:**
- Consumes: raw provider records and a `request` containing category, budget ceiling, maximum walking distance/time, and high-consequence requirements.
- Produces: `normalizeCandidate(raw)`, `dedupeCandidates(candidates)`, and `evaluateHardFilters(candidate, request, routeFacts)`.

- [ ] **Step 1: Write failing tests for branch-aware deduplication and fail-closed filtering**

```js
// spikes/recommendation/candidate.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeCandidate,
  dedupeCandidates,
  evaluateHardFilters,
} = require("./candidate.js");

const base = {
  provider: "fixture",
  providerPlaceId: "a-1",
  name: "Sample Kitchen Hongdae",
  branchName: "Hongdae",
  address: "10 Example-ro",
  latitude: 37.55,
  longitude: 126.92,
  category: "restaurant",
  priceBand: 2,
  sourceTimestamp: "2026-07-21T09:00:00Z",
};

test("dedupe merges the same branch but keeps another branch", () => {
  const sameBranch = normalizeCandidate({ ...base, provider: "other", providerPlaceId: "b-9" });
  const otherBranch = normalizeCandidate({
    ...base,
    providerPlaceId: "a-2",
    branchName: "Gangnam",
    address: "99 Other-ro",
    latitude: 37.50,
    longitude: 127.02,
  });
  const result = dedupeCandidates([normalizeCandidate(base), sameBranch, otherBranch]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.mergedRecords.length, 1);
});

test("route facts and high-consequence unknowns fail closed", () => {
  const candidate = normalizeCandidate(base);
  const request = {
    category: "restaurant",
    maxWalkingDistanceM: 1200,
    maxWalkingDurationS: 1200,
    maxPriceBand: 2,
    requiredEvidence: ["allergy:nut-free"],
  };
  const result = evaluateHardFilters(candidate, request, {
    walkingDistanceM: 800,
    walkingDurationS: 700,
    openAtEtaWithBuffer: true,
    evidence: {},
  });
  assert.equal(result.pass, false);
  assert.deepEqual(result.unknowns, ["allergy:nut-free"]);
});

test("straight-line distance never substitutes for walking-route facts", () => {
  const result = evaluateHardFilters(normalizeCandidate(base), {
    category: "restaurant",
    maxWalkingDistanceM: 1200,
    maxWalkingDurationS: 1200,
    maxPriceBand: 2,
    requiredEvidence: [],
  }, {});
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes("walking-route-unknown"));
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `node --test spikes/recommendation/candidate.test.js`

Expected: FAIL with `Cannot find module './candidate.js'`.

- [ ] **Step 3: Implement the minimal provider-neutral domain**

```js
// spikes/recommendation/candidate.js
"use strict";

function clean(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeCandidate(raw) {
  return {
    provider: clean(raw.provider),
    providerPlaceId: clean(raw.providerPlaceId),
    name: clean(raw.name),
    branchName: clean(raw.branchName),
    address: clean(raw.address),
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    category: clean(raw.category),
    priceBand: Number(raw.priceBand),
    sourceTimestamp: clean(raw.sourceTimestamp),
    evidence: { ...(raw.evidence || {}) },
  };
}

function roundedCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "unknown";
}

function canonicalKey(candidate) {
  return [
    clean(candidate.name).toLowerCase(),
    clean(candidate.branchName).toLowerCase(),
    clean(candidate.address).toLowerCase(),
    roundedCoordinate(candidate.latitude),
    roundedCoordinate(candidate.longitude),
  ].join("|");
}

function dedupeCandidates(candidates) {
  const byKey = new Map();
  const mergedRecords = [];
  for (const candidate of candidates) {
    const key = canonicalKey(candidate);
    if (!byKey.has(key)) {
      byKey.set(key, { ...candidate, canonicalVenueId: key, sources: [candidate.provider] });
      continue;
    }
    const current = byKey.get(key);
    current.sources = [...new Set([...current.sources, candidate.provider])].sort();
    current.evidence = { ...current.evidence, ...candidate.evidence };
    mergedRecords.push({ key, provider: candidate.provider, providerPlaceId: candidate.providerPlaceId });
  }
  return { candidates: [...byKey.values()], mergedRecords };
}

function evaluateHardFilters(candidate, request, routeFacts) {
  const reasons = [];
  const unknowns = [];
  if (candidate.category !== request.category) reasons.push("category-mismatch");
  if (!Number.isFinite(candidate.priceBand) || candidate.priceBand > request.maxPriceBand) reasons.push("price-mismatch");
  if (!Number.isFinite(routeFacts.walkingDistanceM) || !Number.isFinite(routeFacts.walkingDurationS)) {
    reasons.push("walking-route-unknown");
  } else {
    if (routeFacts.walkingDistanceM > request.maxWalkingDistanceM) reasons.push("walking-distance-exceeded");
    if (routeFacts.walkingDurationS > request.maxWalkingDurationS) reasons.push("walking-duration-exceeded");
  }
  if (routeFacts.openAtEtaWithBuffer !== true) reasons.push("opening-at-eta-not-proven");
  const evidence = { ...candidate.evidence, ...(routeFacts.evidence || {}) };
  for (const key of request.requiredEvidence || []) {
    if (evidence[key] !== true) unknowns.push(key);
  }
  return { pass: reasons.length === 0 && unknowns.length === 0, reasons, unknowns };
}

module.exports = { normalizeCandidate, canonicalKey, dedupeCandidates, evaluateHardFilters };
```

- [ ] **Step 4: Run the recommendation-domain tests**

Run: `node --test spikes/recommendation/candidate.test.js`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the candidate spike**

```powershell
git add spikes/recommendation/candidate.js spikes/recommendation/candidate.test.js
git commit -m "spike: validate candidate qualification boundaries"
```

---

### Task 3: Produce Auditable Uniform Selection Receipts

**Files:**
- Create: `spikes/recommendation/selection.test.js`
- Create: `spikes/recommendation/selection.js`

**Interfaces:**
- Consumes: canonical qualified candidates, frozen snapshot metadata, injected `nextUint32()`, and `finalValidate(candidate)`.
- Produces: `selectUniformly(candidates, metadata, nextUint32, finalValidate)` returning `{ selected, receipt }`.

- [ ] **Step 1: Write the failing receipt test**

```js
// spikes/recommendation/selection.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectUniformly } = require("./selection.js");

test("receipt fixes pool order, draw, selected index, and final validation", () => {
  const candidates = [
    { canonicalVenueId: "venue:b" },
    { canonicalVenueId: "venue:a" },
  ];
  const result = selectUniformly(
    candidates,
    {
      requestId: "req-1",
      providerQueryVersion: "fixture-v1",
      paginationVersion: "page-v1",
      coverageVersion: "coverage-v1",
      canonicalizationVersion: "canonical-v1",
      ruleVersion: "rules-v1",
      modelVersion: "fixture-model-v1",
      promptVersion: "prompt-v1",
      evidencePolicyVersion: "evidence-v1",
      snapshotTimestamp: "2026-07-21T09:00:00Z",
    },
    () => 1,
    () => ({ pass: true, reasons: [] }),
  );
  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.equal(result.receipt.qualifiedPoolSize, 2);
  assert.equal(result.receipt.attempts[0].selectedIndex, 1);
  assert.equal(result.receipt.attempts[0].drawValue, 1);
  assert.match(result.receipt.orderedQualifiedSetDigest, /^[a-f0-9]{64}$/);
});

test("failed final validation is recorded before reselection", () => {
  const draws = [0, 0];
  const result = selectUniformly(
    [{ canonicalVenueId: "venue:a" }, { canonicalVenueId: "venue:b" }],
    { requestId: "req-2" },
    () => draws.shift(),
    (candidate) => ({ pass: candidate.canonicalVenueId === "venue:b", reasons: ["stale-hours"] }),
  );
  assert.equal(result.selected.canonicalVenueId, "venue:b");
  assert.equal(result.receipt.attempts.length, 2);
  assert.equal(result.receipt.attempts[0].finalValidation.pass, false);
});
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `node --test spikes/recommendation/selection.test.js`

Expected: FAIL with `Cannot find module './selection.js'`.

- [ ] **Step 3: Implement deterministic ordering, digesting, and recorded reselection**

```js
// spikes/recommendation/selection.js
"use strict";

const crypto = require("node:crypto");

function digestIds(ids) {
  return crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex");
}

function defaultUint32() {
  return crypto.randomBytes(4).readUInt32BE(0);
}

function selectUniformly(candidates, metadata, nextUint32 = defaultUint32, finalValidate = () => ({ pass: true, reasons: [] })) {
  const ordered = [...candidates].sort((a, b) => a.canonicalVenueId.localeCompare(b.canonicalVenueId));
  const pool = [...ordered];
  const receipt = {
    ...metadata,
    rngAlgorithm: "uint32-modulo-v1",
    qualifiedPoolSize: ordered.length,
    orderedQualifiedSetDigest: digestIds(ordered.map((item) => item.canonicalVenueId)),
    attempts: [],
  };
  while (pool.length > 0) {
    const drawValue = nextUint32() >>> 0;
    const selectedIndex = drawValue % pool.length;
    const candidate = pool[selectedIndex];
    const finalValidation = finalValidate(candidate);
    receipt.attempts.push({
      drawValue,
      remainingPoolSize: pool.length,
      selectedIndex,
      selectedCanonicalVenueId: candidate.canonicalVenueId,
      finalValidation,
    });
    if (finalValidation.pass === true) return { selected: candidate, receipt };
    pool.splice(selectedIndex, 1);
  }
  return { selected: null, receipt: { ...receipt, noFit: true } };
}

module.exports = { digestIds, selectUniformly };
```

- [ ] **Step 4: Run the selection tests**

Run: `node --test spikes/recommendation/selection.test.js`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the receipt spike**

```powershell
git add spikes/recommendation/selection.js spikes/recommendation/selection.test.js
git commit -m "spike: add auditable uniform selection receipt"
```

---

### Task 4: Freeze the Deterministic LLM Output Benchmark

**Files:**
- Create: `spikes/recommendation/benchmark-cases.js`
- Create: `spikes/recommendation/merit-validator.test.js`
- Create: `spikes/recommendation/merit-validator.js`

**Interfaces:**
- Consumes: structured model output and an evidence map keyed by evidence ID.
- Produces: `validateMeritResult(result, evidenceById)` and `scoreBenchmark(cases)` with critical false-pass, unsupported-claim, insufficient-evidence, and malformed-output counts.

- [ ] **Step 1: Create the frozen adversarial fixture set**

```js
// spikes/recommendation/benchmark-cases.js
"use strict";

module.exports = [
  { id: "valid-pass", expected: "pass", evidence: { e1: { current: true, text: "broad menu evidence" } }, result: { verdict: "pass", merits: [{ type: "menu", claim: "broad dish category", evidence_ids: ["e1"], confidence: "high" }], critical_weaknesses: [], unknowns: [] } },
  { id: "unsupported-claim", expected: "reject", evidence: {}, result: { verdict: "pass", merits: [{ type: "taste", claim: "excellent", evidence_ids: ["missing"], confidence: "high" }], critical_weaknesses: [], unknowns: [] } },
  { id: "stale-hours", expected: "reject", evidence: { hours: { current: false, text: "old hours" } }, result: { verdict: "pass", merits: [{ type: "menu", claim: "dish", evidence_ids: ["hours"], confidence: "high" }], critical_weaknesses: [], unknowns: [] } },
  { id: "conflicting-source", expected: "insufficient_evidence", evidence: { c1: { current: true, conflict: true, text: "conflict" } }, result: { verdict: "insufficient_evidence", merits: [], critical_weaknesses: [], unknowns: ["opening_hours"] } },
  { id: "critical-weakness", expected: "fail", evidence: { w1: { current: true, text: "critical weakness" } }, result: { verdict: "fail", merits: [], critical_weaknesses: [{ claim: "critical", evidence_ids: ["w1"] }], unknowns: [] } },
  { id: "distinctive-menu-leak", expected: "reject", evidence: { m1: { current: true, distinctive: true, text: "unique item" } }, result: { verdict: "pass", merits: [{ type: "menu", claim: "unique item", evidence_ids: ["m1"], confidence: "high" }], critical_weaknesses: [], unknowns: [] } },
  { id: "close-before-arrival", expected: "fail", evidence: { h1: { current: true, closesBeforeEta: true, text: "hours" } }, result: { verdict: "fail", merits: [], critical_weaknesses: [{ claim: "closed at ETA", evidence_ids: ["h1"] }], unknowns: [] } },
  { id: "malformed-output", expected: "reject", evidence: {}, result: { answer: "looks good" } },
  { id: "route-failure", expected: "fail", evidence: { r1: { current: true, routeUnavailable: true, text: "no walking route" } }, result: { verdict: "fail", merits: [], critical_weaknesses: [{ claim: "route unavailable", evidence_ids: ["r1"] }], unknowns: [] } },
];
```

- [ ] **Step 2: Write the failing validator tests**

```js
// spikes/recommendation/merit-validator.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const cases = require("./benchmark-cases.js");
const { validateMeritResult, scoreBenchmark } = require("./merit-validator.js");

test("unsupported, stale, distinctive, and malformed outputs are rejected", () => {
  for (const id of ["unsupported-claim", "stale-hours", "distinctive-menu-leak", "malformed-output"]) {
    const item = cases.find((entry) => entry.id === id);
    assert.equal(validateMeritResult(item.result, item.evidence).accepted, false, id);
  }
});

test("frozen fixture benchmark has no critical false pass", () => {
  const score = scoreBenchmark(cases);
  assert.equal(score.criticalFalsePasses, 0);
  assert.equal(score.caseCount, 9);
});
```

- [ ] **Step 3: Run the tests and confirm the validator is missing**

Run: `node --test spikes/recommendation/merit-validator.test.js`

Expected: FAIL with `Cannot find module './merit-validator.js'`.

- [ ] **Step 4: Implement the evidence-bound validator and scorer**

```js
// spikes/recommendation/merit-validator.js
"use strict";

const ALLOWED_VERDICTS = new Set(["pass", "fail", "insufficient_evidence"]);

function referencedIds(result) {
  const merits = Array.isArray(result.merits) ? result.merits : [];
  const weaknesses = Array.isArray(result.critical_weaknesses) ? result.critical_weaknesses : [];
  return [...merits, ...weaknesses].flatMap((item) => Array.isArray(item.evidence_ids) ? item.evidence_ids : []);
}

function validateMeritResult(result, evidenceById) {
  const errors = [];
  if (!result || !ALLOWED_VERDICTS.has(result.verdict)) errors.push("malformed-verdict");
  if (!Array.isArray(result?.merits) || !Array.isArray(result?.critical_weaknesses) || !Array.isArray(result?.unknowns)) errors.push("malformed-arrays");
  for (const id of referencedIds(result || {})) {
    const evidence = evidenceById[id];
    if (!evidence) errors.push(`unsupported:${id}`);
    else if (evidence.current !== true) errors.push(`stale:${id}`);
    else if (evidence.distinctive === true && result.verdict === "pass") errors.push(`distinctive-leak:${id}`);
  }
  if (result?.verdict === "pass" && result.merits.length === 0) errors.push("pass-without-merit");
  if (result?.verdict === "pass" && result.critical_weaknesses.length > 0) errors.push("pass-with-critical-weakness");
  return { accepted: errors.length === 0, errors };
}

function scoreBenchmark(cases) {
  let criticalFalsePasses = 0;
  let rejected = 0;
  for (const item of cases) {
    const validation = validateMeritResult(item.result, item.evidence);
    if (!validation.accepted) rejected += 1;
    if ((item.expected === "fail" || item.expected === "insufficient_evidence" || item.expected === "reject") && validation.accepted && item.result.verdict === "pass") criticalFalsePasses += 1;
  }
  return { caseCount: cases.length, rejected, criticalFalsePasses };
}

module.exports = { validateMeritResult, scoreBenchmark };
```

- [ ] **Step 5: Run the benchmark tests**

Run: `node --test spikes/recommendation/merit-validator.test.js`

Expected: 2 tests pass and no critical false pass is accepted.

- [ ] **Step 6: Commit the frozen deterministic benchmark**

```powershell
git add spikes/recommendation/benchmark-cases.js spikes/recommendation/merit-validator.js spikes/recommendation/merit-validator.test.js
git commit -m "spike: freeze merit validator benchmark"
```

---

### Task 5: Validate Route Bearing, Confidence, and Physical Display States

**Files:**
- Create: `spikes/navigation/geometry.test.js`
- Create: `spikes/navigation/geometry.js`
- Create: `spikes/navigation/confidence.test.js`
- Create: `spikes/navigation/confidence.js`
- Create: `spikes/physical-display/display-state.test.js`
- Create: `spikes/physical-display/display-state.js`

**Interfaces:**
- Consumes: route look-ahead coordinates, physical-device heading, timestamps, connection state, and session state.
- Produces: `trueBearingDeg`, `relativeBearingDeg`, and display mode `pointing`, `spinning`, or `paused`.

- [ ] **Step 1: Write failing geometry and state tests**

```js
// spikes/navigation/geometry.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { bearingDelta, trueBearing } = require("./geometry.js");

test("bearing delta wraps across north", () => assert.equal(bearingDelta(5, 355), 10));
test("true bearing points east for equal latitude", () => {
  const value = trueBearing({ latitude: 37, longitude: 126 }, { latitude: 37, longitude: 127 });
  assert.ok(value > 89 && value < 91);
});
```

```js
// spikes/navigation/confidence.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { guidanceConfidence } = require("./confidence.js");

test("stale bearing suppresses precision", () => {
  assert.equal(guidanceConfidence({ nowMs: 10_000, bearingTimestampMs: 4_000, maxAgeMs: 3_000, routeValid: true }).trusted, false);
});
```

```js
// spikes/physical-display/display-state.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveDisplayState } = require("./display-state.js");

test("physical heading, not phone heading, determines the relative needle", () => {
  const state = deriveDisplayState({ sessionState: "following", networkAvailable: true, bleConnected: true, bearingTrusted: true, absoluteRouteBearingDeg: 30, physicalHeadingDeg: 350 });
  assert.equal(state.mode, "pointing");
  assert.equal(state.relativeBearingDeg, 40);
});

test("technical failure spins while user pause stays still", () => {
  assert.equal(deriveDisplayState({ sessionState: "following", networkAvailable: false, bleConnected: true, bearingTrusted: false }).mode, "spinning");
  assert.equal(deriveDisplayState({ sessionState: "paused", networkAvailable: false, bleConnected: false, bearingTrusted: false }).mode, "paused");
});
```

- [ ] **Step 2: Run the tests and verify all three modules are missing**

Run: `node --test spikes/navigation/geometry.test.js spikes/navigation/confidence.test.js spikes/physical-display/display-state.test.js`

Expected: FAIL with missing-module errors.

- [ ] **Step 3: Implement the pure route math**

```js
// spikes/navigation/geometry.js
"use strict";
(function initGeometry(globalScope) {
  const normalize = (degrees) => ((degrees % 360) + 360) % 360;
  const radians = (degrees) => degrees * Math.PI / 180;
  const toDegrees = (radiansValue) => radiansValue * 180 / Math.PI;

  function bearingDelta(targetDeg, headingDeg) {
    return ((normalize(targetDeg) - normalize(headingDeg) + 540) % 360) - 180;
  }

  function trueBearing(from, to) {
    const phi1 = radians(from.latitude);
    const phi2 = radians(to.latitude);
    const deltaLongitude = radians(to.longitude - from.longitude);
    const y = Math.sin(deltaLongitude) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLongitude);
    return normalize(toDegrees(Math.atan2(y, x)));
  }

  const api = { bearingDelta, trueBearing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.SomewhereGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 4: Implement confidence and physical mode rules**

```js
// spikes/navigation/confidence.js
"use strict";
function guidanceConfidence({ nowMs, bearingTimestampMs, maxAgeMs, routeValid, locationAccuracyM = Infinity, maxLocationAccuracyM = 35 }) {
  const stale = !Number.isFinite(bearingTimestampMs) || nowMs - bearingTimestampMs > maxAgeMs;
  const accurate = Number.isFinite(locationAccuracyM) && locationAccuracyM <= maxLocationAccuracyM;
  return { trusted: routeValid === true && !stale && accurate, stale, accurate };
}
module.exports = { guidanceConfidence };
```

```js
// spikes/physical-display/display-state.js
"use strict";
(function initDisplayState(globalScope) {
  const geometry = globalScope.SomewhereGeometry || require("../navigation/geometry.js");

  function deriveDisplayState(input) {
    if (input.sessionState === "paused" || input.sessionState === "stopped") {
      return { mode: "paused", needleVisible: false, relativeBearingDeg: null };
    }
    if (input.networkAvailable !== true || input.bleConnected !== true || input.bearingTrusted !== true) {
      return { mode: "spinning", needleVisible: true, relativeBearingDeg: null };
    }
    return {
      mode: "pointing",
      needleVisible: true,
      relativeBearingDeg: geometry.bearingDelta(input.absoluteRouteBearingDeg, input.physicalHeadingDeg),
    };
  }

  const api = { deriveDisplayState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.PhysicalDisplayState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 5: Run all geometry and display-state tests**

Run: `node --test spikes/navigation/geometry.test.js spikes/navigation/confidence.test.js spikes/physical-display/display-state.test.js`

Expected: 5 tests pass.

- [ ] **Step 6: Commit the direction contract spike**

```powershell
git add spikes/navigation spikes/physical-display/display-state.js spikes/physical-display/display-state.test.js
git commit -m "spike: validate route and physical bearing states"
```

---

### Task 6: Run Web and Native iOS Sensor Spikes

**Files:**
- Create: `spikes/web-sensors/index.html`
- Create: `spikes/web-sensors/app.js`
- Create: `ios/SensorSpike/SensorSpike/SensorSpikeApp.swift`
- Create: `ios/SensorSpike/SensorSpike/LocationHeadingModel.swift`
- Create: `ios/SensorSpike/SensorSpike/ContentView.swift`
- Create: `ios/SensorSpike/SensorSpikeTests/LocationHeadingModelTests.swift`
- Create: `ios/SensorSpike/SensorSpike.xcodeproj/` through Xcode
- Create: `ios/SensorSpike/README.md`
- Create: `docs/research/ios_sensor_spike_protocol.md`

**Interfaces:**
- Consumes: browser geolocation/device-orientation events and iOS `CLLocationManager` updates.
- Produces: timestamped diagnostic readings only; no destination search, map, or product navigation UI.

- [ ] **Step 1: Create a developer-only web diagnostic**

```html
<!-- spikes/web-sensors/index.html -->
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Somewhere Sensor Spike</title></head>
<body>
  <button id="start" type="button">Start sensor diagnostic</button>
  <pre id="output">idle</pre>
  <script src="./app.js"></script>
</body>
</html>
```

```js
// spikes/web-sensors/app.js
"use strict";
const output = document.querySelector("#output");
const readings = { location: null, orientation: null };
const render = () => { output.textContent = JSON.stringify(readings, null, 2); };

document.querySelector("#start").addEventListener("click", async () => {
  if (typeof DeviceOrientationEvent?.requestPermission === "function") await DeviceOrientationEvent.requestPermission();
  navigator.geolocation.watchPosition(
    (position) => { readings.location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, timestampMs: position.timestamp }; render(); },
    (error) => { readings.location = { error: error.code }; render(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
  );
  window.addEventListener("deviceorientation", (event) => {
    readings.orientation = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, absolute: event.absolute, timestampMs: Date.now() };
    render();
  });
});
```

- [ ] **Step 2: Record the web field protocol**

In `docs/research/ios_sensor_spike_protocol.md`, define these exact runs: stationary north/east/south/west, 50-meter straight walk, one 90-degree turn, one route deviation, screen lock/unlock, and permission denied. Record device model, OS, browser, secure-context URL, sample count, median location accuracy, heading failures, and recovery time. Label browser results as feasibility evidence only.

- [ ] **Step 3: Create the native Core Location project and model on macOS**

In Xcode, create an iOS App named `SensorSpike` at `ios/SensorSpike`, with SwiftUI lifecycle, Swift language, bundle identifier `com.somewhere.sensorspike`, and minimum iOS 18. Add a unit-test target named `SensorSpikeTests`. Set `NSLocationWhenInUseUsageDescription` to `Somewhere uses location and heading only for this supervised sensor feasibility test.` Do not enable background location in this spike.

```swift
// ios/SensorSpike/SensorSpike/LocationHeadingModel.swift
import CoreLocation
import Foundation

@MainActor
final class LocationHeadingModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var location: CLLocation?
    @Published private(set) var heading: CLHeading?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 1
    }

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.last
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        heading = newHeading.headingAccuracy >= 0 ? newHeading : nil
    }
}
```

```swift
// ios/SensorSpike/SensorSpike/SensorSpikeApp.swift
import SwiftUI

@main
struct SensorSpikeApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}
```

```swift
// ios/SensorSpike/SensorSpike/ContentView.swift
import SwiftUI

struct ContentView: View {
    @StateObject private var model = LocationHeadingModel()
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Authorization: \(String(describing: model.authorization))")
            Text("Accuracy: \(model.location?.horizontalAccuracy ?? -1, specifier: "%.1f") m")
            Text("True heading: \(model.heading?.trueHeading ?? -1, specifier: "%.1f")°")
            Text("Magnetic heading: \(model.heading?.magneticHeading ?? -1, specifier: "%.1f")°")
            Text("Heading accuracy: \(model.heading?.headingAccuracy ?? -1, specifier: "%.1f")°")
            Button("Start sensor diagnostic") { model.start() }
        }.padding()
    }
}
```

- [ ] **Step 4: Add and run a pure angle unit test in the Xcode project**

```swift
// ios/SensorSpike/SensorSpikeTests/LocationHeadingModelTests.swift
import XCTest

final class LocationHeadingModelTests: XCTestCase {
    func testBearingDeltaWrapsAcrossNorth() {
        let delta = ((5.0 - 355.0 + 540.0).truncatingRemainder(dividingBy: 360.0)) - 180.0
        XCTAssertEqual(delta, 10.0, accuracy: 0.001)
    }
}
```

Run on macOS: `xcodebuild test -project ios/SensorSpike/SensorSpike.xcodeproj -scheme SensorSpike -destination 'platform=iOS Simulator,name=iPhone 16'`

Expected: the unit test passes. Then install on the user's iPhone and execute the same field runs as the web spike; simulator output does not satisfy the real-device gate.

- [ ] **Step 5: Commit sensor-spike source and protocol**

```powershell
git add spikes/web-sensors ios/SensorSpike docs/research/ios_sensor_spike_protocol.md
git commit -m "spike: add web and ios sensor diagnostics"
```

---

### Task 7: Create the Provider, Privacy, and Physical Evidence Package

**Files:**
- Create: `research/provider-capabilities.json`
- Create: `scripts/validate-provider-matrix.js`
- Create: `docs/research/provider_capability_matrix.md`
- Create: `docs/research/pilot_analytics_review.md`
- Create: `docs/research/physical_orientation_protocol.md`
- Create: `spikes/physical-display/index.html`
- Create: `spikes/physical-display/app.js`
- Create: `outputs/physical/p0-direction-a.pdf`
- Create: `outputs/physical/p0-direction-b.pdf`
- Create: `outputs/physical/p0-direction-c.pdf`
- Create: `outputs/physical/p0-test-log.csv`

**Interfaces:**
- Consumes: current official provider documentation, the approved blueprint data contract, and Task 5 display-state logic.
- Produces: a dated provider matrix, a user-reviewable privacy decision sheet, and embodied physical-test evidence.

- [ ] **Step 1: Create a machine-readable matrix with honest unknown states**

```json
{
  "schemaVersion": 1,
  "checkedAt": "2026-07-21",
  "providers": [
    {
      "name": "Kakao Local",
      "capabilities": {
        "placeSearch": "unknown",
        "walkingRoute": "unknown",
        "menu": "unknown",
        "price": "unknown",
        "openingHours": "unknown",
        "accessibility": "unknown"
      },
      "sources": ["https://developers.kakao.com/docs/ko/local/dev-guide"],
      "rightsNotes": "unknown"
    },
    {
      "name": "Naver Maps",
      "capabilities": {
        "placeSearch": "unknown",
        "walkingRoute": "unknown",
        "menu": "unknown",
        "price": "unknown",
        "openingHours": "unknown",
        "accessibility": "unknown"
      },
      "sources": ["https://api.ncloud-docs.com/docs/en/ai-naver-mapsdirections-driving"],
      "rightsNotes": "unknown"
    },
    {
      "name": "TMAP",
      "capabilities": {
        "placeSearch": "unknown",
        "walkingRoute": "unknown",
        "menu": "unknown",
        "price": "unknown",
        "openingHours": "unknown",
        "accessibility": "unknown"
      },
      "sources": ["https://www.tmapmobility.com/service/corporate/api"],
      "rightsNotes": "unknown"
    }
  ]
}
```

`unknown` is a valid fail-closed research result, not a placeholder. During execution, browse only current official documentation, record a dated claim summary in `docs/research/provider_capability_matrix.md`, and change a status to `supported`, `unsupported`, or `restricted` only when the cited source supports that exact field and use.

- [ ] **Step 2: Write and run the matrix validator**

```js
// scripts/validate-provider-matrix.js
"use strict";
const fs = require("node:fs");
const matrix = JSON.parse(fs.readFileSync("research/provider-capabilities.json", "utf8"));
const allowed = new Set(["supported", "unsupported", "restricted", "unknown"]);
if (matrix.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(matrix.checkedAt)) throw new Error("invalid matrix metadata");
for (const provider of matrix.providers) {
  if (!provider.name || !Array.isArray(provider.sources) || provider.sources.length === 0) throw new Error(`missing source: ${provider.name}`);
  for (const [field, status] of Object.entries(provider.capabilities)) {
    if (!allowed.has(status)) throw new Error(`invalid ${provider.name}.${field}: ${status}`);
  }
}
console.log(`provider matrix OK: ${matrix.providers.length} providers`);
```

Run: `node scripts/validate-provider-matrix.js`

Expected: `provider matrix OK: 3 providers` even when the truthful capability result is `unknown`.

- [ ] **Step 3: Put the proposed analytics parameters in front of the user**

Copy the proposed field list, journey-scoped seven-day identifier, five-second timing buckets, 90-day row retention, one-year aggregate retention, access roles, deletion token, and prohibited joins from `docs/blueprint/recommendation_and_data.md` into `docs/research/pilot_analytics_review.md`. Mark each row `confirmed`, `revised`, or `rejected` only after explicit user review. Until every row and the legal/deletion gates are confirmed, the implementation state is `upload disabled`.

- [ ] **Step 4: Build the physical status diagnostic around Task 5**

```html
<!-- spikes/physical-display/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Physical Display Diagnostic</title>
  <style>
    body { margin: 0; font: 16px system-ui; display: grid; min-height: 100vh; place-items: center; }
    main { display: grid; gap: 8px; }
    #display { position: relative; display: grid; place-items: center; width: 90mm; height: 90mm; border: 1px solid; border-radius: 50%; }
    #status { position: absolute; bottom: 14mm; font-size: 10px; }
    #needle { position: absolute; transform-origin: 50% 100%; }
    [data-mode="spinning"] #needle { animation: error-spin 4s linear infinite; }
    @keyframes error-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { [data-mode="spinning"] #needle { animation-duration: 8s; } }
  </style>
</head>
<body>
  <main>
    <label>Session <select id="session"><option>following</option><option>paused</option><option>stopped</option></select></label>
    <label><input id="network" type="checkbox" checked> Network</label>
    <label><input id="ble" type="checkbox" checked> Bluetooth</label>
    <label><input id="trusted" type="checkbox" checked> Bearing trusted</label>
    <label>Route bearing <input id="route" type="number" value="30"></label>
    <label>Device heading <input id="heading" type="number" value="350"></label>
    <section id="display" aria-live="polite">
      <div>630 m</div><div>noodles · dumplings</div><div>₩₩</div>
      <div id="status"></div><div id="needle">▲</div>
    </section>
  </main>
  <script src="../navigation/geometry.js"></script>
  <script src="./display-state.js"></script>
  <script src="./app.js"></script>
</body>
</html>
```

```js
// spikes/physical-display/app.js
"use strict";
const controls = ["session", "network", "ble", "trusted", "route", "heading"].map((id) => document.querySelector(`#${id}`));
function render() {
  const state = globalThis.PhysicalDisplayState.deriveDisplayState({
    sessionState: document.querySelector("#session").value,
    networkAvailable: document.querySelector("#network").checked,
    bleConnected: document.querySelector("#ble").checked,
    bearingTrusted: document.querySelector("#trusted").checked,
    absoluteRouteBearingDeg: Number(document.querySelector("#route").value),
    physicalHeadingDeg: Number(document.querySelector("#heading").value),
  });
  document.querySelector("#display").dataset.mode = state.mode;
  document.querySelector("#status").textContent = `▮ Wi-Fi Bluetooth · ${state.mode}`;
  const needle = document.querySelector("#needle");
  needle.hidden = !state.needleVisible;
  needle.style.transform = state.mode === "pointing" ? `rotate(${state.relativeBearingDeg}deg)` : "";
}
controls.forEach((control) => control.addEventListener("input", render));
render();
```

The diagnostic must render exactly three content rows plus the lower-center cellular/Wi-Fi/Bluetooth channel and must not add a map, candidate identity, or review content.

Run: `node --test spikes/physical-display/display-state.test.js`

Expected: pointing, technical-error rotation, and user pause tests pass.

- [ ] **Step 5: Execute embodied 1:1 physical studies**

In `docs/research/physical_orientation_protocol.md`, require the three full-scale directions exported as `outputs/physical/p0-direction-a.pdf`, `p0-direction-b.pdf`, and `p0-direction-c.pdf`, printed or fabricated at 1:1 scale, each with the fixed three rows and lower-center status channel. Record one-handed reach, Stop/Continue/Confirm comprehension, Reveal access, Korean marquee readability, accidental Stop, walking visibility, reduced-motion response, connection-error interpretation, and preference versus phone-only display in `outputs/physical/p0-test-log.csv`. Use BLE, a wired controller, or Wizard-of-Oz input for pointing-state claims; a static image supports appearance claims only.

- [ ] **Step 6: Commit the evidence-package structure**

```powershell
git add research/provider-capabilities.json scripts/validate-provider-matrix.js docs/research/provider_capability_matrix.md docs/research/pilot_analytics_review.md docs/research/physical_orientation_protocol.md spikes/physical-display/index.html spikes/physical-display/app.js outputs/physical
git commit -m "research: add phase one evidence contracts"
```

---

### Task 8: Generate the Phase 1 Gate Report and Wire CI

**Files:**
- Create: `research/phase1-evidence.json`
- Create: `scripts/run-phase1-gate.ps1`
- Create: `docs/research/phase1_gate_report.md`
- Modify: `.github/workflows/harness-smoke.yml`
- Modify: `harness/pipeline.json`

**Interfaces:**
- Consumes: all task test results plus dated provider, iOS, physical, privacy, and LLM evidence.
- Produces: a reproducible `PASS` or `BLOCKED` Phase 1 report. `BLOCKED` is a valid result and must identify the exact missing evidence.

- [ ] **Step 1: Create the evidence manifest after running the spikes**

```json
{
  "schemaVersion": 1,
  "recommendationDomainTests": false,
  "selectionReceiptTests": false,
  "meritBenchmarkTests": false,
  "providerPlaceDataPath": false,
  "providerWalkingRoutePathOrAcceptedFallback": false,
  "iosRealDeviceSensorRun": false,
  "physicalBearingArchitectureRun": false,
  "threeFullScalePhysicalDirections": false,
  "analyticsUploadEnabled": false,
  "analyticsContractApproved": false
}
```

Set a field to `true` only when its linked artifact exists and its command or protocol result passes. `analyticsUploadEnabled` must remain `false` throughout Phase 1; `analyticsContractApproved` records review readiness, not collection activation.

- [ ] **Step 2: Create the gate runner**

```powershell
# scripts/run-phase1-gate.ps1
$ErrorActionPreference = 'Stop'

npm run verify
if ($LASTEXITCODE -ne 0) { throw 'Project verification failed' }

node scripts/validate-provider-matrix.js
if ($LASTEXITCODE -ne 0) { throw 'Provider matrix validation failed' }

$evidence = Get-Content -Raw -Encoding utf8 research/phase1-evidence.json | ConvertFrom-Json
$required = @(
  'recommendationDomainTests',
  'selectionReceiptTests',
  'meritBenchmarkTests',
  'providerPlaceDataPath',
  'providerWalkingRoutePathOrAcceptedFallback',
  'iosRealDeviceSensorRun',
  'physicalBearingArchitectureRun',
  'threeFullScalePhysicalDirections'
)
$missing = @($required | Where-Object { $evidence.$_ -ne $true })
$status = if ($missing.Count -eq 0) { 'PASS' } else { 'BLOCKED' }
$lines = @(
  '# Phase 1 Gate Report',
  '',
  "Status: $status",
  '',
  '## Evidence',
  ''
)
foreach ($name in $required) { $lines += "- ${name}: $($evidence.$name)" }
$lines += ''
$lines += '## Missing Gates'
$lines += ''
if ($missing.Count -eq 0) { $lines += '- None' } else { $missing | ForEach-Object { $lines += "- $_" } }
$lines += ''
$lines += "- analyticsUploadEnabled: $($evidence.analyticsUploadEnabled)"
$lines += "- analyticsContractApproved: $($evidence.analyticsContractApproved)"
$lines | Set-Content -Encoding utf8 docs/research/phase1_gate_report.md
Write-Host "Phase 1 gate: $status"
if ($status -eq 'BLOCKED') { Write-Host "Missing: $($missing -join ', ')" }
```

- [ ] **Step 3: Run the gate before marking evidence complete**

Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-phase1-gate.ps1`

Expected: `Phase 1 gate: BLOCKED` until real provider, iPhone, and physical evidence exists. Confirm that `docs/research/phase1_gate_report.md` names every missing gate instead of claiming success.

- [ ] **Step 4: Wire repeatable checks into the existing harness and CI**

Add this step after Checkout in `.github/workflows/harness-smoke.yml`:

```yaml
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Verify project contracts and spikes
        shell: pwsh
        run: npm run verify

      - name: Validate provider matrix schema
        shell: pwsh
        run: node scripts/validate-provider-matrix.js
```

Add these required check objects to the `checks` array in `harness/pipeline.json`:

```json
{
  "name": "Node contract and spike tests",
  "command": "npm test",
  "required": true,
  "whenPathExists": ["package.json"]
},
{
  "name": "Provider matrix schema",
  "command": "node scripts/validate-provider-matrix.js",
  "required": true,
  "whenPathExists": ["research/provider-capabilities.json"]
}
```

Keep the full Phase 1 gate script manual because real-device and physical evidence cannot be regenerated on a headless GitHub runner.

- [ ] **Step 5: Re-run all automated verification**

Run: `npm run verify`

Expected: all v0.1 regression tests, vNext contract tests, recommendation tests, geometry tests, physical-state tests, and the prototype contract checker pass.

Run: `node scripts/validate-provider-matrix.js`

Expected: the matrix schema passes independently of whether the evidence gate is `PASS` or `BLOCKED`.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit the gate and CI integration**

```powershell
git add research/phase1-evidence.json scripts/run-phase1-gate.ps1 docs/research/phase1_gate_report.md .github/workflows/harness-smoke.yml harness/pipeline.json
git commit -m "ci: add reproducible phase one gate"
```

---

## Execution Boundary

Stop after this plan and review the generated Phase 1 gate report. Write separate implementation plans for the recommendation service, integrated iOS navigation, BLE/wired physical prototype, and Study A only after their corresponding feasibility gates produce real evidence. A `BLOCKED` report is not a failed plan; it is the correct result when a provider, device, legal, or physical dependency remains unproven.
