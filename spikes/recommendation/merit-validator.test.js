"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateMeritResult,
  scoreBenchmark,
  evaluateBenchmarkGate,
} = require("./merit-validator.js");
const cases = require("./benchmark-cases.js");
const manifest = require("./benchmark-manifest.json");

function supportedEvidence(claim = "broad noodle category") {
  return {
    e1: {
      current: true,
      conflict: false,
      distinctive: false,
      supported_claims: [claim],
    },
  };
}

function passResult(claim = "broad noodle category") {
  return {
    candidate_id: "fixture:venue-1",
    merits: [
      {
        type: "menu",
        claim,
        evidence_ids: ["e1"],
        confidence: "high",
      },
    ],
    critical_weaknesses: [],
    unknowns: [],
    verdict: "pass",
  };
}

test("manifest freezes every benchmark dependency and disables live recommendations", () => {
  assert.equal(manifest.schemaVersion, "merit-result-schema-v1");
  assert.equal(manifest.datasetVersion, "frozen-human-adjudicated-v1");
  assert.equal(manifest.modelFixtureVersion, "deterministic-model-fixture-v1");
  assert.equal(manifest.promptVersion, "merit-qualification-prompt-v1");
  assert.equal(manifest.evidencePolicyVersion, "evidence-policy-v1");
  assert.equal(manifest.validatorVersion, "merit-validator-v2");
  assert.equal(manifest.fallback, "deterministic_or_manually_verified_pilot");
  assert.equal(manifest.liveRecommendationEnabled, false);

  assert.deepEqual(Object.keys(manifest.thresholds).sort(), [
    "adjudicatorDisagreementRate",
    "criticalConditionFalsePassRate",
    "criticalWeaknessMissRate",
    "deterministicValidatorRejectionRate",
    "insufficientEvidenceHandlingRate",
    "unsupportedClaimRate",
  ]);
  for (const threshold of Object.values(manifest.thresholds)) {
    assert.ok(["maximum", "minimum"].includes(threshold.operator));
    assert.equal(typeof threshold.value, "number");
  }
  assert.deepEqual(manifest.thresholds.unsupportedClaimRate, {
    operator: "maximum",
    value: 0,
  });
  assert.deepEqual(manifest.thresholds.criticalWeaknessMissRate, {
    operator: "maximum",
    value: 0,
  });
});

test("fixture set is frozen, complete, and independently adjudicated", () => {
  assert.deepEqual(
    cases.map((item) => item.id),
    [
      "valid-pass",
      "valid-fail",
      "insufficient-evidence",
      "duplicate-canonical-entity",
      "stale-hours",
      "conflicting-sources",
      "unsupported-claim",
      "distinctive-menu-leakage",
      "close-before-arrival",
      "malformed-output",
      "route-failure",
      "critical-weakness-miss",
    ],
  );
  assert.ok(Object.isFrozen(cases));

  for (const item of cases) {
    assert.equal(typeof item.provider, "string", item.id);
    assert.equal(typeof item.field, "string", item.id);
    assert.ok(["noncritical", "critical"].includes(item.criticality), item.id);
    assert.ok(
      ["pass", "fail", "insufficient_evidence", "reject"].includes(
        item.expectedDisposition,
      ),
      item.id,
    );
    assert.ok(item.adjudications.length >= 2, item.id);
    for (const adjudication of item.adjudications) {
      assert.equal(typeof adjudication.adjudicatorId, "string", item.id);
      assert.ok(
        ["pass", "fail", "insufficient_evidence", "reject"].includes(
          adjudication.disposition,
        ),
        item.id,
      );
    }
  }
});

test("frozen cases resolve to their adjudicated dispositions", () => {
  for (const item of cases) {
    const validation = validateMeritResult(
      item.result,
      item.evidenceById,
      item.context,
    );
    assert.equal(validation.disposition, item.expectedDisposition, item.id);
  }
});

test("valid pass, fail, and insufficient-evidence DTOs remain distinct", () => {
  for (const id of ["valid-pass", "valid-fail", "insufficient-evidence"]) {
    const item = cases.find((entry) => entry.id === id);
    const validation = validateMeritResult(
      item.result,
      item.evidenceById,
      item.context,
    );

    assert.equal(validation.accepted, true, id);
    assert.equal(validation.disposition, item.expectedDisposition, id);
    assert.deepEqual(validation.errors, [], id);
  }
});

