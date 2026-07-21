"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { guidanceConfidence } = require("./confidence.js");

function validInput(overrides = {}) {
  return {
    nowMs: 10_000,
    bearingTimestampMs: 9_000,
    maxAgeMs: 3_000,
    routeValid: true,
    locationAccuracyM: 10,
    maxLocationAccuracyM: 35,
    physicalHeadingDeg: 350,
    headingAccuracyDeg: 5,
    maxHeadingAccuracyDeg: 20,
    magneticallyDisturbed: false,
    recoveryState: "ready",
    bearingFreshlyRecomputed: true,
    ...overrides,
  };
}

test("fresh route, location, and heading data is trusted", () => {
  assert.deepEqual(guidanceConfidence(validInput()), {
    trusted: true,
    reasonCodes: [],
  });
});

test("stale bearing has an explicit reason code", () => {
  assert.deepEqual(
    guidanceConfidence(validInput({ bearingTimestampMs: 4_000 })),
    { trusted: false, reasonCodes: ["stale_bearing"] },
  );
});

test("invalid and future timestamps fail closed", () => {
  for (const overrides of [
    { nowMs: NaN },
    { nowMs: -1 },
    { bearingTimestampMs: Infinity },
    { bearingTimestampMs: -1 },
    { bearingTimestampMs: 10_001 },
  ]) {
    assert.deepEqual(guidanceConfidence(validInput(overrides)), {
      trusted: false,
      reasonCodes: ["invalid_timestamp"],
    });
  }
});

test("invalid thresholds fail closed", () => {
  for (const overrides of [
    { maxAgeMs: NaN },
    { maxAgeMs: -1 },
    { maxLocationAccuracyM: Infinity },
    { maxLocationAccuracyM: -1 },
    { maxHeadingAccuracyDeg: NaN },
    { maxHeadingAccuracyDeg: -1 },
  ]) {
    assert.deepEqual(guidanceConfidence(validInput(overrides)), {
      trusted: false,
      reasonCodes: ["invalid_threshold"],
    });
  }
});

test("invalid route has an explicit reason code", () => {
  for (const routeValid of [false, null, 1, "true"]) {
    assert.deepEqual(guidanceConfidence(validInput({ routeValid })), {
      trusted: false,
      reasonCodes: ["invalid_route"],
    });
  }
});

test("poor or invalid location accuracy fails closed", () => {
  for (const locationAccuracyM of [36, NaN, Infinity, -1]) {
    assert.deepEqual(
      guidanceConfidence(validInput({ locationAccuracyM })),
      { trusted: false, reasonCodes: ["poor_location_accuracy"] },
    );
  }
});

test("invalid physical heading fails closed", () => {
  for (const physicalHeadingDeg of [NaN, Infinity, -1, 360, null, "350"]) {
    assert.deepEqual(
      guidanceConfidence(validInput({ physicalHeadingDeg })),
      { trusted: false, reasonCodes: ["invalid_heading"] },
    );
  }
});

test("invalid or disturbed heading accuracy has an explicit reason", () => {
  for (const overrides of [
    { headingAccuracyDeg: NaN },
    { headingAccuracyDeg: -1 },
    { headingAccuracyDeg: 21 },
    { magneticallyDisturbed: true },
  ]) {
    assert.deepEqual(guidanceConfidence(validInput(overrides)), {
      trusted: false,
      reasonCodes: ["magnetic_disturbance"],
    });
  }
});

test("reconnect and recompute states remain untrusted", () => {
  assert.deepEqual(
    guidanceConfidence(
      validInput({
        recoveryState: "reconnecting",
        bearingFreshlyRecomputed: false,
      }),
    ),
    {
      trusted: false,
      reasonCodes: ["reconnect_in_progress", "recompute_required"],
    },
  );
  assert.deepEqual(
    guidanceConfidence(
      validInput({
        recoveryState: "recomputing",
        bearingFreshlyRecomputed: false,
      }),
    ),
    { trusted: false, reasonCodes: ["recompute_required"] },
  );
  assert.deepEqual(
    guidanceConfidence(validInput({ bearingFreshlyRecomputed: false })),
    { trusted: false, reasonCodes: ["recompute_required"] },
  );
});

test("invalid recovery state fails closed", () => {
  for (const recoveryState of [undefined, null, "connected"]) {
    assert.deepEqual(guidanceConfidence(validInput({ recoveryState })), {
      trusted: false,
      reasonCodes: ["invalid_recovery_state"],
    });
  }
});

test("confidence reports every simultaneous reason in stable order", () => {
  assert.deepEqual(
    guidanceConfidence(
      validInput({
        bearingTimestampMs: 4_000,
        routeValid: false,
        locationAccuracyM: 50,
        physicalHeadingDeg: NaN,
        recoveryState: "reconnecting",
        bearingFreshlyRecomputed: false,
      }),
    ),
    {
      trusted: false,
      reasonCodes: [
        "stale_bearing",
        "invalid_route",
        "poor_location_accuracy",
        "invalid_heading",
        "reconnect_in_progress",
        "recompute_required",
      ],
    },
  );
});
