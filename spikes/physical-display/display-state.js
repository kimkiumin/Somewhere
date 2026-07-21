"use strict";

(function initDisplayState(globalScope) {
  const geometry =
    globalScope.SomewhereGeometry || require("../navigation/geometry.js");
  const NETWORK_KINDS = new Set(["wifi", "cellular", "offline"]);

  function statusChannels(input) {
    return {
      network: NETWORK_KINDS.has(input.networkKind)
        ? input.networkKind
        : null,
      bluetooth:
        typeof input.bleConnected === "boolean"
          ? input.bleConnected
            ? "connected"
            : "disconnected"
          : null,
    };
  }

  function pausedState(channels) {
    return {
      mode: "paused",
      needleVisible: false,
      needleMotion: "stationary",
      relativeBearingDeg: null,
      statusChannels: channels,
    };
  }

  function spinningState(channels) {
    return {
      mode: "spinning",
      needleVisible: true,
      needleMotion: "spinning",
      relativeBearingDeg: null,
      statusChannels: channels,
    };
  }

  function deriveDisplayState(input = {}) {
    const channels = statusChannels(input);

    if (input.sessionState === "paused" || input.sessionState === "stopped") {
      return pausedState(channels);
    }

    const relativeBearingDeg = geometry.bearingDelta(
      input.absoluteRouteBearingDeg,
      input.physicalHeadingDeg,
    );
    const canPoint =
      input.sessionState === "following" &&
      (input.networkKind === "wifi" || input.networkKind === "cellular") &&
      input.bleConnected === true &&
      input.bearingTrusted === true &&
      input.recoveryState === "ready" &&
      input.bearingFreshlyRecomputed === true &&
      relativeBearingDeg !== null;

    if (!canPoint) return spinningState(channels);

    return {
      mode: "pointing",
      needleVisible: true,
      needleMotion: "directional",
      relativeBearingDeg,
      statusChannels: channels,
    };
  }

  const api = { deriveDisplayState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.PhysicalDisplayState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