test("untrusted output rejects inherited, accessor, prototype, and sparse values", () => {
  const inherited = Object.create(passResult());
  const accessor = { ...passResult() };
  Object.defineProperty(accessor, "verdict", {
    enumerable: true,
    get() {
      throw new Error("must not execute model accessors");
    },
  });
  const prototypeValue = { ...passResult() };
  prototypeValue.merits[0] = Object.assign(
    Object.create({ hidden: "prototype value" }),
    prototypeValue.merits[0],
  );
  const sparse = { ...passResult(), merits: new Array(1) };

  for (const result of [inherited, accessor, prototypeValue, sparse]) {
    const validation = validateMeritResult(result, supportedEvidence());
    assert.equal(validation.accepted, false);
    assert.equal(validation.disposition, "reject");
    assert.ok(validation.errors.includes("malformed-dto"));
  }
});

test("evidence lookup never accepts inherited or accessor records", () => {
  const inheritedEvidence = Object.create(supportedEvidence());
  const accessorEvidence = {};
  Object.defineProperty(accessorEvidence, "e1", {
    enumerable: true,
    get() {
      throw new Error("must not execute evidence accessors");
    },
  });

  for (const evidenceById of [inheritedEvidence, accessorEvidence]) {
    const validation = validateMeritResult(passResult(), evidenceById);
    assert.equal(validation.accepted, false);
    assert.ok(validation.errors.includes("unsupported-evidence:e1"));
  }
});

test("evidence IDs must exist and be current, nonconflicting, and claim-supporting", () => {
  const scenarios = [
    [{}, "unsupported-evidence:e1"],
    [{ e1: { ...supportedEvidence().e1, current: false } }, "stale-evidence:e1"],
    [{ e1: { ...supportedEvidence().e1, conflict: true } }, "conflicting-evidence:e1"],
    [supportedEvidence("a different supported claim"), "unsupported-claim:e1"],
    [{ e1: { ...supportedEvidence().e1, distinctive: true } }, "distinctive-claim:e1"],
  ];

  for (const [evidenceById, expectedError] of scenarios) {
    const validation = validateMeritResult(passResult(), evidenceById);
    assert.equal(validation.accepted, false, expectedError);
    assert.ok(validation.errors.includes(expectedError), expectedError);
  }
});

test("malformed schema and unsupported enumerations fail closed", () => {
  const scenarios = [
    { answer: "looks good" },
    { ...passResult(), candidate_id: "" },
    { ...passResult(), verdict: "maybe" },
    {
      ...passResult(),
      merits: [{ ...passResult().merits[0], type: "ranking" }],
    },
    {
      ...passResult(),
      merits: [{ ...passResult().merits[0], confidence: "certain" }],
    },
    { ...passResult(), extra: "model prose" },
  ];

  for (const result of scenarios) {
    const validation = validateMeritResult(result, supportedEvidence());
    assert.equal(validation.accepted, false);
    assert.equal(validation.disposition, "reject");
  }
});

test("a pass cannot override duplicate, route, ETA/opening, or critical-condition failures", () => {
  const gates = [
    ["duplicateCanonicalEntity", true, "duplicate-canonical-entity", "reject"],
    ["routeFeasible", false, "route-failure", "fail"],
    ["openAtEtaWithBuffer", false, "opening-at-eta-failure", "fail"],
    ["criticalConditionsSatisfied", false, "critical-condition-failure", "fail"],
  ];

  for (const [field, value, error, disposition] of gates) {
    const validation = validateMeritResult(passResult(), supportedEvidence(), {
      [field]: value,
    });
    assert.equal(validation.accepted, false, field);
    assert.equal(validation.disposition, disposition, field);
    assert.ok(validation.errors.includes(error), field);
  }
});

