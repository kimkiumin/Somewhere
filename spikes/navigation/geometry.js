"use strict";

(function initGeometry(globalScope) {
  const DEGREES_IN_CIRCLE = 360;
  const UNDEFINED_BEARING_EPSILON = 1e-12;

  function isBearing(degrees) {
    return (
      Number.isFinite(degrees) &&
      degrees >= 0 &&
      degrees < DEGREES_IN_CIRCLE
    );
  }

  function isCoordinate(coordinate) {
    return (
      coordinate !== null &&
      typeof coordinate === "object" &&
      Number.isFinite(coordinate.latitude) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      Number.isFinite(coordinate.longitude) &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
    );
  }

  function normalize(degrees) {
    return ((degrees % DEGREES_IN_CIRCLE) + DEGREES_IN_CIRCLE) % DEGREES_IN_CIRCLE;
  }

  function radians(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function toDegrees(radiansValue) {
    return (radiansValue * 180) / Math.PI;
  }

  function bearingDelta(targetDeg, headingDeg) {
    if (!isBearing(targetDeg) || !isBearing(headingDeg)) return null;
    return ((targetDeg - headingDeg + 540) % DEGREES_IN_CIRCLE) - 180;
  }

  function trueBearing(from, routeLookAhead) {
    if (!isCoordinate(from) || !isCoordinate(routeLookAhead)) return null;
    if (
      from.latitude === routeLookAhead.latitude &&
      from.longitude === routeLookAhead.longitude
    ) {
      return null;
    }

    const phi1 = radians(from.latitude);
    const phi2 = radians(routeLookAhead.latitude);
    const deltaLongitude = radians(
      routeLookAhead.longitude - from.longitude,
    );
    const y = Math.sin(deltaLongitude) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLongitude);

    if (
      Math.abs(x) < UNDEFINED_BEARING_EPSILON &&
      Math.abs(y) < UNDEFINED_BEARING_EPSILON
    ) {
      return null;
    }

    const bearing = normalize(toDegrees(Math.atan2(y, x)));
    return isBearing(bearing) ? bearing : null;
  }

  const api = { bearingDelta, trueBearing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.SomewhereGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
