# Somewhere vNext Sequence Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, monochrome browser prototype that demonstrates the approved single-action Somewhere vNext journey, fixed-size compass, Stop-gated destination Reveal with a skippable reason, arrival disclosure, recovery, and delayed reaction without modifying the historical v0.1 prototype.

**Architecture:** Add a plain HTML/CSS/JavaScript application under `prototype/vnext/`. A pure reducer owns all legal transitions and produces a disclosure-safe public view model; pure screen renderers consume only that view model; a thin controller supplies deterministic mock destination, timer, distance, permission, confidence, and feedback effects. Existing `prototype/` files remain historical v0.1 evidence.

**Tech Stack:** HTML5, CSS, dependency-free JavaScript using the existing browser/CommonJS wrapper pattern, Node.js 24 built-in `node:test`, and the repository's existing `npm.cmd run verify` entry point.

## Global Constraints

- Treat `BLUEPRINT.md`, `docs/blueprint/*.md`, and `docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md` as the active contract; the 2026-07-26 spec supersedes the earlier second commit button and always-available secondary Reveal path.
- Preserve every file directly under `prototype/`; the historical v0.1 prototype and its tests must remain unchanged.
- Create the new prototype only under `prototype/vnext/` except for the project-contract test that records its existence.
- Use plain HTML, CSS, and JavaScript with no new runtime or test dependency.
- Show category and maximum walking distance/time by default; keep budget, dietary/allergy, accessibility, and disclosure preferences in a collapsed `고급 조건` control.
- Use one product action, `이 조건으로 바로 출발`; do not add `한 곳 준비`, `이 장소로 출발`, another commit button, or active Reroll.
- Do not render a compass during constraints or finding. Render it at one unchanged size in following and near states.
- Keep destination identity and exact location out of all public pre-Reveal view models and rendered HTML.
- The main compass screen has Stop but no directly visible Reveal control or ordinary menu Reveal item.
- Stop pauses synchronously before any sheet choice. Reveal reason and confirmed Stop reason remain separate and both allow their specified skip paths.
- Arrival automatically exposes only source-supported venue name, address, building, floor/unit, and entrance guidance; unavailable values remain unavailable.
- No real provider API, GPS, heading, notifications, backend, account, analytics, BLE, map, purchase, or field claim enters this prototype.
- Keep the interface low fidelity: monochrome, system type, structural borders, no photography, gradient, shadow, decorative iconography, branded motion, or material styling.
- Every action is keyboard-operable and direction is accompanied by text rather than conveyed only by a needle.

---

## Planned File Structure

```text
prototype/vnext/
  README.md           scope, direct-open instructions, and simulation guide
  index.html          semantic product shell plus separate prototype controls
  style.css           monochrome phone frame, fixed compass, screens, controls
  state.js            pure reducer, validation, invariants, safe public view
  state.test.js       state, disclosure, recovery, Stop, Reveal, arrival tests
  screens.js          escaping and state-to-HTML rendering
  screens.test.js     visible-control, hidden-data, and structure tests
  controller.js       deterministic effects, dispatch, timer, and event mapping
  controller.test.js  single-start, idempotency, and scheduled-effect tests
  app.js              browser bootstrap only
tests/
  project_contract.test.js  records isolated vNext files without altering v0.1 list
```

The files communicate through these stable interfaces:

```js
// state.js
createInitialState(options?) -> JourneyState
validateConstraints(constraints) -> { valid, errors }
reduce(state, action) -> JourneyState
toPublicView(state) -> PublicJourneyView

// screens.js
escapeHtml(value) -> string
renderProductScreen(view) -> string
renderPrototypeControls(view) -> string
renderApp(root, controlsRoot, view) -> void

// controller.js
createController(options) -> { getState, dispatch, start, destroy }
mount(root, controlsRoot, options?) -> Controller
```

`toPublicView` returns this stable JSON-safe shape; `destination` is either `null` or the exact assistance object shown below:

```js
{
  phase,
  constraints,
  errors,
  permission,
  committed,
  distanceM,
  bearingDeg,
  confidence,
  recoveryReason,
  menu,
  priceBand,
  revealed,
  destination: null | { name, address, building, floorUnit, entrance },
  guardedRecovery,
  feedbackEligibleAtMs,
  reaction,
}
```

## Task 1: Pure Journey Foundation and Single-Action Start

**Files:**
- Create: `prototype/vnext/state.test.js`
- Create: `prototype/vnext/state.js`

**Interfaces:**
- Consumes: reducer actions `{ type: string, ...payload }` and plain JSON destination/route fixtures supplied by later controller code.
- Produces: `createInitialState`, `validateConstraints`, `reduce`, and `toPublicView` in both `module.exports` and `globalThis.SomewhereVNextState`.

