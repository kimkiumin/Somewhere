"use strict";

(function initState(globalScope) {
  const PHASES = Object.freeze([
    "onboarding", "constraints", "finding", "following", "near",
    "paused", "reveal_reason", "revealed", "following_revealed",
    "stop_confirm", "stop_reason", "stopped", "route_recovery",
    "recomputing", "external_map_warning", "external_map_handoff",
    "arrived", "feedback_pending", "place_reaction", "complete",
  ]);

  const REVEAL_REASONS = Object.freeze([
    "safety", "route_difficulty", "sensor_problem", "condition_check",
    "companion_check", "curiosity", "skipped",
  ]);
  const STOP_REASONS = Object.freeze([
    "safety", "route_sensor", "condition_mismatch", "venue_problem",
    "change_of_mind", "schedule_change", "skipped",
  ]);
  const REACTIONS = Object.freeze(["dislike", "like", "love", "did_not_visit"]);

  function defaultConstraints() {
    return {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: null,
      dietary: [],
      accessibility: [],
      disclosure: "standard",
    };
  }

  function createInitialState({ firstUse = true, permission = "authorized" } = {}) {
    return {
      phase: firstUse ? "onboarding" : "constraints",
      constraints: defaultConstraints(),
      errors: {},
      permission,
      committed: false,
      destination: null,
      route: null,
      distanceM: null,
      bearingDeg: null,
      confidence: "unavailable",
      recoveryReason: null,
      revealed: false,
      revealReason: null,
      stopReason: null,
      previousGuidancePhase: null,
      guidanceEnded: false,
      stoppedAtMs: null,
      guardedRecovery: false,
      recoveryReviewed: false,
      feedbackEligibleAtMs: null,
      reaction: null,
    };
  }

  function validateConstraints(value) {
    const errors = {};
    if (!value || !["restaurant", "cafe"].includes(value.category)) {
      errors.category = "?앸떦 ?먮뒗 移댄럹瑜??좏깮?댁＜?몄슂.";
    }
    if (!Number.isFinite(value?.maxWalkMinutes) || value.maxWalkMinutes < 1) {
      errors.maxWalkMinutes = "?꾨낫 ?쒓컙? 1遺??댁긽?댁뼱???⑸땲??";
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function actionNow(action) {
    return Number.isFinite(action.nowMs) ? action.nowMs : Date.now();
  }

  function arrivalState(state, nowMs) {
    return {
      ...state,
      phase: "arrived",
      revealed: true,
      confidence: "ready",
      feedbackEligibleAtMs: nowMs + 3_600_000,
    };
  }

  function publicArrivalDetails(destination) {
    if (!destination) return null;
    const valueOrNull = (value) => (
      typeof value === "string" && value.trim() !== "" ? value : null
    );
    return {
      name: valueOrNull(destination.name),
      address: valueOrNull(destination.address),
      building: valueOrNull(destination.building),
      floorUnit: valueOrNull(destination.floorUnit),
      entrance: valueOrNull(destination.entrance),
    };
  }

  function formatDistance(distanceM) {
    if (!Number.isFinite(distanceM)) return null;
    if (distanceM < 1000) return `${Math.round(distanceM)} m`;
    return `${(distanceM / 1000).toFixed(1)} km`;
  }

  function reduce(state, action) {
    if (!state || !action || typeof action.type !== "string") return state;
    if (action.type === "CONTINUE_ONBOARDING" && state.phase === "onboarding") {
      return { ...state, phase: "constraints" };
    }
    if (action.type === "START" && state.phase === "constraints") {
      const result = validateConstraints(action.constraints);
      const requiresRecoveryReview = state.guardedRecovery && action.recoveryReviewed !== true;
      if (!result.valid || requiresRecoveryReview) {
        return {
          ...state,
          constraints: structuredClone(action.constraints),
          errors: {
            ...result.errors,
            ...(requiresRecoveryReview ? {
              recoveryReview: `Review the recent Stop reason (${state.recoveryReason ?? "unknown"}) before continuing.`,
            } : {}),
          },
        };
      }
      return {
        ...state,
        phase: "finding",
        constraints: structuredClone(action.constraints),
        errors: {},
        committed: true,
        recoveryReviewed: state.guardedRecovery ? true : false,
      };
    }
    if (action.type === "FIND_SUCCESS" && state.phase === "finding") {
      if (!action.destination || !action.route || !Number.isFinite(action.route.distanceM)) {
        return {
          ...state,
          phase: "constraints",
          errors: { finding: "?μ냼瑜?以鍮꾪븯吏 紐삵뻽?듬땲??" },
        };
      }
      return {
        ...state,
        phase: "following",
        destination: structuredClone(action.destination),
        route: structuredClone(action.route),
        distanceM: action.route.distanceM,
        bearingDeg: action.route.bearingDeg,
        confidence: "ready",
      };
    }
    if (action.type === "FIND_NO_FIT" && state.phase === "finding") {
      return {
        ...state,
        phase: "constraints",
        committed: false,
        errors: { finding: "議곌굔??異⑹”?섎뒗 ?μ냼媛 ?놁뒿?덈떎." },
      };
    }
    if (
      action.type === "PERMISSION_DENIED"
      && ["constraints", "finding"].includes(state.phase)
    ) {
      return {
        ...state,
        phase: "constraints",
        committed: false,
        errors: { ...state.errors, locationPermission: "Location permission is required to continue." },
      };
    }
    if (action.type === "WALK" && ["following", "near", "following_revealed"].includes(state.phase)) {
      const distanceM = Number.isFinite(action.distanceM) ? Math.max(0, action.distanceM) : state.distanceM;
      if (!Number.isFinite(distanceM)) return state;
      const walking = { ...state, distanceM };
      if (distanceM < 30) return arrivalState(walking, actionNow(action));
      if (distanceM < 120) return { ...walking, phase: "near" };
      return { ...walking, phase: state.revealed ? "following_revealed" : "following" };
    }
    if (action.type === "STOP" && ["following", "near", "following_revealed"].includes(state.phase)) {
      return {
        ...state,
        phase: "paused",
        confidence: "paused",
        previousGuidancePhase: state.phase,
        guidanceEnded: false,
        stopReason: null,
      };
    }
    if (action.type === "CONTINUE_GUIDANCE" && state.phase === "paused") {
      return { ...state, phase: "recomputing", confidence: "recomputing" };
    }
    if (action.type === "OPEN_DESTINATION_INFO" && state.phase === "paused") {
      return { ...state, phase: "reveal_reason" };
    }
    if (
      action.type === "REVEAL_DESTINATION"
      && state.phase === "reveal_reason"
      && REVEAL_REASONS.includes(action.reason)
    ) {
      return {
        ...state,
        phase: "revealed",
        revealed: true,
        revealReason: action.reason,
      };
    }
    if (action.type === "CONTINUE_AFTER_REVEAL" && state.phase === "revealed") {
      return { ...state, phase: "recomputing", confidence: "recomputing", revealed: true };
    }
    if (action.type === "REQUEST_END" && ["paused", "revealed"].includes(state.phase)) {
      return { ...state, phase: "stop_confirm" };
    }
    if (action.type === "CONFIRM_END" && state.phase === "stop_confirm") {
      return {
        ...state,
        phase: "stop_reason",
        guidanceEnded: true,
        stoppedAtMs: actionNow(action),
      };
    }
    if (
      action.type === "SUBMIT_STOP_REASON"
      && state.phase === "stop_reason"
      && STOP_REASONS.includes(action.reason)
    ) {
      return { ...state, phase: "stopped", stopReason: action.reason };
    }
    if (action.type === "NEW_RECOMMENDATION" && state.phase === "stopped") {
      const guardedRecovery = actionNow(action) - state.stoppedAtMs < 300_000;
      return {
        ...createInitialState({ firstUse: false, permission: state.permission }),
        constraints: structuredClone(state.constraints),
        guardedRecovery,
        recoveryReason: guardedRecovery ? state.stopReason : null,
        recoveryReviewed: false,
      };
    }
    if (
      action.type === "LOW_CONFIDENCE"
      && ["following", "near", "following_revealed"].includes(state.phase)
    ) {
      return {
        ...state,
        phase: "route_recovery",
        confidence: "low",
        recoveryReason: action.reason ?? null,
        previousGuidancePhase: state.phase,
      };
    }
    if (
      ["RETRY_GUIDANCE", "USE_CACHED_ROUTE"].includes(action.type)
      && state.phase === "route_recovery"
    ) {
      return { ...state, phase: "recomputing", confidence: "recomputing" };
    }
    if (action.type === "RECOVERY_READY" && state.phase === "recomputing") {
      return {
        ...state,
        phase: state.revealed ? "following_revealed" : "following",
        confidence: "ready",
        recoveryReason: null,
      };
    }
    if (action.type === "REQUEST_EXTERNAL_MAP" && state.phase === "route_recovery") {
      return { ...state, phase: "external_map_warning" };
    }
    if (action.type === "REQUEST_EXTERNAL_MAP" && ["revealed", "arrived"].includes(state.phase)) {
      return { ...state, phase: "external_map_handoff" };
    }
    if (action.type === "CANCEL_EXTERNAL_MAP" && state.phase === "external_map_warning") {
      return { ...state, phase: "route_recovery" };
    }
    if (action.type === "CONFIRM_EXTERNAL_MAP" && state.phase === "external_map_warning") {
      return { ...state, phase: "external_map_handoff", revealed: true };
    }
    if (action.type === "ARRIVE" && ["following", "near", "following_revealed"].includes(state.phase)) {
      return arrivalState(state, actionNow(action));
    }
    if (action.type === "FINISH_ARRIVAL" && state.phase === "arrived") {
      return { ...state, phase: "feedback_pending" };
    }
    if (
      action.type === "CHECK_FEEDBACK"
      && state.phase === "feedback_pending"
      && Number.isFinite(state.feedbackEligibleAtMs)
      && actionNow(action) >= state.feedbackEligibleAtMs
    ) {
      return { ...state, phase: "place_reaction" };
    }
    if (
      action.type === "REACT"
      && state.phase === "place_reaction"
      && REACTIONS.includes(action.reaction)
    ) {
      return { ...state, phase: "complete", reaction: action.reaction };
    }
    if (action.type === "RESET") return createInitialState({ firstUse: false });
    return state;
  }

  function toPublicView(state) {
    const identityVisible = state.revealed && !state.guidanceEnded;
    const hasTrustedBearing = state.confidence === "ready" && Number.isFinite(state.bearingDeg);
    const needleMode = state.confidence === "paused" || ["paused", "stop_confirm", "stop_reason", "stopped"].includes(state.phase)
      ? "paused"
      : hasTrustedBearing
        ? "pointing"
        : "searching";
    return {
      phase: state.phase,
      constraints: structuredClone(state.constraints),
      errors: structuredClone(state.errors),
      permission: state.permission,
      committed: state.committed,
      distanceM: state.distanceM,
      bearingDeg: hasTrustedBearing ? state.bearingDeg : null,
      needleMode,
      confidence: state.confidence,
      recoveryReason: state.recoveryReason,
      menu: state.destination?.menu ?? null,
      priceBand: state.destination?.priceBand ?? null,
      destination: identityVisible ? publicArrivalDetails(state.destination) : null,
      revealed: state.revealed,
      guardedRecovery: state.guardedRecovery,
      recoveryReviewed: state.recoveryReviewed,
      feedbackEligibleAtMs: state.feedbackEligibleAtMs,
      reaction: state.reaction,
    };
  }

  const api = {
    PHASES, REVEAL_REASONS, STOP_REASONS, createInitialState, validateConstraints,
    reduce, toPublicView, formatDistance,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.SomewhereVNextState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
