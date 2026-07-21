"use strict";

const RECOVERY_STATES = new Set(["ready", "reconnecting", "recomputing"]);

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function isHeading(value) {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

function isHeadingAccuracy(value) {
  return Number.isFinite(value) && value >= 0 && value <= 180;
}

function guidanceConfidence({
  nowMs,
  bearingTimestampMs,
  maxAgeMs,
  routeValid,
  locationAccuracyM,
  maxLocationAccuracyM = 35,
  physicalHeadingDeg,
  headingAccuracyDeg,
  maxHeadingAccuracyDeg = 20,
  magneticallyDisturbed = false,
  recoveryState,
  bearingFreshlyRecomputed,
} = {}) {
  const reasonCodes = [];
  const timestampValid =
    isNonNegativeFinite(nowMs) &&
    isNonNegativeFinite(bearingTimestampMs) &&
    bearingTimestampMs <= nowMs;
  const thresholdsValid =
    isNonNegativeFinite(maxAgeMs) &&
    isNonNegativeFinite(maxLocationAccuracyM) &&
    isHeadingAccuracy(maxHeadingAccuracyDeg);

  if (!timestampValid) {
    reasonCodes.push("invalid_timestamp");
  } else if (isNonNegativeFinite(maxAgeMs) && nowMs - bearingTimestampMs > maxAgeMs) {
    reasonCodes.push("stale_bearing");
  }

  if (!thresholdsValid) reasonCodes.push("invalid_threshold");
  if (routeValid !== true) reasonCodes.push("invalid_route");

  if (
    !isNonNegativeFinite(locationAccuracyM) ||
    (isNonNegativeFinite(maxLocationAccuracyM) &&
      locationAccuracyM > maxLocationAccuracyM)
  ) {
    reasonCodes.push("poor_location_accuracy");
  }

  if (!isHeading(physicalHeadingDeg)) {
    reasonCodes.push("invalid_heading");
  }

  if (
    !isHeadingAccuracy(headingAccuracyDeg) ||
    (isHeadingAccuracy(maxHeadingAccuracyDeg) &&
      headingAccuracyDeg > maxHeadingAccuracyDeg) ||
    magneticallyDisturbed !== false
  ) {
    reasonCodes.push("magnetic_disturbance");
  }

  if (!RECOVERY_STATES.has(recoveryState)) {
    reasonCodes.push("invalid_recovery_state");
  } else if (recoveryState === "reconnecting") {
    reasonCodes.push("reconnect_in_progress");
  }

  if (
    recoveryState === "recomputing" ||
    bearingFreshlyRecomputed !== true
  ) {
    reasonCodes.push("recompute_required");
  }

  return { trusted: reasonCodes.length === 0, reasonCodes };
}

module.exports = { guidanceConfidence };