- [ ] **Step 1: Write the failing foundation tests**

Create `prototype/vnext/state.test.js` with these initial cases:

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stateApi = require("./state.js");

function validConstraints() {
  return {
    category: "restaurant",
    maxWalkMinutes: 20,
    budget: null,
    dietary: [],
    accessibility: [],
    disclosure: "standard",
  };
}

test("one start action moves valid constraints directly into finding", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const finding = stateApi.reduce(initial, {
    type: "START",
    constraints: validConstraints(),
  });

  assert.equal(finding.phase, "finding");
  assert.equal(finding.committed, true);
  assert.equal(finding.destination, null);
});

test("invalid constraints remain editable and identify exact fields", () => {
  const initial = stateApi.createInitialState({ firstUse: false });
  const unchanged = stateApi.reduce(initial, {
    type: "START",
    constraints: { ...validConstraints(), maxWalkMinutes: 0 },
  });

  assert.equal(unchanged.phase, "constraints");
  assert.deepEqual(unchanged.errors, {
    maxWalkMinutes: "도보 시간은 1분 이상이어야 합니다.",
  });
});

test("finding success begins guidance without a ready or second commit state", () => {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    { type: "START", constraints: validConstraints() },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: {
      id: "fixture-1",
      name: "숨겨진 식당",
      address: "서울시 테스트로 1",
      building: "테스트 빌딩",
      floorUnit: "2층",
      entrance: "동쪽 출입구",
      menu: "국수",
      priceBand: "₩₩",
    },
    route: { id: "route-1", distanceM: 850, bearingDeg: 40 },
  });

  assert.equal(following.phase, "following");
  assert.equal(following.committed, true);
  assert.equal(stateApi.PHASES.includes("ready"), false);
  assert.equal(stateApi.PHASES.includes("committed"), false);
});
```

- [ ] **Step 2: Run the foundation tests and verify RED**

Run:

```powershell
node --test prototype/vnext/state.test.js
```

Expected: FAIL because `prototype/vnext/state.js` does not exist.

- [ ] **Step 3: Implement the minimum state foundation**

Create `prototype/vnext/state.js` with a browser/CommonJS wrapper and these exact foundations:

```js
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
      errors.category = "식당 또는 카페를 선택해주세요.";
    }
    if (!Number.isFinite(value?.maxWalkMinutes) || value.maxWalkMinutes < 1) {
      errors.maxWalkMinutes = "도보 시간은 1분 이상이어야 합니다.";
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
      if (!result.valid) return { ...state, errors: result.errors };
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
        return { ...state, phase: "constraints", errors: { finding: "장소를 준비하지 못했습니다." } };
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
      return { ...state, phase: "constraints", committed: false, errors: { finding: "조건을 충족하는 장소가 없습니다." } };
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
```

- [ ] **Step 4: Run the foundation tests and verify GREEN**

Run:

```powershell
node --test prototype/vnext/state.test.js
```

Expected: 3 tests pass, zero fail.

- [ ] **Step 5: Commit the foundation**

```powershell
git add -- prototype/vnext/state.js prototype/vnext/state.test.js
git commit -m "feat: add vnext journey foundation"
```

## Task 2: Stop, Reveal, Recovery, Arrival, and Feedback Contracts

**Files:**
- Modify: `prototype/vnext/state.test.js`
- Modify: `prototype/vnext/state.js`

**Interfaces:**
- Consumes: the Task 1 `JourneyState`, `reduce(state, action)`, and destination/route payloads.
- Produces: `REVEAL_REASONS`, `STOP_REASONS`, full legal reducer transitions, disclosure-safe `toPublicView`, and `formatDistance`.

- [ ] **Step 1: Add failing safety and disclosure tests**

Append this exact helper and the safety/disclosure tests:

```js
function followingState({ revealed = false } = {}) {
  const finding = stateApi.reduce(
    stateApi.createInitialState({ firstUse: false }),
    {
      type: "START",
      constraints: {
        category: "restaurant", maxWalkMinutes: 20, budget: null,
        dietary: [], accessibility: [], disclosure: "standard",
      },
    },
  );
  const following = stateApi.reduce(finding, {
    type: "FIND_SUCCESS",
    destination: {
      id: "fixture-1", name: "숨겨진 식당", address: "서울시 테스트로 1",
      building: "테스트 빌딩", floorUnit: "2층", entrance: "동쪽 출입구",
      menu: "국수", priceBand: "₩₩",
    },
    route: { id: "route-1", distanceM: 850, bearingDeg: 40 },
  });
  if (!revealed) return following;
  const paused = stateApi.reduce(following, { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const disclosed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "skipped",
  });
  const recomputing = stateApi.reduce(disclosed, { type: "CONTINUE_AFTER_REVEAL" });
  return stateApi.reduce(recomputing, { type: "RECOVERY_READY" });
}

test("Stop pauses synchronously before any reason or confirmed end", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  assert.equal(paused.phase, "paused");
  assert.equal(paused.confidence, "paused");
  assert.equal(paused.guidanceEnded, false);
  assert.equal(paused.stopReason, null);
});

