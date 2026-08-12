# 턴바이턴 도보 안내 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the vNext prototype's directional compass needle with a safe, map-free turn-by-turn guidance surface that always shows current heading, next action, distance to that action, and total remaining distance while keeping the destination private.

**Architecture:** Keep the reducer as the source of truth. Normalize route steps inside the state boundary, derive only the current step window for the public view, and render a navigation guidance block from that public view. The controller supplies deterministic mock steps; production API integration remains a documented backend adapter boundary.

**Tech Stack:** Plain HTML, CSS, and JavaScript; existing browser/CommonJS wrappers; Node.js built-in node:test; no new runtime dependency or provider credential.

## Global Constraints

- Keep destination name, address, building, floor, entrance, and exact coordinates out of pre-Reveal public views and HTML.
- Always expose current heading, next maneuver, distance to the next maneuver, and total remaining distance when route confidence is ready.
- Suppress new maneuver claims during paused, route recovery, and recomputing states; show status instead.
- Preserve the existing Stop, Reveal-reason, guarded recovery, arrival, and feedback transitions.
- Do not add a visible map or a provider API key to the browser prototype.
- Keep the prototype mobile-first and readable at a 320px CSS viewport.
- Follow docs/superpowers/specs/2026-08-12-turn-by-turn-guidance-ui-design.md.

---

### Task 1: Add normalized route-step derivation to the reducer

**Files:**
- Modify: prototype/vnext/state.js
- Test: prototype/vnext/state.test.js

**Interfaces:**
- Consumes FIND_SUCCESS actions with a route containing optional steps.
- Produces public currentHeading, nextStep, distanceToNextM, remainingDistanceM, and routeStatus fields.

- [ ] Step 1: Write failing state tests.

Add a route with two steps and assert:

~~~js
const view = stateApi.toPublicView(followingWithSteps());
assert.equal(view.remainingDistanceM, 400);
assert.equal(view.currentHeading, "동쪽");
assert.equal(view.nextStep.maneuver, "TURN_RIGHT");
assert.equal(view.distanceToNextM, 120);
~~~

Also test that walking past the first step activates the next step and that recovery/paused views expose nextStep: null while preserving the last known remainingDistanceM.

- [ ] Step 2: Run the focused state tests and verify RED.

Run: node --test prototype/vnext/state.test.js

Expected: FAIL because the public view does not expose normalized turn guidance.

- [ ] Step 3: Implement the smallest derivation helpers.

In state.js, normalize routes with legacy routes without steps by creating one straight step. Add a pure helper that compares route.distanceM - state.distanceM with cumulative segment lengths and returns the active step, its remaining distance, and heading. Include routeStatus ready only when confidence is ready and the route has finite distance; otherwise suppress nextStep and use recomputing, paused, or unavailable.

Keep bearingDeg for existing compatibility tests, but do not use it to render the product screen.

- [ ] Step 4: Run focused state tests and the full reducer suite.

Run: node --test prototype/vnext/state.test.js

Expected: all state tests pass.

- [ ] Step 5: Commit the reducer contract.

~~~powershell
git add prototype/vnext/state.js prototype/vnext/state.test.js
git commit -m "feat: expose normalized turn guidance"
~~~

### Task 2: Supply a deterministic multi-step mock route

**Files:**
- Modify: prototype/vnext/controller.js
- Test: prototype/vnext/controller.test.js

**Interfaces:**
- Consumes the state route-step contract from Task 1.
- Produces MOCK_ROUTE.steps totaling 850m and existing walk controls that advance the derived active step.

- [ ] Step 1: Write failing controller assertions.

Assert that the mock route contains four ordered steps, segment distances total 850m, and one simulated walk still exposes remainingDistanceM, nextStep, and distanceToNextM.

- [ ] Step 2: Run the focused controller test and verify RED.

Run: node --test prototype/vnext/controller.test.js

Expected: FAIL because MOCK_ROUTE has no step list.

- [ ] Step 3: Add mock steps without changing the public destination.

Add straight, right-turn, left-turn, and arrival-adjacent steps to MOCK_ROUTE with Korean instructions, headings, and road labels. Keep MOCK_ROUTE private. Existing walk, near, and arrive actions continue to dispatch distance changes only.

- [ ] Step 4: Run focused controller tests.

Run: node --test prototype/vnext/controller.test.js

Expected: all controller tests pass.

- [ ] Step 5: Commit the mock route.

~~~powershell
git add prototype/vnext/controller.js prototype/vnext/controller.test.js
git commit -m "feat: add mock turn-by-turn route"
~~~

### Task 3: Replace the compass renderer with the navigation guidance surface

**Files:**
- Modify: prototype/vnext/screens.js
- Test: prototype/vnext/screens.test.js

**Interfaces:**
- Consumes public guidance fields from Task 1.
- Produces HTML with navigation-guidance, current-heading, next-maneuver, distance-to-maneuver, and remaining-distance hooks.

- [ ] Step 1: Write failing screen tests.

Render a ready following view and assert:

