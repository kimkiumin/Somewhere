# Somewhere vNext App Sequence Prototype Design

Status: approved sequence captured for final written review

Date: 2026-07-26

Constraint-screen amendment: 2026-08-12

## Purpose

Build a low-fidelity browser prototype that makes the approved Somewhere vNext app sequence tangible before visual styling or native implementation. The prototype demonstrates screen order, disclosure timing, state transitions, and safety/recovery branches. It does not test brand design, recommendation quality, real location, provider data, iOS behavior, or physical hardware.

## Authority and Blueprint Amendments

The user approved the sequence represented in the visual companion on 2026-07-26. When this written design receives final approval, it supersedes these earlier blueprint details for the prototype and subsequent vNext reconciliation:

1. `S3 One Place Ready` and `S4 Committed` no longer require a second product button. The constraint-screen action `이 조건으로 바로 출발` is both the selection request and explicit consent to begin guidance when a qualified place and route are ready.
2. The main compass screen has no directly visible Reveal control and no Reveal item in its ordinary secondary menu. Pre-arrival destination information is reached only after the user presses Stop and guidance pauses.
3. Selecting `목적지 정보 확인` after Stop does not confirm Stop. The user first selects or skips a Reveal reason, sees exact destination information, and may resume the same journey.
4. Confirmed arrival automatically reveals source-supported arrival details: venue name, exact address, building, floor/unit, and entrance guidance. Unknown details remain explicitly unavailable and are never inferred.

All other approved vNext rules remain active: one destination, no candidate list, no active Reroll, immediate Stop pause, skippable reasons, guarded recommendation recovery, route-aware guidance, and delayed place reaction.

The 2026-08-12 constraint-screen amendment fixes the category to restaurant for this prototype, adds a 1–5+ party-size selector above walking time, moves walking time and budget into the primary condition area, uses wheel-adjustable numeric sliders, and reserves the final budget value for `상관없음`. The default party size is two; `5` represents `5명 이상`. Party size is passed as a required recommendation input but does not yet calculate menu quantity or group totals. Budget remains per-person. Budget stops start at 4,000 KRW, use 2,000 KRW increments through 20,000 KRW, then 30,000/40,000/50,000 KRW and unlimited. The 4,000 KRW floor is a product hypothesis rounded up from official Seoul reference prices near 3,700–3,800 KRW for a kimbap serving; it is not a guarantee that every area has a qualifying venue. Wheel input is treated as a 1,000 KRW directional intent but settles on even-thousand valid stops, so an odd legacy value such as 11,000 KRW moves to 10,000 KRW when scrolling down and 12,000 KRW when scrolling up. Minimum disclosure (walking time, budget, and main menu) is the default with optional private mode. Dietary and allergy choices are collected during first-use profile setup and edited later through the top-right Profile → Settings search/list multi-select, not in the recurring constraints form. The prototype menu includes a non-functional logout placeholder because authentication is out of scope.

## Prototype Scope

### Included

- first-use onboarding summary;
- compact constraint entry;
- collapsed advanced conditions;
- one product action from constraints into automatic selection and guidance;
- calm finding state without candidates or compass;
- fixed-size compass shell during following and near states;
- route-confidence suppression and recovery choices;
- immediate Stop pause;
- Continue, destination-information, and confirmed-end branches;
- Reveal-reason choice with `건너뛰고 확인`;
- destination information followed by resume, external-map handoff, or end;
- separate skippable Stop-reason flow;
- guarded new-recommendation return to constraints;
- automatic arrival disclosure;
- simulated 60-minute reaction eligibility;
- a visibly separate prototype-control panel for deterministic state simulation.

### Excluded

- visual identity, production typography, color, material, animation polish, illustration, photography, and haptics;
- real GPS, heading, walking routes, place/provider APIs, notifications, BLE, accounts, backend, analytics upload, and persistence guarantees;
- candidate browsing, visible maps, rankings, reviews, active Reroll, or a second pre-guidance confirmation button;
- claims about iPhone behavior, outdoor navigation, provider completeness, legal compliance, or user outcomes.

## Information Architecture

### Constraint Screen

Visible by default:

- category: restaurant (cafe deferred);
- party size: 1, 2, 3, 4, or 5+ with arrow controls and repeated pawn silhouettes;
- maximum walking time on a 5-minute-step slider;
- budget on a slider starting at 4,000 KRW, using 2,000 KRW steps through 20,000 KRW and ending with coarse stops plus `상관없음`;
- primary action: `이 조건으로 바로 출발`.

Collapsed under `고급 조건`:

- accessibility requirements;
- destination disclosure preference.

The default disclosure is minimum information (walking time, budget, and main menu), with an optional private setting. Dietary and allergy values are shown as applied profile conditions but edited only in the searchable multi-select Settings screen opened from the top-right profile menu. The constraints screen keeps the single `이 조건으로 바로 출발` CTA and does not show a profile-edit CTA. When advanced constraints are active, the collapsed row summarizes their count or types, such as `추가 조건 2개 적용 중`. Safety-relevant conditions are never silently hidden from the user or ignored by selection logic.

### Compass Screen

The compass appears only after a qualified destination and route are prepared. It enters at its final size and never grows between screens.

The stable content hierarchy is:

```text
fixed-size compass
remaining distance
representative menu or broad category
price band
status area
Stop
```

The exact venue identity, address, building, floor, entrance, photo, review, rating, and map remain hidden before Reveal or confirmed arrival.

### Arrival Screen

Arrival ends directional pointing and automatically reveals every verified arrival-assistance field:

- venue name;
- exact address;
- building name;
- floor and unit;
- entrance or final approach guidance;
- external-map action;
- completion action.

Missing fields display a neutral unavailable state. The prototype fixture includes all fields so the intended hierarchy can be evaluated, while a separate simulation demonstrates one missing field.

## Main State Sequence

```text
onboarding (first use only)
→ profile_setup (first use only)
→ constraints
→ finding
→ following
→ near
→ arrived
→ feedback_pending
→ place_reaction
→ complete
```

### Single-Action Start

`이 조건으로 바로 출발` performs one product-level commitment:

1. validate visible and advanced constraints;
2. request location permission only if required and not already decided;
3. enter `finding` immediately;
4. prepare a qualified hidden destination and route;
5. enter `following` automatically when route, location, and heading confidence are ready.

There is no `한 곳 준비`, `이 장소로 출발`, or equivalent second button. A platform-owned permission dialog is not represented as a second product confirmation. The browser prototype defaults permission to authorized and exposes denial only through prototype controls.

### Finding

The screen shows calm progress and no candidates, destination identity, or compass. Success enters `following` automatically. A deterministic no-fit simulation returns to constraints with the affected conditions identified and never substitutes an unqualified place.

### Following and Near

The fixed compass changes only its needle, confidence treatment, distance, and state label. The transition to `near` does not resize the compass. Arrival is triggered by prototype controls that stand in for repeated accurate samples and route-progress consistency.

## Stop, Reveal, and End Branches

### Immediate Pause

Pressing Stop synchronously enters `paused` before any reason, dialog, or simulated network action. The needle becomes stationary or hidden.

```text
following or near
→ Stop
→ paused
```

The paused action sheet contains exactly:

- `안내 계속`;
- `목적지 정보 확인`;
- `안내 종료`.

The initial Stop tap is a pause event, not a confirmed-end event.

### Destination Information

```text
paused
→ 목적지 정보 확인
→ reveal_reason
→ select one reason or 건너뛰고 확인
→ revealed
```

Reveal reasons are versioned and separate from Stop reasons:

- safety concern;
- difficulty finding the route or entrance;
- route or sensor problem;
- need to verify a condition;
- need to confirm with a companion;
- curiosity;
- skipped.

The reason screen states that continuing will reveal the venue name and exact location. `건너뛰고 확인` is always visible. No free-text reason is collected.

The revealed screen contains exact arrival information and offers:

- `나침반 안내 계속`;
- `외부 지도 열기`;
- `안내 종료`.

Resuming enters `following_revealed`; once disclosed, identity is not pretended to be hidden again. Reveal does not count as Stop, failure, or recommendation restart.

### Confirmed End

```text
paused or revealed
→ 안내 종료
→ stop_confirm
→ 종료 확인
→ stop_reason
→ select one reason or 건너뛰기
→ stopped
```

Stop reasons remain the approved short taxonomy: safety, route/sensor problem, hard-condition mismatch, venue situation problem, change of mind, and schedule change. The reason occurs only after guidance has ended and never blocks exit.

`새로운 장소 찾기` from `stopped` reopens constraints. Within five minutes it applies the recorded reason-specific review; after five minutes it follows the normal constraint flow. The prototype does not expose a Reroll action.

## Route-Confidence Branch

```text
following or near
→ low confidence
→ route_recovery
→ recalibrate / reroute / cached route / external map / Stop
→ recomputing
→ following or following_revealed
```

The compass remains the same size but emits no directional claim while confidence is low or recomputation is incomplete. External-map handoff warns that the destination may be revealed. A safety Stop never triggers automatic reroute, resume, or external-map launch.

