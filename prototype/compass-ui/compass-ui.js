"use strict";

(function initSomewhereCompassUi(globalScope) {
  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.NaN;
  }

  function normalizeHeading(degrees) {
    const number = finiteNumber(degrees);
    if (!Number.isFinite(number)) return 0;
    return ((number % 360) + 360) % 360;
  }

  function bearingDelta(targetDegrees, headingDegrees) {
    const target = normalizeHeading(targetDegrees);
    const heading = normalizeHeading(headingDegrees);
    return ((target - heading + 540) % 360) - 180;
  }

  function formatDistance(distanceMeters) {
    const meters = finiteNumber(distanceMeters);
    if (!Number.isFinite(meters) || meters < 0) return "—";
    if (meters >= 1000) {
      const kilometers = meters / 1000;
      return `${kilometers.toFixed(kilometers >= 10 ? 0 : 1)} km`;
    }
    return `${Math.round(meters)} m`;
  }

  function formatPrice(value) {
    const raw = String(value ?? "").trim();
    if (!raw || /^(상관\s*없음|무관|any|no preference)$/i.test(raw)) return "-";

    const numericValue = raw.replace(/[₩원,\s]/g, "");
    if (/^\d+(?:\.\d+)?$/.test(numericValue)) return numericValue;

    const withoutWonSymbol = raw.replace(/[₩]/g, "").replace(/원/g, "").trim();
    return withoutWonSymbol || "-";
  }

  function cleanLabel(value) {
    const label = String(value ?? "").trim();
    return label || "—";
  }

  function buildCompassViewModel({
    distanceMeters,
    priceBand,
    menu,
    targetBearingDeg,
    headingDeg,
  } = {}) {
    return {
      distanceText: formatDistance(distanceMeters),
      priceText: formatPrice(priceBand),
      menuText: cleanLabel(menu),
      needleAngleDeg: bearingDelta(targetBearingDeg, headingDeg),
    };
  }

  function applyNeedleRotation(needleElement, angleDegrees) {
    if (!needleElement || !needleElement.style) {
      throw new TypeError("A needle element with a style object is required.");
    }

    const angle = finiteNumber(angleDegrees);
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    needleElement.style.transform = `rotate(${safeAngle}deg)`;
    if (needleElement.dataset) needleElement.dataset.angle = String(safeAngle);
  }

  const api = {
    applyNeedleRotation,
    bearingDelta,
    buildCompassViewModel,
    formatDistance,
    formatPrice,
    normalizeHeading,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.SomewhereCompassUi = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
