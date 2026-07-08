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
    return {
      phase: "hidden",
      destination,
      distanceM: destination.initialDistanceM,
      headingDeg: normalizeHeading(options.headingDeg ?? Math.random() * 360),
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
    const wobble = state.stepCount % 2 === 0 ? 9 : -7;

    if (!Number.isFinite(currentDistanceM)) {
      return {
        ...state,
        phase: "following",
        distanceM: state.distanceM,
        headingDeg: normalizeHeading(state.headingDeg + wobble),
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
      headingDeg: normalizeHeading(state.headingDeg + wobble),
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
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.BlindCompassState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