test("destination disclosure requires a reason or explicit skip after pause", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const illegal = stateApi.reduce(reason, { type: "REVEAL_DESTINATION" });
  const revealed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "skipped",
  });

  assert.equal(reason.phase, "reveal_reason");
  assert.equal(illegal, reason);
  assert.equal(revealed.phase, "revealed");
  assert.equal(revealed.revealed, true);
  assert.equal(revealed.revealReason, "skipped");
  assert.equal(revealed.stopReason, null);
});

test("public view exposes exact fields only after reveal or arrival", () => {
  const following = followingState();
  const hidden = stateApi.toPublicView(following);
  const paused = stateApi.reduce(following, { type: "STOP" });
  const reason = stateApi.reduce(paused, { type: "OPEN_DESTINATION_INFO" });
  const revealed = stateApi.reduce(reason, {
    type: "REVEAL_DESTINATION",
    reason: "route_difficulty",
  });
  const publicRevealed = stateApi.toPublicView(revealed);

  assert.equal(hidden.destination, null);
  assert.equal(JSON.stringify(hidden).includes("테스트 빌딩"), false);
  assert.deepEqual(publicRevealed.destination, {
    name: "숨겨진 식당",
    address: "서울시 테스트로 1",
    building: "테스트 빌딩",
    floorUnit: "2층",
    entrance: "동쪽 출입구",
  });
});

test("confirmed end asks a distinct skippable Stop reason after ending", () => {
  const paused = stateApi.reduce(followingState(), { type: "STOP" });
  const confirm = stateApi.reduce(paused, { type: "REQUEST_END" });
  const reason = stateApi.reduce(confirm, { type: "CONFIRM_END", nowMs: 1000 });
  const stopped = stateApi.reduce(reason, { type: "SUBMIT_STOP_REASON", reason: "skipped" });

  assert.equal(confirm.phase, "stop_confirm");
  assert.equal(reason.phase, "stop_reason");
  assert.equal(reason.guidanceEnded, true);
  assert.equal(stopped.phase, "stopped");
  assert.equal(stopped.stopReason, "skipped");
  assert.equal(stopped.revealReason, null);
});

test("low-confidence and recomputing states never expose a bearing", () => {
  const recovery = stateApi.reduce(followingState(), { type: "LOW_CONFIDENCE", reason: "heading" });
  const recomputing = stateApi.reduce(recovery, { type: "RETRY_GUIDANCE" });
  assert.equal(stateApi.toPublicView(recovery).bearingDeg, null);
  assert.equal(stateApi.toPublicView(recomputing).bearingDeg, null);
});

test("external map requires disclosure warning from route recovery", () => {
  const recovery = stateApi.reduce(followingState(), { type: "LOW_CONFIDENCE", reason: "route" });
  const warning = stateApi.reduce(recovery, { type: "REQUEST_EXTERNAL_MAP" });
  const handoff = stateApi.reduce(warning, { type: "CONFIRM_EXTERNAL_MAP" });
  assert.equal(warning.phase, "external_map_warning");
  assert.equal(warning.revealed, false);
  assert.equal(handoff.phase, "external_map_handoff");
  assert.equal(handoff.revealed, true);
});

test("arrival automatically reveals verified arrival details and schedules feedback", () => {
  const arrived = stateApi.reduce(followingState(), { type: "ARRIVE", nowMs: 10_000 });
  const view = stateApi.toPublicView(arrived);
  assert.equal(arrived.phase, "arrived");
  assert.equal(arrived.revealed, true);
  assert.equal(arrived.feedbackEligibleAtMs, 3_610_000);
  assert.equal(view.destination.floorUnit, "2층");
});

