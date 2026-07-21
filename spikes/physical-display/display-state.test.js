"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveDisplayState } = require("./display-state.js");

function pointingInput(overrides = {}) {
  return {
    sessionState: "following",
    networkKind: "wifi",
    bleConnected: true,
    bearingTrusted: true,
    bearingFreshlyRecomputed: true,
    recoveryState: "ready",
    absoluteRouteBearingDeg: 30,
    physicalHeadingDeg: 350,
    ...overrides,
  };
}

test("physical heading determines the relative needle", () => {
  const state = deriveDisplayState(
    pointingInput({ iPhoneHeadingDeg: 10 }),
  );

  assert.equal(state.mode, "pointing");
  assert.equal(state.needleVisible, true);
  assert.equal(state.needleMotion, "directional");
  assert.equal(state.relativeBearingDeg, 40);
  assert.deepEqual(state.statusChannels, {
    network: "wifi",
    bluetooth: "connected",
  });
});

test("cellular and Bluetooth use conventional semantic status channels", () => {
  const state = deriveDisplayState(pointingInput({ networkKind: "cellular" }));

  assert.equal(state.mode, "pointing");
  assert.deepEqual(state.statusChannels, {
    network: "cellular",
    bluetooth: "connected",
  });
});

test("an iPhone heading cannot substitute for a physical-device heading", () => {
  const state = deriveDisplayState(
    pointingInput({ physicalHeadingDeg: undefined, iPhoneHeadingDeg: 350 }),
  );

  assert.equal(state.mode, "spinning");
  assert.equal(state.relativeBearingDeg, null);
});

test("offline or disconnected display spins without a directional angle", () => {
  for (const overrides of [
    { networkKind: "offline" },
    { bleConnected: false },
  ]) {
    const state = deriveDisplayState(pointingInput(overrides));
    assert.equal(state.mode, "spinning");
    assert.equal(state.needleVisible, true);
    assert.equal(state.needleMotion, "spinning");
    assert.equal(state.relativeBearingDeg, null);
  }

  assert.deepEqual(
    deriveDisplayState(pointingInput({ networkKind: "offline" }))
      .statusChannels,
    { network: "offline", bluetooth: "connected" },
  );
  assert.deepEqual(
    deriveDisplayState(pointingInput({ bleConnected: false })).statusChannels,
    { network: "wifi", bluetooth: "disconnected" },
  );
});

test("stale or low-confidence bearing spins without pointing", () => {
  const state = deriveDisplayState(
    pointingInput({
      bearingTrusted: false,
      guidanceReasonCodes: ["stale_bearing"],
    }),
  );

  assert.equal(state.mode, "spinning");
  assert.equal(state.relativeBearingDeg, null);
});

test("invalid route bearing or physical heading spins without pointing", () => {
  for (const overrides of [
    { absoluteRouteBearingDeg: NaN },
    { absoluteRouteBearingDeg: -1 },
    { absoluteRouteBearingDeg: 360 },
    { physicalHeadingDeg: Infinity },
    { physicalHeadingDeg: -1 },
    { physicalHeadingDeg: 360 },
  ]) {
    const state = deriveDisplayState(pointingInput(overrides));
    assert.equal(state.mode, "spinning");
    assert.equal(state.relativeBearingDeg, null);
  }
});

test("recovery remains non-pointing until trusted data is freshly recomputed", () => {
  for (const overrides of [
    { recoveryState: "reconnecting", bearingFreshlyRecomputed: false },
    { recoveryState: "recomputing", bearingFreshlyRecomputed: false },
    { recoveryState: "ready", bearingFreshlyRecomputed: false },
    { recoveryState: "recomputing", bearingFreshlyRecomputed: true },
  ]) {
    const state = deriveDisplayState(pointingInput(overrides));
    assert.equal(state.mode, "spinning");
    assert.equal(state.relativeBearingDeg, null);
  }

  assert.equal(deriveDisplayState(pointingInput()).mode, "pointing");
});

test("paused or stopped session hides a stationary needle", () => {
  for (const sessionState of ["paused", "stopped"]) {
    const state = deriveDisplayState({
      sessionState,
      networkKind: "offline",
      bleConnected: false,
      bearingTrusted: false,
      bearingFreshlyRecomputed: false,
      recoveryState: "reconnecting",
    });

    assert.equal(state.mode, "paused");
    assert.equal(state.needleVisible, false);
    assert.equal(state.needleMotion, "stationary");
    assert.equal(state.relativeBearingDeg, null);
  }
});

test("invalid connection inputs fail closed without fabricated status", () => {
  const invalidNetwork = deriveDisplayState(
    pointingInput({ networkKind: "ethernet" }),
  );
  const invalidBluetooth = deriveDisplayState(
    pointingInput({ bleConnected: "yes" }),
  );

  assert.equal(invalidNetwork.mode, "spinning");
  assert.deepEqual(invalidNetwork.statusChannels, {
    network: null,
    bluetooth: "connected",
  });
  assert.equal(invalidBluetooth.mode, "spinning");
  assert.deepEqual(invalidBluetooth.statusChannels, {
    network: "wifi",
    bluetooth: null,
  });
});

test("display state exposes the CommonJS API as a browser global", () => {
  assert.equal(
    globalThis.PhysicalDisplayState.deriveDisplayState,
    deriveDisplayState,
  );
});
