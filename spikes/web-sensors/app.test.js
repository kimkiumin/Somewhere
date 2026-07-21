"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function loadSensorApp() {
  const modulePath = require.resolve("./app.js");
  delete require.cache[modulePath];

  try {
    return require("./app.js");
  } catch {
    return {};
  }
}

function createButton(disabled) {
  const listeners = new Map();

  return {
    disabled,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    click() {
      listeners.get("click")();
    },
  };
}

function createWindow() {
  const listeners = new Map();

  return {
    addEventListener(type, listener, options) {
      listeners.set(type, { listener, once: Boolean(options && options.once) });
    },
    dispatch(type) {
      const entry = listeners.get(type);
      if (!entry) {
        return;
      }

      entry.listener();
      if (entry.once) {
        listeners.delete(type);
      }
    },
  };
}

test("starts and stops controls across repeated pagehide lifecycle events", async () => {
  const { bindSensorControls } = loadSensorApp();
  assert.equal(typeof bindSensorControls, "function");

  let resolveStart;
  const pendingStart = new Promise((resolve) => {
    resolveStart = resolve;
  });
  let running = false;
  let stopCalls = 0;
  const session = {
    get isRunning() {
      return running;
    },
    start() {
      running = true;
      return pendingStart;
    },
    stop() {
      running = false;
      stopCalls += 1;
    },
  };
  const startButton = createButton(false);
  const stopButton = createButton(true);
  const windowObject = createWindow();

  bindSensorControls({
    globalObject: windowObject,
    render() {},
    session,
    startButton,
    stopButton,
  });

  startButton.click();
  assert.equal(startButton.disabled, true);
  assert.equal(stopButton.disabled, false);

  windowObject.dispatch("pagehide");
  assert.equal(stopCalls, 1);
  assert.equal(startButton.disabled, false);
  assert.equal(stopButton.disabled, true);

  startButton.click();
  windowObject.dispatch("pagehide");
  assert.equal(stopCalls, 2);
  assert.equal(startButton.disabled, false);
  assert.equal(stopButton.disabled, true);

  resolveStart();
  await pendingStart;
});