test("arrival completion waits for feedback eligibility", () => {
  const arrived = stateApi.reduce(followingState(), { type: "ARRIVE", nowMs: 10_000 });
  const pending = stateApi.reduce(arrived, { type: "FINISH_ARRIVAL" });
  const early = stateApi.reduce(pending, { type: "CHECK_FEEDBACK", nowMs: 3_609_999 });
  const eligible = stateApi.reduce(pending, { type: "CHECK_FEEDBACK", nowMs: 3_610_000 });
  assert.equal(pending.phase, "feedback_pending");
  assert.equal(early.phase, "feedback_pending");
  assert.equal(eligible.phase, "place_reaction");
});
```

- [ ] **Step 2: Run the expanded reducer tests and verify RED**

Run:

```powershell
node --test prototype/vnext/state.test.js
```

Expected: FAIL on the first unimplemented `STOP`/Reveal/recovery/arrival assertion.

- [ ] **Step 3: Implement the remaining reducer transitions**

Add exact enumerations and phase guards:

```js
const REVEAL_REASONS = Object.freeze([
  "safety", "route_difficulty", "sensor_problem", "condition_check",
  "companion_check", "curiosity", "skipped",
]);
const STOP_REASONS = Object.freeze([
  "safety", "route_sensor", "condition_mismatch", "venue_problem",
  "change_of_mind", "schedule_change", "skipped",
]);
```

Implement these guarded actions in `reduce`; keep the existing guarded `START`, `FIND_SUCCESS`, and `FIND_NO_FIT` actions from Task 1 and add `PERMISSION_DENIED` for `constraints` or `finding` to return to constraints with a location-permission error:

```text
WALK: following/following_revealed → following, near, or arrived
STOP: following/near/following_revealed → paused with confidence=paused
CONTINUE_GUIDANCE: paused → recomputing
OPEN_DESTINATION_INFO: paused → reveal_reason
REVEAL_DESTINATION: reveal_reason → revealed only for REVEAL_REASONS
CONTINUE_AFTER_REVEAL: revealed → recomputing with revealed=true
REQUEST_END: paused/revealed → stop_confirm
CONFIRM_END: stop_confirm → stop_reason with guidanceEnded=true
SUBMIT_STOP_REASON: stop_reason → stopped only for STOP_REASONS
NEW_RECOMMENDATION: stopped → constraints with a guardedRecovery flag when nowMs-stoppedAtMs<300000
LOW_CONFIDENCE: following/near/following_revealed → route_recovery with confidence=low
RETRY_GUIDANCE: route_recovery → recomputing
USE_CACHED_ROUTE: route_recovery → recomputing
RECOVERY_READY: recomputing → following/following_revealed with confidence=ready
REQUEST_EXTERNAL_MAP: route_recovery → external_map_warning; revealed/arrived → external_map_handoff
CANCEL_EXTERNAL_MAP: external_map_warning → route_recovery
CONFIRM_EXTERNAL_MAP: external_map_warning → external_map_handoff with revealed=true
ARRIVE: following/near/following_revealed → arrived with revealed=true and feedbackEligibleAtMs=nowMs+3600000
FINISH_ARRIVAL: arrived → feedback_pending
CHECK_FEEDBACK: feedback_pending → place_reaction only when nowMs>=feedbackEligibleAtMs
REACT: place_reaction → complete only for dislike/like/love/did_not_visit
RESET: any → createInitialState({ firstUse: false })
```

Update `toPublicView` so exact destination fields are copied only when:

```js
const identityVisible = ["revealed", "following_revealed", "arrived"].includes(state.phase);
```

Use a `publicArrivalDetails(destination)` helper that maps missing or blank values to `null`; never create substitute building, floor, or entrance text.

- [ ] **Step 4: Run all reducer tests and verify GREEN**

Run:

```powershell
node --test prototype/vnext/state.test.js
```

Expected: all state tests pass with zero failure.

- [ ] **Step 5: Commit the complete state contract**

```powershell
git add -- prototype/vnext/state.js prototype/vnext/state.test.js
git commit -m "feat: add vnext safety and disclosure states"
```

## Task 3: Disclosure-Safe Screen Renderers

**Files:**
- Create: `prototype/vnext/screens.test.js`
- Create: `prototype/vnext/screens.js`

**Interfaces:**
- Consumes: only the `PublicJourneyView` returned by `stateApi.toPublicView`.
- Produces: `escapeHtml`, `renderProductScreen`, `renderPrototypeControls`, and `renderApp` in both CommonJS and `globalThis.SomewhereVNextScreens`.

- [ ] **Step 1: Write failing renderer tests**

Create `prototype/vnext/screens.test.js` with a `view(overrides)` fixture and these contracts:

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const screens = require("./screens.js");

function view(overrides = {}) {
  return {
    phase: "constraints",
    constraints: {
      category: "restaurant",
      maxWalkMinutes: 20,
      budget: null,
      dietary: [],
      accessibility: [],
      disclosure: "standard",
    },
    errors: {},
    distanceM: null,
    bearingDeg: null,
    confidence: "unavailable",
    menu: null,
    priceBand: null,
    destination: null,
    revealed: false,
    ...overrides,
  };
}

test("constraints show one start action and collapsed advanced settings", () => {
  const html = screens.renderProductScreen(view());
  assert.match(html, /이 조건으로 바로 출발/);
  assert.match(html, /<details[^>]*data-advanced-conditions/);
  assert.equal((html.match(/data-action="start"/g) || []).length, 1);
  assert.doesNotMatch(html, /이 장소로 출발|Reroll|다시 추천/);
});

test("constraints and finding do not render a compass", () => {
  assert.doesNotMatch(screens.renderProductScreen(view()), /compass-shell/);
  assert.doesNotMatch(
    screens.renderProductScreen(view({ phase: "finding" })),
    /compass-shell/,
  );
});

test("following and near use the same compass shell and no Reveal control", () => {
  const following = screens.renderProductScreen(view({
    phase: "following", distanceM: 850, bearingDeg: 40,
    confidence: "ready", menu: "국수", priceBand: "₩₩",
  }));
  const near = screens.renderProductScreen(view({
    phase: "near", distanceM: 70, bearingDeg: 12,
    confidence: "ready", menu: "국수", priceBand: "₩₩",
  }));
  assert.match(following, /class="compass-shell"/);
  assert.match(near, /class="compass-shell"/);
  assert.doesNotMatch(following, /Reveal|목적지 정보 확인|destination-name/);
  assert.match(following, /data-action="stop"/);
});

test("paused and reveal reason screens expose the approved branch controls", () => {
  const paused = screens.renderProductScreen(view({ phase: "paused", confidence: "paused" }));
  const reason = screens.renderProductScreen(view({ phase: "reveal_reason", confidence: "paused" }));
  assert.match(paused, /안내 계속/);
  assert.match(paused, /목적지 정보 확인/);
  assert.match(paused, /안내 종료/);
  assert.match(reason, /건너뛰고 확인/);
  assert.match(reason, /정확한 위치가 공개됩니다/);
});

test("external map warning requires explicit confirmation", () => {
  const html = screens.renderProductScreen(view({ phase: "external_map_warning" }));
  assert.match(html, /목적지가 공개될 수 있습니다/);
  assert.match(html, /data-action="cancel-external-map"/);
  assert.match(html, /data-action="confirm-external-map"/);
});

test("arrival renders escaped exact assistance fields and explicit unknowns", () => {
  const html = screens.renderProductScreen(view({
    phase: "arrived",
    revealed: true,
    destination: {
      name: "식당 <script>", address: "서울시 테스트로 1",
      building: "테스트 빌딩", floorUnit: null, entrance: "동쪽 출입구",
    },
  }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /식당 &lt;script&gt;/);
  assert.match(html, /층 정보 없음/);
  assert.match(html, /동쪽 출입구/);
});

test("guidance resumed after Reveal keeps identity disclosed", () => {
  const html = screens.renderProductScreen(view({
    phase: "following_revealed",
    revealed: true,
    distanceM: 500,
    bearingDeg: 25,
    confidence: "ready",
    destination: {
      name: "소담식당", address: "서울시 테스트로 1",
      building: "테스트 빌딩", floorUnit: "2층", entrance: "동쪽 출입구",
    },
  }));
  assert.match(html, /소담식당/);
  assert.match(html, /목적지 공개됨/);
});
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```powershell
node --test prototype/vnext/screens.test.js
```

Expected: FAIL because `prototype/vnext/screens.js` does not exist.

- [ ] **Step 3: Implement semantic state renderers**

Create `screens.js` with one function per visual state and exact dispatch attributes. Use this routing shape:

```js
function renderProductScreen(view) {
  const renderers = {
    onboarding: renderOnboarding,
    constraints: renderConstraints,
    finding: renderFinding,
    following: renderCompass,
    following_revealed: renderCompass,
    near: renderCompass,
    paused: renderPaused,
    reveal_reason: renderRevealReason,
    revealed: renderDestination,
    stop_confirm: renderStopConfirm,
    stop_reason: renderStopReason,
    stopped: renderStopped,
    route_recovery: renderRouteRecovery,
    recomputing: renderRecomputing,
    external_map_warning: renderExternalMapWarning,
    external_map_handoff: renderExternalMapHandoff,
    arrived: renderDestination,
    feedback_pending: renderFeedbackPending,
    place_reaction: renderPlaceReaction,
    complete: renderComplete,
  };
  const renderer = renderers[view.phase] || renderInvalidState;
  return `<section class="product-screen" data-phase="${escapeHtml(view.phase)}">${renderer(view)}</section>`;
}
```

Use these exact action names in rendered controls:

```text
continue-onboarding, start, stop, continue-guidance, open-destination-info,
reveal-destination, request-end, confirm-end, submit-stop-reason,
continue-after-reveal, request-external-map, cancel-external-map,
confirm-external-map, new-recommendation, retry-guidance, use-cached-route,
finish-arrival, check-feedback, react
```

`renderCompass` must emit one `.compass-shell` with a CSS custom property for the needle only:

```html
<div class="compass-shell" role="img" aria-label="경로 방향 40도, 안내 신뢰도 정상">
  <div class="compass-needle" style="--bearing:40deg" aria-hidden="true"></div>
