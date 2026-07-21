"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { bearingDelta, trueBearing } = require("./geometry.js");

test("bearing delta wraps across north", () => {
  assert.equal(bearingDelta(5, 355), 10);
  assert.equal(bearingDelta(355, 5), -10);
});

test("bearing delta fails closed for invalid bearings and headings", () => {
  for (const invalid of [NaN, Infinity, -1, 360, null, "5"]) {
    assert.equal(bearingDelta(invalid, 0), null);
    assert.equal(bearingDelta(0, invalid), null);
  }
});

test("true bearing points east for a route look-ahead point", () => {
  const value = trueBearing(
    { latitude: 37, longitude: 126 },
    { latitude: 37, longitude: 127 },
  );

  assert.ok(value > 89 && value < 91);
});

test("true bearing fails closed for invalid coordinates", () => {
  const valid = { latitude: 37, longitude: 126 };
  const invalidCoordinates = [
    null,
    {},
    { latitude: NaN, longitude: 126 },
    { latitude: 91, longitude: 126 },
    { latitude: -91, longitude: 126 },
    { latitude: 37, longitude: 181 },
    { latitude: 37, longitude: -181 },
    { latitude: "37", longitude: 126 },
  ];

  for (const invalid of invalidCoordinates) {
    assert.equal(trueBearing(invalid, valid), null);
    assert.equal(trueBearing(valid, invalid), null);
  }
});

test("true bearing does not substitute a destination for an unusable look-ahead point", () => {
  const current = { latitude: 37, longitude: 126 };
  const identicalLookAhead = {
    latitude: 37,
    longitude: 126,
    destination: { latitude: 37, longitude: 127 },
  };

  assert.equal(trueBearing(current, identicalLookAhead), null);
  assert.equal(
    trueBearing(current, { latitude: -37, longitude: -54 }),
    null,
  );
});

test("geometry exposes the CommonJS API as a browser global", () => {
  assert.equal(globalThis.SomewhereGeometry.bearingDelta, bearingDelta);
  assert.equal(globalThis.SomewhereGeometry.trueBearing, trueBearing);
});
