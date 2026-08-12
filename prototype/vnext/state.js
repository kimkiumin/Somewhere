"use strict";

(function initState(globalScope) {
  const PHASES = Object.freeze([
    "onboarding", "profile_setup", "profile", "constraints", "finding", "following", "near",
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
  const NO_FIT_FIELDS = Object.freeze([
    "category", "maxWalkMinutes", "budget", "dietary", "allergies",
    "accessibility", "disclosure",
  ]);
  const ARRIVAL_DETAIL_FIELDS = Object.freeze([
    "name", "address", "building", "floorUnit", "entrance",
  ]);

  function defaultConstraints() {
    return {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: null,
      dietary: [],
      allergies: [],
      accessibility: [],
      disclosure: "minimal",
    };
  }

  function createInitialState({ firstUse = true, permission = "authorized" } = {}) {
    return {
      phase: firstUse ? "onboarding" : "constraints",
      constraints: defaultConstraints(),
      profile: { dietary: [], allergies: [] },
      errors: {},
      affectedConditions: [],
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
    if (!value || value.category !== "restaurant") {
      errors.category = "식당 조건을 확인해 주세요.";
    }
    if (!Number.isFinite(value?.maxWalkMinutes) || value.maxWalkMinutes < 1) {
      errors.maxWalkMinutes = "도보 시간은 1분 이상이어야 합니다.";
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function arrivalState(state, nowMs) {
    return {
      ...state,
      phase: "arrived",
      revealed: true,
      bearingDeg: null,
      confidence: "unavailable",
      feedbackEligibleAtMs: nowMs + 3_600_000,
    };
  }

  function normalizeAffectedConditions(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    const normalized = [];
    for (const condition of value) {
      if (
        !condition
        || !NO_FIT_FIELDS.includes(condition.field)
        || typeof condition.label !== "string"
        || condition.label.trim() === ""
      ) return null;
      normalized.push({ field: condition.field, label: condition.label.trim() });
    }
    return normalized;
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
      return { ...state, phase: "profile_setup" };
    }
    if (action.type === "OPEN_PROFILE" && state.phase === "constraints") {
      return { ...state, phase: "profile" };
    }
    if (action.type === "CANCEL_PROFILE" && state.phase === "profile") {
      return { ...state, phase: "constraints" };
    }
    if (
      action.type === "SAVE_PROFILE"
      && ["profile_setup", "profile"].includes(state.phase)
      && action.profile
    ) {
      const profile = {
        dietary: Array.isArray(action.profile.dietary) ? structuredClone(action.profile.dietary) : [],
        allergies: Array.isArray(action.profile.allergies) ? structuredClone(action.profile.allergies) : [],
      };
      return {
        ...state,
        phase: "constraints",
        profile,
        constraints: {
          ...state.constraints,
          dietary: structuredClone(profile.dietary),
          allergies: structuredClone(profile.allergies),
        },
      };
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
              recoveryReview: "최근 안내 종료 이유와 새 출발 조건을 확인해 주세요.",
            } : {}),
          },
        };
      }
      return {
        ...state,
        phase: "finding",
        constraints: structuredClone(action.constraints),
        errors: {},
        affectedConditions: [],
        committed: true,
        recoveryReviewed: state.guardedRecovery ? true : false,
      };
    }
    if (action.type === "FIND_SUCCESS" && state.phase === "finding") {
      if (!action.destination || !action.route || !Number.isFinite(action.route.distanceM)) {
        return {
          ...state,
          phase: "constraints",
          committed: false,
          errors: { finding: "장소와 경로를 준비하지 못했습니다. 조건을 다시 확인해 주세요." },
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
      const affectedConditions = normalizeAffectedConditions(action.affectedConditions);
      if (!affectedConditions) return state;
      return {
        ...state,
        phase: "constraints",
        committed: false,
        affectedConditions,
        errors: { finding: "필수 조건을 모두 충족하는 장소를 찾지 못했습니다." },
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
        errors: {
          ...state.errors,
          locationPermission: "계속하려면 위치 권한이 필요합니다. 권한 설정을 확인해 주세요.",
        },
      };
    }
    if (action.type === "WALK" && ["following", "near", "following_revealed"].includes(state.phase)) {
      const distanceM = Number.isFinite(action.distanceM) ? Math.max(0, action.distanceM) : state.distanceM;
      if (!Number.isFinite(distanceM)) return state;
      const walking = { ...state, distanceM };
      if (distanceM < 30) {
        if (!Number.isFinite(action.nowMs)) return state;
        return arrivalState(walking, action.nowMs);
      }
      if (distanceM < 120) return { ...walking, phase: "near" };
      return { ...walking, phase: state.revealed ? "following_revealed" : "following" };
    }
    if (action.type === "STOP" && ["following", "near", "following_revealed", "route_recovery"].includes(state.phase)) {
      return {
        ...state,
        phase: "paused",
        confidence: "paused",
        previousGuidancePhase: state.phase,
        guidanceEnded: false,
        stopReason: null,
      };
    }
    if (action.type === "CONTINUE_GUIDANCE" && ["paused", "stop_confirm"].includes(state.phase)) {
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
      if (!Number.isFinite(action.nowMs)) return state;
      return {
        ...state,
        phase: "stop_reason",
        guidanceEnded: true,
        stoppedAtMs: action.nowMs,
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
      if (!Number.isFinite(action.nowMs) || !Number.isFinite(state.stoppedAtMs)) return state;
      const elapsedMs = action.nowMs - state.stoppedAtMs;
      if (elapsedMs < 0) return state;
      const guardedRecovery = elapsedMs <= 300_000;
      return {
        ...createInitialState({ firstUse: false, permission: state.permission }),
        constraints: structuredClone(state.constraints),
        profile: structuredClone(state.profile),
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
    if (
      action.type === "ARRIVE"
      && ["following", "near", "following_revealed"].includes(state.phase)
      && Number.isFinite(action.nowMs)
    ) {
      return arrivalState(state, action.nowMs);
    }
    if (
      action.type === "ARRIVE_WITH_MISSING_FIELD"
      && ["following", "near", "following_revealed"].includes(state.phase)
      && ARRIVAL_DETAIL_FIELDS.includes(action.field)
      && Number.isFinite(action.nowMs)
      && state.destination
    ) {
      return arrivalState({
        ...state,
        destination: { ...state.destination, [action.field]: null },
      }, action.nowMs);
    }
    if (action.type === "FINISH_ARRIVAL" && state.phase === "arrived") {
      return { ...state, phase: "feedback_pending" };
    }
    if (
      action.type === "CHECK_FEEDBACK"
      && state.phase === "feedback_pending"
      && Number.isFinite(state.feedbackEligibleAtMs)
      && Number.isFinite(action.nowMs)
      && action.nowMs >= state.feedbackEligibleAtMs
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
      profile: structuredClone(state.profile),
      errors: structuredClone(state.errors),
      affectedConditions: structuredClone(state.affectedConditions),
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