</div>
```

When bearing is `null`, omit the needle style and render `방향을 다시 확인하고 있어요`; do not coerce it to zero degrees.

`renderRevealReason` includes six reason buttons plus:

```html
<button type="button" data-action="reveal-destination" data-reason="skipped">건너뛰고 확인</button>
```

`renderDestination` uses a helper that renders `층 정보 없음`, `건물 정보 없음`, or `입구 정보 없음` for corresponding `null` fields. It must never render a destination object when `view.destination` is `null`. `renderExternalMapWarning` states that handoff may reveal the destination and offers only cancel or confirm; `renderExternalMapHandoff` is a simulated handoff receipt and never embeds a real map.

When `renderCompass` receives `phase="following_revealed"` with a non-null destination, it renders `목적지 공개됨` and the escaped venue name above the stable three information rows. It does not attempt to hide already disclosed identity.

`renderPrototypeControls` emits an `<aside>` headed `프로토타입 제어 — 실제 앱 UI 아님` and buttons with `data-simulate` values `walk`, `near`, `arrive`, `no-fit`, `low-confidence`, `restore-confidence`, `permission-denied`, `missing-arrival-field`, `feedback-ready`, and `reset`.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run:

```powershell
node --test prototype/vnext/screens.test.js
```

Expected: all renderer tests pass with zero failure.

- [ ] **Step 5: Commit the renderers**

```powershell
git add -- prototype/vnext/screens.js prototype/vnext/screens.test.js
git commit -m "feat: render vnext sequence screens"
```

## Task 4: Deterministic Controller and Browser Shell

**Files:**
- Create: `prototype/vnext/controller.test.js`
- Create: `prototype/vnext/controller.js`
- Create: `prototype/vnext/app.js`
- Create: `prototype/vnext/index.html`
- Create: `prototype/vnext/style.css`

**Interfaces:**
- Consumes: Task 2 state API and Task 3 screen API.
- Produces: `createController(options)` and `mount(root, controlsRoot, options?)` in CommonJS and `globalThis.SomewhereVNextController`; a directly openable browser prototype.

- [ ] **Step 1: Write failing controller-effect tests**

Create `prototype/vnext/controller.test.js` using injected functions rather than a browser DOM:

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const stateApi = require("./state.js");
const { createController, MOCK_DESTINATION, MOCK_ROUTE } = require("./controller.js");

test("start schedules one automatic finding completion and no second commit", () => {
  const scheduled = [];
  const controller = createController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: () => {},
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    now: () => 1000,
  });

  controller.start({
    category: "restaurant", maxWalkMinutes: 20, budget: null,
    dietary: [], accessibility: [], disclosure: "standard",
  });
  controller.start({
    category: "restaurant", maxWalkMinutes: 20, budget: null,
    dietary: [], accessibility: [], disclosure: "standard",
  });

  assert.equal(controller.getState().phase, "finding");
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(controller.getState().phase, "following");
});

test("destroy cancels a pending finding completion", () => {
  const cancelled = [];
  const controller = createController({
    initialState: stateApi.createInitialState({ firstUse: false }),
    render: () => {},
    schedule: () => 91,
    cancel: (id) => cancelled.push(id),
    now: () => 1000,
  });
  controller.start({
    category: "cafe", maxWalkMinutes: 15, budget: null,
    dietary: [], accessibility: [], disclosure: "standard",
  });
  controller.destroy();
  assert.deepEqual(cancelled, [91]);
});

test("mock destination contains complete arrival assistance but remains internal", () => {
  assert.equal(typeof MOCK_DESTINATION.name, "string");
  assert.equal(typeof MOCK_DESTINATION.floorUnit, "string");
  assert.equal(Number.isFinite(MOCK_ROUTE.distanceM), true);
});
```

