"use strict";

const output = document.querySelector("#output");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");

function render(readings) {
  output.textContent = JSON.stringify(readings, null, 2);
}

if (!globalThis.SensorSession) {
  render({ error: "sensor-session-unavailable" });
} else {
  const session = globalThis.SensorSession.createSensorSession({
    globalObject: globalThis,
    navigatorObject: globalThis.navigator,
    onReading: render,
  });

  startButton.addEventListener("click", async () => {
    await session.start();
    startButton.disabled = session.isRunning;
    stopButton.disabled = !session.isRunning;
  });

  stopButton.addEventListener("click", () => {
    session.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
    render({ status: "stopped" });
  });

  globalThis.addEventListener("pagehide", () => session.stop(), { once: true });
}