~~~js
assert.match(html, /class="navigation-guidance"/);
assert.match(html, /현재 방향/);
assert.match(html, /동쪽/);
assert.match(html, /오른쪽/);
assert.match(html, /120m/);
assert.match(html, /680m/);
assert.doesNotMatch(html, /compass-shell|compass-needle/);
assert.doesNotMatch(html, /destination-name|서울시 테스트로/);
~~~

Add recovery, recomputing, and paused tests that assert no active maneuver text is rendered and status copy is present.

- [ ] Step 2: Run focused screen tests and verify RED.

Run: node --test prototype/vnext/screens.test.js

Expected: FAIL because the renderer still emits the compass shell.

- [ ] Step 3: Implement the navigation renderer.

Replace renderCompassShell with a renderer that maps maneuver enums to Korean labels and arrows, displays current heading, next instruction and step distance, total remaining distance, and route status. Render a status-only block when nextStep is absent. Use the same renderer in following, near, paused, route recovery, and recomputing branches. Keep menu/price disclosure rows.

- [ ] Step 4: Run focused screen tests.

Run: node --test prototype/vnext/screens.test.js

Expected: all screen tests pass after updating compass-specific expectations and adding visibility assertions.

- [ ] Step 5: Commit the screen contract.

~~~powershell
git add prototype/vnext/screens.js prototype/vnext/screens.test.js
git commit -m "feat: render turn-by-turn guidance"
~~~

### Task 4: Add responsive and reduced-motion styling

**Files:**
- Modify: prototype/vnext/style.css
- Test: browser walkthrough and existing screen markup tests

**Interfaces:**
- Consumes navigation renderer class hooks from Task 3.
- Produces a readable 320px–390px layout without horizontal overflow and without compass animation.

- [ ] Step 1: Add CSS hooks.

Add styles for navigation-guidance, guidance-summary, next-maneuver, turn-arrow, remaining-distance, and navigation-guidance.is-unavailable using the existing monochrome tokens.

- [ ] Step 2: Add reduced-motion handling.

Keep the new arrow static and disable any residual transition on guidance status and maneuver blocks inside the existing reduced-motion media query.

- [ ] Step 3: Run the local tests and inspect responsive viewports.

Run: npm.cmd run verify

Verify at 390px and 320px that the next-action sentence, total distance, and Stop button remain visible without horizontal scrolling.

- [ ] Step 4: Commit styling.

~~~powershell
git add prototype/vnext/style.css
git commit -m "style: make turn guidance mobile readable"
~~~

### Task 5: Reconcile product docs and record API feasibility evidence

**Files:**
- Modify: docs/blueprint/app_sequence.md
- Modify: docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md
- Modify: prototype/vnext/README.md
- Create: docs/research/route_guidance_api_validation.md

**Interfaces:**
- Consumes the approved UI contract and provider research in the design spec.
- Produces dated, source-linked documentation separating mock evidence from real-provider gates.

- [ ] Step 1: Update active sequence wording.

Replace the compass-only following display with current heading, next maneuver, distance to next maneuver, total remaining distance, status, and Stop. Preserve the no-map rule and destination privacy.

- [ ] Step 2: Add the API validation artifact.

Record provider, endpoint/framework, step fields, authentication, quota/pricing, walking limitations, privacy implications, and required user-gated actions. Cite official Apple, Google, Kakao, and NAVER pages with access date 2026-08-12. State that no account, key, contract, payment, or real call was performed.

- [ ] Step 3: Update the prototype README.

Describe the mock turn-by-turn surface, deterministic route limitation, and server-side adapter requirement for hidden destinations.

- [ ] Step 4: Run documentation and prototype checks.

Run: npm.cmd run verify

Expected: all tests and harness/check-prototype-contract.ps1 pass.

- [ ] Step 5: Commit documentation.

~~~powershell
git add docs/blueprint/app_sequence.md docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md prototype/vnext/README.md docs/research/route_guidance_api_validation.md
git commit -m "docs: record turn guidance API feasibility"
~~~

### Task 6: Browser walkthrough and completion verification

**Files:**
- Verify: prototype/vnext/index.html, prototype/vnext/app.js, and all changed files

- [ ] Step 1: Start or reuse the local preview with query v=turn-guidance-20260812.

- [ ] Step 2: Walk the product flow.

Start onboarding, save the profile, start a restaurant journey, wait for finding to complete, and verify current heading, next maneuver, distance to maneuver, total remaining distance, menu/price, and Stop without a compass shell.

- [ ] Step 3: Exercise state branches.

Use prototype controls to enter near, route recovery, recomputing, paused, arrival, and reveal flows. Verify no stale turn claim appears in recovery or pause and destination identity remains hidden until the approved reveal/arrival path.

- [ ] Step 4: Run final verification.

Run: npm.cmd run verify

Expected: all tests pass and the prototype contract check reports Prototype UX contract markers OK.

- [ ] Step 5: Review the diff and commit final fixes.

~~~powershell
git status --short
git diff --check
git log -1 --oneline
~~~