- [ ] **Step 2: Run controller tests and verify RED**

Run:

```powershell
node --test prototype/vnext/controller.test.js
```

Expected: FAIL because `prototype/vnext/controller.js` does not exist.

- [ ] **Step 3: Implement injected deterministic effects**

Create `controller.js` with frozen Korean fixture data and a single pending-effect slot:

```js
const MOCK_DESTINATION = Object.freeze({
  id: "pilot-restaurant-01",
  name: "소담식당",
  address: "서울시 성동구 테스트로 12",
  building: "어딘가 빌딩",
  floorUnit: "2층 201호",
  entrance: "건물 오른쪽 유리문으로 들어가 계단을 이용하세요.",
  menu: "국수",
  priceBand: "₩₩",
});
const MOCK_ROUTE = Object.freeze({ id: "mock-route-01", distanceM: 850, bearingDeg: 40 });
```

Expose `{ createController, mount }` on `globalThis.SomewhereVNextController`. Export `{ createController, mount, MOCK_DESTINATION, MOCK_ROUTE }` through CommonJS for tests; do not attach the fixtures to the browser global.

`createController` must:

1. own private `state`, `pendingEffect`, and `destroyed` values;
2. call injected `render(stateApi.toPublicView(state))` after every accepted transition;
3. make `start(constraints)` dispatch `START` and schedule exactly one 700 ms `FIND_SUCCESS` only when the resulting phase changes into `finding`;
4. ignore duplicate starts while already finding;
5. cancel the pending finding effect when no-fit, permission denial, reset, or destruction leaves `finding` before success;
6. use injected `now()` for confirmed Stop, arrival, guarded recovery, and feedback eligibility;
7. return a deep state copy from `getState` for tests only, never attach the controller or its private state to the DOM or a browser global; only `toPublicView` reaches render.

