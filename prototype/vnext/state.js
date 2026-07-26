"use strict";

(function initState(globalScope) {
  const PHASES = Object.freeze([
    "onboarding", "constraints", "finding", "following", "near",
    "paused", "reveal_reason", "revealed", "following_revealed",
    "stop_confirm", "stop_reason", "stopped", "route_recovery",
    "recomputing", "external_map_warning", "external_map_handoff",
    "arrived", "feedback_pending", "place_reaction", "complete",
  ]);

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

  function reduce(state, action) {
    if (!state || !action || typeof action.type !== "string") return state;
    if (action.type === "CONTINUE_ONBOARDING" && state.phase === "onboarding") {
      return { ...state, phase: "constraints" };
    }
    if (action.type === "START" && state.phase === "constraints") {
      const result = validateConstraints(action.constraints);
      if (!result.valid) {
        return {
          ...state,
          constraints: structuredClone(action.constraints),
          errors: result.errors,
        };
      }
      return {
        ...state,
        phase: "finding",
        constraints: structuredClone(action.constraints),
        errors: {},
        committed: true,
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
    return state;
  }

  function toPublicView(state) {
    return {
      phase: state.phase,
      constraints: structuredClone(state.constraints),
      errors: structuredClone(state.errors),
      permission: state.permission,
      committed: state.committed,
      distanceM: state.distanceM,
      bearingDeg: state.confidence === "ready" ? state.bearingDeg : null,
      confidence: state.confidence,
      recoveryReason: state.recoveryReason,
      menu: state.destination?.menu ?? null,
      priceBand: state.destination?.priceBand ?? null,
      destination: null,
      revealed: state.revealed,
      guardedRecovery: state.guardedRecovery,
      feedbackEligibleAtMs: state.feedbackEligibleAtMs,
      reaction: state.reaction,
    };
  }

  const api = { PHASES, createInitialState, validateConstraints, reduce, toPublicView };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.SomewhereVNextState = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
