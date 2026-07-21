"use strict";

(function attachSensorSession(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.SensorSession = api;
  }
})(typeof globalThis === "undefined" ? undefined : globalThis, function createApi() {
  function geolocationError(error) {
    if (error && error.code === 1) {
      return { error: "permission-denied" };
    }

    if (error && error.code === 2) {
      return { error: "position-unavailable" };
    }

    if (error && error.code === 3) {
      return { error: "timeout" };
    }

    return { error: "unknown" };
  }

  function createSensorSession({
    globalObject = globalThis,
    navigatorObject = globalObject.navigator,
    now = () => Date.now(),
    onReading = () => {},
  } = {}) {
    let readings = { location: null, orientation: null };
    let running = false;
    let watchId = null;
    let orientationListener = null;
    let runId = 0;

    function publish(kind, value) {
      readings = { ...readings, [kind]: value };
      onReading(readings);
    }

    function startGeolocation() {
      const geolocation = navigatorObject && navigatorObject.geolocation;
      if (!geolocation || typeof geolocation.watchPosition !== "function") {
        publish("location", { error: "unsupported" });
        return;
      }

      watchId = geolocation.watchPosition(
        (position) => {
          publish("location", {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            timestampMs: position.timestamp,
          });
        },
        (error) => publish("location", geolocationError(error)),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
      );
    }

    async function startOrientation(startedRunId) {
      const orientationEvent = globalObject && globalObject.DeviceOrientationEvent;
      const canListen = globalObject && typeof globalObject.addEventListener === "function";
      if (!orientationEvent || !canListen) {
        publish("orientation", { error: "unsupported" });
        return;
      }

      if (typeof orientationEvent.requestPermission === "function") {
        try {
          const permission = await orientationEvent.requestPermission();
          if (permission !== "granted") {
            publish("orientation", { error: "permission-denied" });
            return;
          }
        } catch {
          publish("orientation", { error: "permission-denied" });
          return;
        }
      }

      if (!running || startedRunId !== runId) {
        return;
      }

      orientationListener = (event) => {
        publish("orientation", {
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma,
          absolute: event.absolute,
          timestampMs: now(),
        });
      };
      globalObject.addEventListener("deviceorientation", orientationListener);
    }

    return {
      get isRunning() {
        return running;
      },

      async start() {
        if (running) {
          return;
        }

        running = true;
        const startedRunId = ++runId;
        startGeolocation();
        await startOrientation(startedRunId);
      },

      stop() {
        if (watchId !== null) {
          navigatorObject.geolocation.clearWatch(watchId);
          watchId = null;
        }

        if (orientationListener) {
          globalObject.removeEventListener("deviceorientation", orientationListener);
          orientationListener = null;
        }

        running = false;
        runId += 1;
      },
    };
  }

  return { createSensorSession };
});