`mount` must add one delegated product click listener and one delegated prototype-control listener. It maps DOM data attributes to reducer actions and reads constraints using `FormData`. It returns the controller and a `destroy` method that removes both listeners.

Simulation mappings are exact:

```text
walk → WALK by 140 m
near → WALK to 70 m remaining
arrive → ARRIVE with nowMs
no-fit → FIND_NO_FIT while finding
low-confidence → LOW_CONFIDENCE reason=heading
restore-confidence → RETRY_GUIDANCE then RECOVERY_READY
permission-denied → PERMISSION_DENIED with a visible location-permission error
missing-arrival-field → remove fixture floorUnit before ARRIVE
feedback-ready → FINISH_ARRIVAL when needed, then CHECK_FEEDBACK at feedbackEligibleAtMs
reset → RESET
```

- [ ] **Step 4: Implement the semantic HTML shell and bootstrap**

Create `index.html` with `lang="ko"`, separate product and prototype-control landmarks, and this script order:

```html
<main id="app" aria-live="polite"></main>
<aside id="prototype-controls" aria-label="프로토타입 제어"></aside>
<script src="./state.js"></script>
<script src="./screens.js"></script>
<script src="./controller.js"></script>
<script src="./app.js"></script>
```

Create `app.js` as bootstrap only:

