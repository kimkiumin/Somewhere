"use strict";

function meritResult(claim, evidenceId) {
  return {
    candidate_id: "fixture:venue-1",
    merits: [
      {
        type: "menu",
        claim,
        evidence_ids: [evidenceId],
        confidence: "high",
      },
    ],
    critical_weaknesses: [],
    unknowns: [],
    verdict: "pass",
  };
}

function weaknessResult(claim, evidenceId) {
  return {
    candidate_id: "fixture:venue-1",
    merits: [],
    critical_weaknesses: [{ claim, evidence_ids: [evidenceId] }],
    unknowns: [],
    verdict: "fail",
  };
}

function evidence(claim, overrides = {}) {
  return {
    current: true,
    conflict: false,
    distinctive: false,
    supported_claims: [claim],
    ...overrides,
  };
}

function adjudications(disposition, dissent) {
  const values = [
    { adjudicatorId: "reviewer-a", disposition },
    { adjudicatorId: "reviewer-b", disposition },
  ];
  if (dissent) values.push({ adjudicatorId: "reviewer-c", disposition: dissent });
  return values;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

const cases = [
  {
    id: "valid-pass",
    provider: "kakao",
    field: "merit",
    criticality: "noncritical",
    expectedDisposition: "pass",
    adjudications: adjudications("pass"),
    benchmark: {},
    evidenceById: { m1: evidence("broad noodle category") },
    context: {},
    result: meritResult("broad noodle category", "m1"),
  },
  {
    id: "valid-fail",
    provider: "naver",
    field: "critical_weakness",
    criticality: "critical",
    expectedDisposition: "fail",
    adjudications: adjudications("fail"),
    benchmark: { criticalWeaknessRequired: true },
    evidenceById: { w1: evidence("documented severe access barrier") },
    context: {},
    result: weaknessResult("documented severe access barrier", "w1"),
  },
  {
    id: "insufficient-evidence",
    provider: "tmap",
    field: "atmosphere",
    criticality: "noncritical",
    expectedDisposition: "insufficient_evidence",
    adjudications: adjudications("insufficient_evidence"),
    benchmark: {},
    evidenceById: {},
    context: {},
    result: {
      candidate_id: "fixture:venue-1",
      merits: [],
      critical_weaknesses: [],
      unknowns: ["atmosphere"],
      verdict: "insufficient_evidence",
    },
  },
  {
    id: "duplicate-canonical-entity",
    provider: "kakao",
    field: "canonical_entity",
    criticality: "critical",
    expectedDisposition: "reject",
    adjudications: adjudications("reject"),
    benchmark: {},
    evidenceById: { m1: evidence("broad noodle category") },
    context: { duplicateCanonicalEntity: true },
    result: meritResult("broad noodle category", "m1"),
  },
  {
    id: "stale-hours",
    provider: "naver",
    field: "opening_hours",
    criticality: "critical",
    expectedDisposition: "reject",
    adjudications: adjudications("reject"),
    benchmark: {},
    evidenceById: {
      h1: evidence("open at predicted arrival", { current: false }),
    },
    context: {},
    result: meritResult("open at predicted arrival", "h1"),
  },
  {
    id: "conflicting-sources",
    provider: "tmap",
    field: "opening_hours",
    criticality: "critical",
    expectedDisposition: "insufficient_evidence",
    adjudications: adjudications("insufficient_evidence", "reject"),
    benchmark: {},
    evidenceById: {
      h1: evidence("open at predicted arrival", { conflict: true }),
    },
    context: {},
    result: {
      candidate_id: "fixture:venue-1",
      merits: [],
      critical_weaknesses: [],
      unknowns: ["opening_hours"],
      verdict: "insufficient_evidence",
    },
  },
  {
    id: "unsupported-claim",
    provider: "kakao",
    field: "merit",
    criticality: "critical",
    expectedDisposition: "reject",
    adjudications: adjudications("reject"),
    benchmark: {},
    evidenceById: {},
    context: {},
    result: meritResult("excellent taste", "missing"),
  },
  {
    id: "distinctive-menu-leakage",
    provider: "naver",
    field: "representative_menu",
    criticality: "critical",
    expectedDisposition: "reject",
    adjudications: adjudications("reject"),
    benchmark: {},
    evidenceById: {
      m1: evidence("venue-signature moon-shaped dumpling", { distinctive: true }),
    },
    context: {},
    result: meritResult("venue-signature moon-shaped dumpling", "m1"),
  },
  {
    id: "close-before-arrival",
    provider: "tmap",
    field: "opening_hours",
    criticality: "critical",
    expectedDisposition: "fail",
    adjudications: adjudications("fail"),
    benchmark: { criticalWeaknessRequired: true },
    evidenceById: { h1: evidence("closes before predicted arrival") },
    context: { openAtEtaWithBuffer: false },
    result: weaknessResult("closes before predicted arrival", "h1"),
  },
  {
    id: "malformed-output",
    provider: "kakao",
    field: "schema",
    criticality: "noncritical",
    expectedDisposition: "reject",
    adjudications: adjudications("reject"),
    benchmark: {},
    evidenceById: {},
    context: {},
    result: { answer: "looks good" },
  },
  {
    id: "route-failure",
    provider: "naver",
    field: "route",
    criticality: "critical",
    expectedDisposition: "fail",
    adjudications: adjudications("fail"),
    benchmark: { criticalWeaknessRequired: true },
    evidenceById: { r1: evidence("walking route unavailable") },
    context: { routeFeasible: false },
    result: weaknessResult("walking route unavailable", "r1"),
  },
  {
    id: "critical-weakness-miss",
    provider: "tmap",
    field: "critical_condition",
    criticality: "critical",
    expectedDisposition: "fail",
    adjudications: adjudications("fail"),
    benchmark: { criticalWeaknessRequired: true },
    evidenceById: { m1: evidence("broad noodle category") },
    context: { criticalConditionsSatisfied: false },
    result: meritResult("broad noodle category", "m1"),
  },
];

module.exports = deepFreeze(cases);
