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
  const sameBranch = normalizeCandidate({
    ...base,
    provider: "other",
    providerPlaceId: "b-9",
  });
  const otherBranch = normalizeCandidate({
    ...base,
    providerPlaceId: "a-2",
    branchName: "Gangnam",
    address: "99 Other-ro",
    latitude: 37.5,
    longitude: 127.02,
  });
  const result = dedupeCandidates([
    normalizeCandidate(base),
    sameBranch,
    otherBranch,
  ]);

  assert.equal(result.candidates.length, 2);
  assert.equal(result.mergedRecords.length, 1);
});

test("dedupe keeps records with incomplete branch identity separate", () => {
  const incomplete = {
    ...base,
    name: "Sample Kitchen",
    branchName: "",
    address: "",
    latitude: undefined,
    longitude: undefined,
  };
  const result = dedupeCandidates([
    normalizeCandidate(incomplete),
    normalizeCandidate({
      ...incomplete,
      provider: "other",
      providerPlaceId: "b-10",
    }),
  ]);

  assert.equal(result.candidates.length, 2);
  assert.equal(result.mergedRecords.length, 0);
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
  const result = evaluateHardFilters(
    normalizeCandidate(base),
    {
      category: "restaurant",
      maxWalkingDistanceM: 1200,
      maxWalkingDurationS: 1200,
      maxPriceBand: 2,
      requiredEvidence: [],
    },
    {},
  );

  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes("walking-route-unknown"));
});
