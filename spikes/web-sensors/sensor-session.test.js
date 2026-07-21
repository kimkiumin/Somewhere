"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSensorSession } = require("./sensor-session.js");

function createDependencies({ permission = "granted" } = {}) {
  const calls = {
    clearWatch: [],
    listeners: [],
    removedListeners: [],
    requestPermission: 0,
    watchPosition: 0,
  };

  const orientationListeners = new Set();
  const globalObject = {
    DeviceOrientationEvent: {
      async requestPermission() {
        calls.requestPermission += 1;
        return permission;
      },
    },
    addEventListener(type, listener) {
      calls.listeners.push({ type, listener });
      orientationListeners.add(listener);
    },
    removeEventListener(type, listener) {
      calls.removedListeners.push({ type, listener });
      orientationListeners.delete(listener);
    },
  };
  const navigatorObject = {
    geolocation: {
      clearWatch(id) {
        calls.clearWatch.push(id);
      },
      watchPosition() {
        calls.watchPosition += 1;
        return 42;
      },
    },
  };

  return { calls, globalObject, navigatorObject };
}

test("starts a single permission-gated session and tears it down", async () => {
  assert.equal(typeof createSensorSession, "function");

  const { calls, globalObject, navigatorObject } = createDependencies();
  const session = createSensorSession({ globalObject, navigatorObject });

  await session.start();
  await session.start();
  session.stop();
  session.stop();

  assert.equal(calls.requestPermission, 1);
  assert.equal(calls.watchPosition, 1);
  assert.equal(calls.listeners.length, 1);
  assert.deepEqual(calls.clearWatch, [42]);
  assert.equal(calls.removedListeners.length, 1);
});

test("reports denied orientation permission without registering a listener", async () => {
  assert.equal(typeof createSensorSession, "function");

  const readings = [];
  const { calls, globalObject, navigatorObject } = createDependencies({ permission: "denied" });
  const session = createSensorSession({
    globalObject,
    navigatorObject,
    onReading: (reading) => readings.push(reading),
  });

  await session.start();

  assert.equal(calls.listeners.length, 0);
  assert.deepEqual(readings.at(-1).orientation, { error: "permission-denied" });
});

test("reports unsupported capabilities without attempting subscriptions", async () => {
  assert.equal(typeof createSensorSession, "function");

  const readings = [];
  const session = createSensorSession({
    globalObject: {},
    navigatorObject: {},
    onReading: (reading) => readings.push(reading),
  });

  await session.start();

  assert.deepEqual(readings.at(-1), {
    location: { error: "unsupported" },
    orientation: { error: "unsupported" },
  });
});

test("does not install an orientation listener after stop during a permission prompt", async () => {
  assert.equal(typeof createSensorSession, "function");

  let resolvePermission;
  const permission = new Promise((resolve) => {
    resolvePermission = resolve;
  });
  const { calls, globalObject, navigatorObject } = createDependencies();
  globalObject.DeviceOrientationEvent.requestPermission = () => permission;
  const session = createSensorSession({ globalObject, navigatorObject });

  const start = session.start();
  session.stop();
  resolvePermission("granted");
  await start;

  assert.equal(calls.listeners.length, 0);
  assert.deepEqual(calls.clearWatch, [42]);
});

test("does not publish a denied permission result after stop", async () => {
  let resolvePermission;
  const permission = new Promise((resolve) => {
    resolvePermission = resolve;
  });
  const readings = [];
  const { globalObject, navigatorObject } = createDependencies();
  globalObject.DeviceOrientationEvent.requestPermission = () => permission;
  const session = createSensorSession({
    globalObject,
    navigatorObject,
    onReading: (reading) => readings.push(reading),
  });

  const start = session.start();
  session.stop();
  resolvePermission("denied");
  await start;

  assert.deepEqual(readings, []);
});

test("does not publish a rejected permission result after stop", async () => {
  let rejectPermission;
  const permission = new Promise((_, reject) => {
    rejectPermission = reject;
  });
  const readings = [];
  const { globalObject, navigatorObject } = createDependencies();
  globalObject.DeviceOrientationEvent.requestPermission = () => permission;
  const session = createSensorSession({
    globalObject,
    navigatorObject,
    onReading: (reading) => readings.push(reading),
  });

  const start = session.start();
  session.stop();
  rejectPermission(new Error("permission prompt closed"));
  await start;

  assert.deepEqual(readings, []);
});
