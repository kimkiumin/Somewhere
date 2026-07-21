"use strict";

(function initState(globalScope) {
  const NEAR_THRESHOLD_M = 120;
  const ARRIVED_THRESHOLD_M = 30;
  const DEFAULT_STEP_RANGE_M = [60, 140];

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeHeading(degrees) {
    return ((Math.round(Number(degrees) || 0) % 360) + 360) % 360;
  }

  function bearingDelta(targetDeg, headingDeg) {
    const target = normalizeHeading(targetDeg);
    const heading = normalizeHeading(headingDeg);
    return ((target - heading + 540) % 360) - 180;
  }

  function directionLabel(deltaDeg) {
    const delta = bearingDelta(deltaDeg, 0);
    const absDelta = Math.abs(delta);
    if (absDelta <= 12) return "straight ahead";
    if (absDelta <= 45) return delta > 0 ? "slight right" : "slight left";
    if (absDelta <= 120) return delta > 0 ? "right" : "left";
    return "behind you";
  }

  function phaseForDistance(distanceM) {
    const meters = parseNonNegativeNumber(distanceM);
    if (!Number.isFinite(meters)) return "following";
    if (meters <= ARRIVED_THRESHOLD_M) return "arrived";
    if (meters < NEAR_THRESHOLD_M) return "near";
    return "following";
  }

  function chooseDestination(destinations, options = {}) {
    const safeDestinations = destinations.filter((destination) => {
      return (
        destination &&
        destination.safetyLevel === "safe" &&
        destination.id !== options.excludeId
      );
    });
    if (safeDestinations.length === 0) {
      throw new Error("No safe mock destinations are available.");
    }

    if (Number.isInteger(options.index)) {
      return safeDestinations[
        clampNumber(options.index, 0, safeDestinations.length - 1)
      ];
    }

    return safeDestinations[Math.floor(Math.random() * safeDestinations.length)];
  }

  function createAdventureState(destination, options = {}) {
    const routeBearingDeg = normalizeHeading(options.routeBearingDeg ?? options.headingDeg ?? Math.random() * 360);
    const userHeadingDeg = normalizeHeading(options.userHeadingDeg ?? routeBearingDeg - 18);
    return {
      phase: "hidden",
      destination,
      distanceM: destination.initialDistanceM,
      headingDeg: routeBearingDeg,
      routeBearingDeg,
      userHeadingDeg,
      revealed: false,
      stepCount: 0,
      rerollCount: options.rerollCount ?? 0,
    };
  }

  function startAdventure(destinations, options = {}) {
    const destination = chooseDestination(destinations, options);
    return createAdventureState(destination, options);
  }

  function beginFollowing(state) {
    return {
      ...state,
      phase: phaseForDistance(state.distanceM),
    };
  }

  function randomStep([min, max]) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function moveCloser(state, stepM) {
    const step =
      Number.isFinite(stepM) && stepM > 0
        ? stepM
        : randomStep(DEFAULT_STEP_RANGE_M);
    const currentDistanceM = parseNonNegativeNumber(state.distanceM);
    const routeWobble = state.stepCount % 2 === 0 ? 28 : -21;
    const headingCorrection = state.stepCount % 2 === 0 ? 13 : -8;
    const nextRouteBearingDeg = normalizeHeading((state.routeBearingDeg ?? state.headingDeg) + routeWobble);
    const nextUserHeadingDeg = normalizeHeading((state.userHeadingDeg ?? state.headingDeg) + headingCorrection);

    if (!Number.isFinite(currentDistanceM)) {
      return {
        ...state,
        phase: "following",
        distanceM: state.distanceM,
        headingDeg: nextRouteBearingDeg,
        routeBearingDeg: nextRouteBearingDeg,
        userHeadingDeg: nextUserHeadingDeg,
        stepCount: state.stepCount + 1,
      };
    }

    let nextDistanceM = Math.max(0, Math.round(currentDistanceM - step));
    if (
      currentDistanceM >= NEAR_THRESHOLD_M &&
      nextDistanceM <= ARRIVED_THRESHOLD_M
    ) {
      nextDistanceM = ARRIVED_THRESHOLD_M + 1;
    }

    return {
      ...state,
      phase: phaseForDistance(nextDistanceM),
      distanceM: nextDistanceM,
      headingDeg: nextRouteBearingDeg,
      routeBearingDeg: nextRouteBearingDeg,
      userHeadingDeg: nextUserHeadingDeg,
      stepCount: state.stepCount + 1,
    };
  }

  function revealDestination(state) {
    return {
      ...state,
      phase: "revealed",
      revealed: true,
    };
  }

  function giveUp(state) {
    return {
      ...state,
      phase: "give-up",
      revealed: false,
    };
  }

  function rerollAdventure(state, destinations, options = {}) {
    const destination = chooseDestination(destinations, {
      ...options,
      excludeId: state.destination?.id,
    });
    return {
      ...createAdventureState(destination, {
        ...options,
        rerollCount: (state.rerollCount ?? 0) + 1,
      }),
      phase: "reroll",
    };
  }

  function toPublicJourney(state) {
    const revealed = state.revealed || state.phase === "revealed";
    const publicBearingDelta = bearingDelta(
      state.routeBearingDeg ?? state.headingDeg,
      state.userHeadingDeg ?? state.headingDeg,
    );
    const publicDirectionLabel =
      state.phase === "arrived" ? "arrival zone" : directionLabel(publicBearingDelta);
    return {
      phase: state.phase,
      destinationName: revealed ? state.destination.name : "Hidden",
      category: revealed ? state.destination.category : undefined,
      description: revealed ? state.destination.description : undefined,
      hint: state.destination.hint,
      mood: state.destination.mood,
      distanceM: state.distanceM,
      estimatedMinutes: state.destination.estimatedMinutes,
      safetyLevel: state.destination.safetyLevel,
      headingDeg: state.headingDeg,
      routeBearingDeg: state.routeBearingDeg ?? state.headingDeg,
      userHeadingDeg: state.userHeadingDeg ?? state.headingDeg,
      bearingDeltaDeg: publicBearingDelta,
      directionLabel: publicDirectionLabel,
      revealAvailable: state.phase !== "revealed",
      canStartAgain: state.phase === "revealed" || state.phase === "give-up",
    };
  }

  function formatDistance(distanceM) {
    const meters = parseNonNegativeNumber(distanceM);
    if (!Number.isFinite(meters)) return "Unknown";
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }

  function formatEstimatedTime(minutes) {
    const parsedMinutes = parseNonNegativeNumber(minutes);
    if (Number.isFinite(parsedMinutes)) return `${Math.round(parsedMinutes)} min`;
    return "Unknown";
  }

  function parseNonNegativeNumber(value) {
    if (typeof value !== "number") {
      if (typeof value !== "string" || value.trim() === "") return Number.NaN;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
  }

  const api = {
    NEAR_THRESHOLD_M,
    ARRIVED_THRESHOLD_M,
    DEFAULT_STEP_RANGE_M,
    startAdventure,
    beginFollowing,
    moveCloser,
    revealDestination,
    giveUp,
    rerollAdventure,
    toPublicJourney,
    phaseForDistance,
    formatDistance,
    formatEstimatedTime,
    bearingDelta,
    directionLabel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompassState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