test("scoreBenchmark reports explicit totals and provider/field breakdowns", () => {
  const score = scoreBenchmark(cases);

  assert.equal(score.caseCount, 12);
  assert.equal(score.malformedOutputCount, 1);
  assert.equal(score.unsupportedClaimRate, 1 / 9);
  assert.equal(score.unsupportedClaimRateNumerator, 1);
  assert.equal(score.unsupportedClaimRateDenominator, 9);
  assert.equal(score.criticalConditionFalsePassRate, 0);
  assert.equal(score.criticalConditionFalsePassRateNumerator, 0);
  assert.equal(score.criticalConditionFalsePassRateDenominator, 9);
  assert.equal(score.criticalWeaknessMissRate, 0.25);
  assert.equal(score.criticalWeaknessMissRateNumerator, 1);
  assert.equal(score.criticalWeaknessMissRateDenominator, 4);
  assert.equal(score.insufficientEvidenceHandlingRate, 1);
  assert.equal(score.insufficientEvidenceHandlingRateNumerator, 2);
  assert.equal(score.insufficientEvidenceHandlingRateDenominator, 2);
  assert.equal(score.deterministicValidatorRejectionRate, 1);
  assert.equal(score.deterministicValidatorRejectionRateNumerator, 5);
  assert.equal(score.deterministicValidatorRejectionRateDenominator, 5);
  assert.equal(score.adjudicatorDisagreementRate, 1 / 12);
  assert.equal(score.adjudicatorDisagreementRateNumerator, 1);
  assert.equal(score.adjudicatorDisagreementRateDenominator, 12);

  assert.deepEqual(Object.keys(score.byProvider).sort(), ["kakao", "naver", "tmap"]);
  assert.equal(score.byProvider.kakao.caseCount, 4);
  assert.equal(score.byProvider.kakao.unsupportedClaimRate, 1 / 3);
  assert.equal(score.byProvider.kakao.unsupportedClaimRateNumerator, 1);
  assert.equal(score.byProvider.kakao.unsupportedClaimRateDenominator, 3);
  assert.equal(score.byProvider.naver.unsupportedClaimRate, 0);
  assert.equal(score.byProvider.naver.unsupportedClaimRateNumerator, 0);
  assert.equal(score.byProvider.naver.unsupportedClaimRateDenominator, 4);
  assert.equal(score.byProvider.tmap.unsupportedClaimRate, 0);
  assert.equal(score.byProvider.tmap.unsupportedClaimRateNumerator, 0);
  assert.equal(score.byProvider.tmap.unsupportedClaimRateDenominator, 2);
  assert.equal(score.byProvider.naver.criticalWeaknessMissRateDenominator, 2);
  assert.equal(score.byProvider.tmap.insufficientEvidenceHandlingRateDenominator, 2);
  assert.equal(score.byField.merit.unsupportedClaimRate, 1 / 2);
  assert.equal(score.byField.merit.unsupportedClaimRateNumerator, 1);
  assert.equal(score.byField.merit.unsupportedClaimRateDenominator, 2);
  assert.equal(score.byField.representative_menu.unsupportedClaimRate, 0);
  assert.equal(
    score.byField.representative_menu.unsupportedClaimRateNumerator,
    0,
  );
  assert.equal(
    score.byField.representative_menu.unsupportedClaimRateDenominator,
    1,
  );
  assert.equal(score.byField.route.caseCount, 1);
  assert.equal(score.byField.route.criticalConditionFalsePassRateDenominator, 1);
  assert.equal(score.byField.schema.malformedOutputCount, 1);
});

test("zero-denominator slices report null rates with explicit zero counts", () => {
  const score = scoreBenchmark(cases);
  const slice = score.byField.schema;

  assert.equal(slice.insufficientEvidenceHandlingRate, null);
  assert.equal(slice.insufficientEvidenceHandlingRateNumerator, 0);
  assert.equal(slice.insufficientEvidenceHandlingRateDenominator, 0);
});

test("evaluateBenchmarkGate compares every threshold and chooses the frozen fallback", () => {
  const score = scoreBenchmark(cases);
  const frozenGate = evaluateBenchmarkGate(score, manifest);

  assert.equal(frozenGate.passed, false);
  assert.deepEqual(frozenGate.failedGates, [
    "unsupportedClaimRate",
    "criticalWeaknessMissRate",
  ]);
  assert.equal(frozenGate.liveRecommendationEnabled, false);
  assert.equal(frozenGate.selectedPath, "deterministic_or_manually_verified_pilot");

  const failingScore = {
    ...score,
    insufficientEvidenceHandlingRate:
      manifest.thresholds.insufficientEvidenceHandlingRate.value - 0.01,
  };
  const failingGate = evaluateBenchmarkGate(failingScore, {
    ...manifest,
    liveRecommendationEnabled: true,
  });

  assert.equal(failingGate.passed, false);
  assert.deepEqual(failingGate.failedGates, [
    "unsupportedClaimRate",
    "criticalWeaknessMissRate",
    "insufficientEvidenceHandlingRate",
  ]);
  assert.equal(failingGate.selectedPath, manifest.fallback);
});
