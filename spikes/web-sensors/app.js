"use strict";

(function attachSensorApp(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  if (!root) {
    return;
  }

  root.SensorApp = api;

  const output = root.document.querySelector("#output");
  const startButton = root.document.querySelector("#start");
  const stopButton = root.document.querySelector("#stop");
  const render = (readings) => {
    output.textContent = JSON.stringify(readings, null, 2);
  };

  if (!root.SensorSession) {
    render({ error: "sensor-session-unavailable" });
    return;
  }

  const session = root.SensorSession.createSensorSession({
    globalObject: root,
    navigatorObject: root.navigator,
    onReading: render,
  });

  api.bindSensorControls({
    globalObject: root,
    render,
    session,
    startButton,
    stopButton,
  });
})(typeof globalThis === "undefined" ? undefined : globalThis, function createApi() {
  function bindSensorControls({ globalObject, render, session, startButton, stopButton }) {
    function syncControls() {
      startButton.disabled = session.isRunning;
      stopButton.disabled = !session.isRunning;
    }

    function stopAndRender() {
      session.stop();
      syncControls();
      render({ status: "stopped" });
    }

    startButton.addEventListener("click", () => {
      let startPromise;
      try {
        startPromise = session.start();
      } finally {
        syncControls();
      }

      Promise.resolve(startPromise).then(syncControls, syncControls);
    });

    stopButton.addEventListener("click", stopAndRender);
    globalObject.addEventListener("pagehide", stopAndRender);
    syncControls();
  }

  return { bindSensorControls };
});
