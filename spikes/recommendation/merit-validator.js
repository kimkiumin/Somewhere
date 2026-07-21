"use strict";

const ROOT_KEYS = [
  "candidate_id",
  "merits",
  "critical_weaknesses",
  "unknowns",
  "verdict",
];
const MERIT_KEYS = ["type", "claim", "evidence_ids", "confidence"];
const WEAKNESS_KEYS = ["claim", "evidence_ids"];
const VERDICTS = new Set(["pass", "fail", "insufficient_evidence"]);
const MERIT_TYPES = new Set(["menu", "taste", "atmosphere", "distinctiveness"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const RATE_NAMES = [
  "unsupportedClaimRate",
  "criticalConditionFalsePassRate",
  "criticalWeaknessMissRate",
  "insufficientEvidenceHandlingRate",
  "deterministicValidatorRejectionRate",
  "adjudicatorDisagreementRate",
];

function hasExactKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function cloneJsonDto(value, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite number");
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("not a JSON DTO");
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("array prototype");
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes("length")) {
      throw new TypeError("sparse or extended array");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("array symbol");

    ancestors.add(value);
    const clone = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError("array accessor");
      }
      clone.push(cloneJsonDto(descriptor.value, ancestors));
    }
    ancestors.delete(value);
    return clone;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("object prototype");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("object symbol");

  ancestors.add(value);
  const clone = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new TypeError("object accessor");
    }
    Object.defineProperty(clone, key, {
      value: cloneJsonDto(descriptor.value, ancestors),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  ancestors.delete(value);
  return clone;
}

function isNonemptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isStringArray(value, requireNonempty = false) {
  return (
    Array.isArray(value) &&
    (!requireNonempty || value.length > 0) &&
    value.every(isNonemptyString) &&
    new Set(value).size === value.length
  );
}

function validateSchema(result) {
  const errors = [];
  if (!hasExactKeys(result, ROOT_KEYS)) return ["malformed-schema"];
  if (!isNonemptyString(result.candidate_id)) errors.push("malformed-candidate-id");
  if (!VERDICTS.has(result.verdict)) errors.push("malformed-verdict");
  if (!Array.isArray(result.merits)) errors.push("malformed-merits");
  if (!Array.isArray(result.critical_weaknesses)) errors.push("malformed-critical-weaknesses");
  if (!isStringArray(result.unknowns)) errors.push("malformed-unknowns");
  if (errors.length > 0) return errors;

  for (const merit of result.merits) {
    if (
      merit === null ||
      typeof merit !== "object" ||
      !hasExactKeys(merit, MERIT_KEYS) ||
      !MERIT_TYPES.has(merit.type) ||
      !isNonemptyString(merit.claim) ||
      !isStringArray(merit.evidence_ids, true) ||
      !CONFIDENCES.has(merit.confidence)
    ) {
      errors.push("malformed-merit");
    }
  }

  for (const weakness of result.critical_weaknesses) {
    if (
      weakness === null ||
      typeof weakness !== "object" ||
      !hasExactKeys(weakness, WEAKNESS_KEYS) ||
      !isNonemptyString(weakness.claim) ||
      !isStringArray(weakness.evidence_ids, true)
    ) {
      errors.push("malformed-critical-weakness");
    }
  }

  if (result.verdict === "pass" && result.merits.length === 0) {
    errors.push("pass-without-merit");
  }
  if (result.verdict === "pass" && result.critical_weaknesses.length > 0) {
    errors.push("pass-with-critical-weakness");
  }
  if (result.verdict === "fail" && result.critical_weaknesses.length === 0) {
    errors.push("fail-without-critical-weakness");
  }
  if (
    result.verdict === "insufficient_evidence" &&
    (result.merits.length > 0 ||
      result.critical_weaknesses.length > 0 ||
      result.unknowns.length === 0)
  ) {
    errors.push("malformed-insufficient-evidence");
  }

  return [...new Set(errors)];
}

function evidenceRecord(evidenceById, id) {
  if (evidenceById === null || typeof evidenceById !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(evidenceById, id);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
  try {
    const record = cloneJsonDto(descriptor.value);
    return record && typeof record === "object" && !Array.isArray(record) ? record : null;
  } catch {
    return null;
  }
}

function validateEvidence(result, evidenceById) {
  const errors = [];
  const claims = [...result.merits, ...result.critical_weaknesses];

  for (const item of claims) {
    for (const id of item.evidence_ids) {
      const record = evidenceRecord(evidenceById, id);
      if (!record) {
        errors.push(`unsupported-evidence:${id}`);
        continue;
      }
      if (record.current !== true) errors.push(`stale-evidence:${id}`);
      if (record.conflict === true) errors.push(`conflicting-evidence:${id}`);
      if (!Array.isArray(record.supported_claims) || !record.supported_claims.includes(item.claim)) {
        errors.push(`unsupported-claim:${id}`);
      }
      if (record.distinctive === true) errors.push(`distinctive-claim:${id}`);
    }
  }

  return [...new Set(errors)];
}

function ownDataValue(value, key) {
  if (value === null || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function deterministicDisposition(resultDisposition, context, errors) {
  if (ownDataValue(context, "duplicateCanonicalEntity") === true) {
    errors.push("duplicate-canonical-entity");
    return "reject";
  }

  let failed = false;
  for (const [field, error] of [
    ["routeFeasible", "route-failure"],
    ["openAtEtaWithBuffer", "opening-at-eta-failure"],
    ["criticalConditionsSatisfied", "critical-condition-failure"],
  ]) {
    if (ownDataValue(context, field) === false) {
      errors.push(error);
      failed = true;
    }
  }
  return failed ? "fail" : resultDisposition;
}

function reject(errors) {
  return { accepted: false, disposition: "reject", errors: [...new Set(errors)] };
}

function validateMeritResult(result, evidenceById, context = {}) {
  let snapshot;
  try {
    snapshot = cloneJsonDto(result);
  } catch {
    return reject(["malformed-dto"]);
  }

  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return reject(["malformed-schema"]);
  }

  const schemaErrors = validateSchema(snapshot);
  if (schemaErrors.length > 0) return reject(schemaErrors);

  const evidenceErrors = validateEvidence(snapshot, evidenceById);
  if (evidenceErrors.length > 0) return reject(evidenceErrors);

  const errors = [];
  const disposition = deterministicDisposition(snapshot.verdict, context, errors);
  return {
    accepted:
      disposition !== "reject" &&
      !(snapshot.verdict === "pass" && disposition !== "pass"),
    disposition,
    errors: [...new Set(errors)],
  };
}

function rawHasCriticalWeakness(result) {
  if (result === null || typeof result !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(result, "critical_weaknesses");
  return Boolean(descriptor && "value" in descriptor && Array.isArray(descriptor.value) && descriptor.value.length > 0);
}

function rawClaims(result) {
  let snapshot;
  try {
    snapshot = cloneJsonDto(result);
  } catch {
    return [];
  }
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [];
  }

  const claims = [];
  for (const key of ["merits", "critical_weaknesses"]) {
    if (!Array.isArray(snapshot[key])) continue;
    for (const item of snapshot[key]) {
      if (
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        isNonemptyString(item.claim)
      ) {
        claims.push({
          claim: item.claim,
          evidenceIds: Array.isArray(item.evidence_ids)
            ? item.evidence_ids.filter(isNonemptyString)
            : [],
        });
      }
    }
  }
  return claims;
}

function hasSourceSupport(claim, evidenceIds, evidenceById) {
  return evidenceIds.some((id) => {
    const record = evidenceRecord(evidenceById, id);
    return (
      record !== null &&
      Array.isArray(record.supported_claims) &&
      record.supported_claims.includes(claim)
    );
  });
}

function hasAdjudicatorDisagreement(item) {
  return new Set(item.adjudications.map((entry) => entry.disposition)).size > 1;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function aggregate(cases, evaluations) {
  const counts = {
    unsupportedClaimRate: [0, 0],
    criticalConditionFalsePassRate: [0, 0],
    criticalWeaknessMissRate: [0, 0],
    insufficientEvidenceHandlingRate: [0, 0],
    deterministicValidatorRejectionRate: [0, 0],
    adjudicatorDisagreementRate: [0, 0],
  };
  let malformedOutputCount = 0;

  for (const item of cases) {
    const claims = rawClaims(item.result);
    counts.unsupportedClaimRate[1] += claims.length;
    for (const claim of claims) {
      if (!hasSourceSupport(claim.claim, claim.evidenceIds, item.evidenceById)) {
        counts.unsupportedClaimRate[0] += 1;
      }
    }

    const evaluation = evaluations.get(item);
    const disposition = evaluation.disposition;
    if (evaluation.errors.some((error) => error.startsWith("malformed-"))) {
      malformedOutputCount += 1;
    }
    if (item.criticality === "critical" && item.expectedDisposition !== "pass") {
      counts.criticalConditionFalsePassRate[1] += 1;
      if (disposition === "pass") counts.criticalConditionFalsePassRate[0] += 1;
    }
    if (item.benchmark.criticalWeaknessRequired === true) {
      counts.criticalWeaknessMissRate[1] += 1;
      if (!rawHasCriticalWeakness(item.result)) counts.criticalWeaknessMissRate[0] += 1;
    }
    if (item.expectedDisposition === "insufficient_evidence") {
      counts.insufficientEvidenceHandlingRate[1] += 1;
      if (disposition === "insufficient_evidence") counts.insufficientEvidenceHandlingRate[0] += 1;
    }
    if (item.expectedDisposition === "reject") {
      counts.deterministicValidatorRejectionRate[1] += 1;
      if (disposition === "reject") counts.deterministicValidatorRejectionRate[0] += 1;
    }
    counts.adjudicatorDisagreementRate[1] += 1;
    if (hasAdjudicatorDisagreement(item)) counts.adjudicatorDisagreementRate[0] += 1;
  }

  const result = { caseCount: cases.length, malformedOutputCount };
  for (const name of RATE_NAMES) {
    const [numerator, denominator] = counts[name];
    result[name] = rate(numerator, denominator);
    result[`${name}Numerator`] = numerator;
    result[`${name}Denominator`] = denominator;
  }
  return result;
}

function groupedScores(cases, evaluations, key) {
  const groups = {};
  for (const item of cases) {
    if (!Object.hasOwn(groups, item[key])) groups[item[key]] = [];
    groups[item[key]].push(item);
  }
  return Object.fromEntries(
    Object.entries(groups).map(([name, groupCases]) => [
      name,
      aggregate(groupCases, evaluations),
    ]),
  );
}

function scoreBenchmark(cases) {
  if (!Array.isArray(cases)) throw new TypeError("cases must be an array");
  const evaluations = new Map();
  for (const item of cases) {
    evaluations.set(
      item,
      validateMeritResult(item.result, item.evidenceById, item.context),
    );
  }

  return {
    ...aggregate(cases, evaluations),
    byProvider: groupedScores(cases, evaluations, "provider"),
    byField: groupedScores(cases, evaluations, "field"),
  };
}

function evaluateBenchmarkGate(scores, manifest) {
  const failedGates = [];
  for (const [name, threshold] of Object.entries(manifest.thresholds)) {
    const score = scores[name];
    const passes =
      typeof score === "number" &&
      Number.isFinite(score) &&
      ((threshold.operator === "maximum" && score <= threshold.value) ||
        (threshold.operator === "minimum" && score >= threshold.value));
    if (!passes) failedGates.push(name);
  }

  const passed = failedGates.length === 0;
  const liveRecommendationEnabled = manifest.liveRecommendationEnabled === true;
  return {
    passed,
    failedGates,
    liveRecommendationEnabled,
    selectedPath:
      passed && liveRecommendationEnabled ? "live_recommendation" : manifest.fallback,
  };
}

module.exports = {
  validateMeritResult,
  scoreBenchmark,
  evaluateBenchmarkGate,
};