## Prototype Controls

Because the prototype has no real sensors or provider services, a separate debug panel drives evidence states. It is visually and semantically labeled `프로토타입 제어 — 실제 앱 UI 아님`.

Controls include:

- complete finding successfully;
- return no-fit;
- advance simulated walking distance;
- trigger near;
- confirm arrival;
- simulate one unavailable arrival-assistance field;
- trigger low confidence;
- restore confidence;
- simulate location permission denial;
- advance the feedback clock by 60 minutes;
- reset the prototype.

Product screens never use debug controls as ordinary journey actions.

## Architecture

The approved implementation target is an isolated browser prototype under `prototype/vnext/`, preserving the existing root `prototype/` as historical v0.1 evidence.

Planned boundaries:

```text
prototype/vnext/
  index.html          semantic shell and prototype-control region
  style.css           monochrome low-fidelity wireframe layout
  state.js            pure reducer, invariants, public view model
  screens.js          escaped screen rendering from public view model
  app.js              DOM events and deterministic simulated effects
  state.test.js       transition, disclosure, and safety contracts
  screens.test.js     visible-control and hidden-data contracts
```

`state.js` owns every journey transition. `screens.js` receives a public view model that excludes hidden identity fields unless the state is `revealed`, `following_revealed`, or `arrived`. `app.js` may schedule finding and feedback simulations but cannot directly mutate journey state.

The prototype uses plain HTML, CSS, and JavaScript with Node's built-in test runner. It adds no framework or production dependency.

## Low-Fidelity Presentation Rules

- monochrome background, borders, and system text;
- no gradients, shadows, images, logos, decorative icons, material simulation, or branded motion;
- stable phone-sized central canvas with responsive desktop framing;
- real Korean labels where wording affects sequence comprehension;
- compass represented by simple circles, ticks, and a needle;
- state changes expressed through structure and text rather than aesthetic polish;
- prototype controls visually separated from the product canvas.

## Accessibility and Interaction

- every action is a semantic button;
- advanced settings use an accessible disclosure control;
- modal-like steps have headings and receive focus;
- keyboard interaction follows DOM order;
- Stop is reachable without gesture timing;
- `건너뛰고 확인` and Stop-reason `건너뛰기` are explicit controls;
- direction is never communicated by the needle alone; state text accompanies it;
- no interaction depends on color or animation;
- reduced-motion preferences disable optional needle transition.

## Failure and Data Rules

- malformed or missing required constraints prevent the single start action and identify the field;
- high-consequence unknowns return no-fit rather than pass;
- finding, permission, route, and confidence failures never reveal a candidate or fabricate direction;
- hidden destination fields never enter pre-Reveal rendered HTML, accessible labels, notifications, logs, or debug summaries;
- exact destination information is allowed only in `revealed`, `following_revealed`, and `arrived` public models;
- Stop pause occurs synchronously;
- duplicate clicks are idempotent for finding, Stop confirmation, Reveal, arrival, and reaction;
- unknown actions and illegal transitions fail closed without changing state.

## Verification

The prototype is acceptable when automated tests and a manual walkthrough demonstrate:

1. advanced conditions are collapsed by default and visibly summarized when active;
2. one product button proceeds from valid constraints through finding into following;
3. no second commit/start button exists;
4. the compass is absent during constraints/finding and fixed in size during following/near;
5. pre-Reveal HTML contains no destination identity or exact location;
6. Stop pauses before any sheet choice;
7. the main compass screen has no Reveal control;
8. destination information is reachable only through the paused sheet before arrival;
9. Reveal requires one reason selection or `건너뛰고 확인`;
10. Reveal and Stop reasons remain distinct;
11. resuming after Reveal preserves the disclosed state;
12. confirmed Stop asks a skippable reason only after ending;
13. no active Reroll appears;
14. low-confidence and recomputing states do not point;
15. arrival automatically shows verified name, address, building, floor/unit, and entrance information;
16. simulated feedback appears only after eligibility advances;
17. all main and branch sequences can be completed using keyboard controls;
18. the existing v0.1 and repository verification suites remain unchanged and passing.

## Implementation Boundary

This design authorizes a sequence prototype only after final written approval. It does not authorize real APIs, location capture, iOS code, backend services, analytics, provider accounts, secrets, deployment, purchases, participant tests, or changes to the historical v0.1 behavior. Canonical blueprint text should be reconciled in the implementation plan so it no longer describes a second commit button or an always-available secondary Reveal path.
