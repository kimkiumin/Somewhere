"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stateApi = require("./state.js");

function validConstraints() {
  return {
    category: "restaurant",
    maxWalkMinutes: 20,
    budget: null,
    dietary: [],
    accessibility: [],
    disclosure: "standard",
  };
}

test("one start action moves valid constraints directly into finding", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const finding = stateApi.reduce(initial, {
    type: "START",
    constraints: validConstraints(),
  });

  assert.equal(finding.phase, "finding");
  assert.equal(finding.committed, true);
  assert.equal(finding.destination, null);
});

test("invalid constraints remain editable and identify exact fields", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const unchanged = stateApi.reduce(initial, {
    type: "START",
    constraints: { ...validConstraints(), maxWalkMinutes: 0 },
  });

  assert.equal(unchanged.phase, "constraints");
  assert.deepEqual(unchanged.errors, {
    maxWalkMinutes: "?꾨낫 ?쒓컙? 1遺??댁긽?댁뼱???⑸땲??",
  });
  assert.equal(unchanged.constraints.maxWalkMinutes, 0);
});

test("finding success begins guidance without a ready or second commit state", () => {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: {
      id: "fixture-1",
      name: "hidden restaurant",
      address: "Seoul test road 1",
      building: "Test building",
      floorUnit: "2F",
      entrance: "East entrance",
      menu: "noodles",
      priceBand: "mid",
    },
    route: { id: "route-1", distanceM: 850, bearingDeg: 40 },
  });

  assert.equal(following.phase, "following");
  assert.equal(following.committed, true);
  assert.equal(stateApi.PHASES.includes("ready"), false);
  assert.equal(stateApi.PHASES.includes("committed"), false);
});