```js
"use strict";

(function init(globalScope) {
  function boot() {
    const root = globalScope.document?.querySelector("#app");
    const controls = globalScope.document?.querySelector("#prototype-controls");
    if (!root || !controls) return null;
    return globalScope.SomewhereVNextController.mount(root, controls);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { boot };
  globalScope.SomewhereVNextApp = { boot };
  if (globalScope.document) boot();
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 5: Implement monochrome low-fidelity CSS**

Create `style.css` with these non-negotiable structural rules:

```css
:root {
  color-scheme: light;
  --ink: #111;
  --paper: #fff;
  --line: #b7b7b7;
  --compass-size: min(58vw, 240px);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.compass-shell {
  width: var(--compass-size);
  height: var(--compass-size);
  border: 2px solid var(--ink);
  border-radius: 50%;
}

[data-phase="following"] .compass-shell,
[data-phase="following_revealed"] .compass-shell,
[data-phase="near"] .compass-shell {
  width: var(--compass-size);
  height: var(--compass-size);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.001ms !important; }
}
```

Also implement a centered phone-width product canvas, visible focus outlines, form spacing, plain bordered actions, a separate dashed prototype-control region, and responsive stacking. Do not add color accents, gradients, shadows, imagery, or decorative animation.

- [ ] **Step 6: Run state, screen, and controller tests**

Run:

```powershell
node --test prototype/vnext/*.test.js
```

Expected: all vNext tests pass with zero failure.

- [ ] **Step 7: Commit the runnable browser prototype**

```powershell
git add -- prototype/vnext/controller.js prototype/vnext/controller.test.js prototype/vnext/app.js prototype/vnext/index.html prototype/vnext/style.css
git commit -m "feat: add vnext sequence prototype"
```

## Task 5: Repository Contract, Manual Walkthrough, and Full Verification

**Files:**
- Create: `prototype/vnext/README.md`
- Modify: `tests/project_contract.test.js`
- Verify: `prototype/vnext/*`

**Interfaces:**
- Consumes: the complete Task 1-4 prototype.
- Produces: repository-level isolation evidence and a fresh end-to-end verification record in command output.

- [ ] **Step 1: Add a failing repository-isolation test**

Append to `tests/project_contract.test.js`:

```js
test("vNext sequence prototype is isolated from historical v0.1", () => {
  const required = [
    "prototype/vnext/README.md",
    "prototype/vnext/index.html",
    "prototype/vnext/style.css",
    "prototype/vnext/state.js",
    "prototype/vnext/screens.js",
    "prototype/vnext/controller.js",
    "prototype/vnext/app.js",
  ];
  for (const file of required) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} is missing`);
  }

  const vnextHtml = read("prototype/vnext/index.html");
  const historicalHtml = read("prototype/index.html");
  assert.match(vnextHtml, /Somewhere vNext/i);
  assert.match(historicalHtml, /Blind Compass Prototype/i);
  assert.doesNotMatch(vnextHtml, /prototype\/app\.js/);
});
```

- [ ] **Step 2: Run the isolation test and verify RED**

Run:

```powershell
node --test tests/project_contract.test.js
```

Expected: FAIL with `prototype/vnext/README.md is missing`.

- [ ] **Step 3: Add the prototype handoff README**

Create `prototype/vnext/README.md` with these exact sections and facts:

```markdown
# Somewhere vNext Sequence Prototype

This low-fidelity browser prototype demonstrates the approved vNext sequence. It is not the historical v0.1 prototype and does not use real location, provider, route, notification, BLE, account, or backend services.

## Open

Open `prototype/vnext/index.html` directly in a modern browser. No install or server is required.

## Product Path

Use the product canvas for onboarding, conditions, one-action start, compass guidance, Stop, Reveal reason, confirmed Stop, arrival details, and place reaction.

## Prototype Controls

The separately labeled prototype panel simulates finding, walking, near, arrival, no-fit, low confidence, permission denial, a missing arrival field, feedback eligibility, and reset. These controls are not proposed product UI.

## Limitations

All destinations, routes, sensor states, timing, and external-map behavior are deterministic mock evidence. Passing this prototype does not establish provider, iPhone, outdoor-navigation, legal, or field feasibility.
```

- [ ] **Step 4: Run the completed project contract and verify GREEN**

Run:

```powershell
node --test tests/project_contract.test.js
```

Expected: all project-contract tests pass with zero failure.

- [ ] **Step 5: Perform the keyboard walkthrough**

Open `prototype/vnext/index.html` in a browser and complete these exact paths using keyboard controls:

```text
onboarding → constraints → start → finding → following → near → arrived
following → Stop → destination information → skipped Reveal reason → revealed → resume
following → Stop → confirmed end → skipped Stop reason → stopped → new recommendation
following → low confidence → recomputing → following
arrived → 완료 → feedback pending → feedback-ready → place reaction → complete
```

Record any sequence defect as a failing reducer or renderer test before changing code. Confirm visually that constraints/finding have no compass; following/near use an unchanged compass size; the main compass has no Reveal; the debug panel is outside the product canvas; and exact identity first appears only after Reveal or arrival.

- [ ] **Step 6: Run focused and full verification**

Run:

```powershell
node --test prototype/vnext/*.test.js tests/project_contract.test.js
npm.cmd run verify
git diff --check
```

Expected: all focused tests and the full repository verification pass; `git diff --check` reports no errors. The existing v0.1 prototype contract remains green.

- [ ] **Step 7: Commit the repository contract and handoff**

```powershell
git add -- prototype/vnext/README.md tests/project_contract.test.js
git commit -m "test: protect vnext prototype isolation"
```

## Completion Criteria

Implementation is complete only when:

- every checkbox above has fresh evidence;
- the 18 specification verification items are covered by automated tests or the named keyboard walkthrough;
- no historical v0.1 file changed;
- no destination identity appears in pre-Reveal public HTML;
- the single start action reaches following without a second product confirmation;
- Stop, Reveal reason, Stop reason, arrival disclosure, recovery, and feedback branches are all demonstrable;
- the prototype remains visibly low fidelity and no visual-design decision is implied;
- the user receives the direct local prototype path, verification counts, known simulation limits, and a list of commits created during execution.
