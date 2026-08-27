# Main Compass Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text Start button with a first-viewport compass button and reuse the same compass shell through destination search and route guidance, while moving condition editing below the fold.

**Architecture:** Keep the existing reducer and controller transitions unchanged. Extend the existing `renderCompassShell` renderer so it can emit either an interactive launch button or a status instrument, then reorganize the constraints form into a launch section and a below-fold settings section. CSS owns viewport placement and state motion; screen tests verify semantic structure and state continuity.

**Tech Stack:** Plain HTML strings, CSS, JavaScript, Node.js `node:test`, existing static prototype controller.

## Global Constraints

- Public name remains exactly `Roll the compass!`.
- There is exactly one `data-action="start"` control in constraints and no second confirmation after finding.
- The same `compass-shell` and `compass-needle` markup is used in constraints, finding, following, near, paused, and recovery.
- `지금 필요한 조건` begins below the initial launch viewport.
- Existing profile, party, walking-time, budget, disclosure, guarded-recovery, Stop, Reveal, and arrival behavior does not change.
- Destination identity remains hidden before approved disclosure or arrival.
- Reduced-motion users receive text status without continuous rotation.
- No framework or dependency is added.

---

### Task 1: Shared Compass States and Screen Structure

**Files:**
- Modify: `prototype/vnext/screens.test.js`
- Modify: `prototype/vnext/screens.js`

**Interfaces:**
- Consumes: `renderProductScreen(view)` and the current `data-action="start"` controller contract.
- Produces: `renderCompassShell(view, options?)`, where `options.action === "start"` returns a native button and status calls return a non-interactive instrument.

- [ ] **Step 1: Replace the old no-compass assertion with failing launch, finding, and continuity tests**

Add behavior tests equivalent to:

```js
test("constraints use one compass button before the below-fold settings", () => {
  const html = screens.renderProductScreen(view());
  assert.equal((html.match(/data-action="start"/g) || []).length, 1);
  assert.match(html, /<button[^>]*class="compass-shell compass-action"[^>]*data-action="start"/);
  assert.match(html, /aria-label="이 조건으로 바로 출발"/);
  assert.match(html, /compass-needle is-ready/);
  assert.ok(html.indexOf("constraints-launch") < html.indexOf("지금 필요한 조건"));
  assert.match(html, /id="condition-settings"/);
});

test("finding reuses the compass shell with a searching needle", () => {
  const html = screens.renderProductScreen(view({ phase: "finding" }));
  assert.match(html, /class="compass-shell"/);
  assert.match(html, /compass-needle is-searching/);
  assert.doesNotMatch(html, /compass-needle is-pointing|data-action="start"/);
});
```

Update the existing guarded-recovery expectation to check the single compass Start action rather than the removed text-button markup.

- [ ] **Step 2: Run focused tests and verify the expected failure**

Run:

```powershell
node --test prototype/vnext/screens.test.js
```

Expected: failures report that constraints have no `compass-action` or `is-ready` needle, finding has no `compass-shell`, and the old text-button expectation no longer matches the desired structure.

- [ ] **Step 3: Extend the shared compass renderer**

In `renderCompassShell`, add an `is-ready` needle state and build the same inner structure for both semantic forms:

```js
const compassContent = `<span class="compass-north" aria-hidden="true">N</span>
  <span class="compass-needle ${needleState}"${needleStyle} aria-hidden="true"></span>`;

if (options.action === "start") {
  return `<button type="button" class="compass-shell compass-action" data-action="start"
    aria-label="이 조건으로 바로 출발">${compassContent}<span class="compass-action-label">출발</span></button>`;
}

return `<div class="compass-shell" role="img" aria-label="${escapeHtml(status)}">${compassContent}</div>`;
```

Use `renderCompassShell({ needleMode: "ready" }, { action: "start" })` in the constraints launch section and `renderCompassShell({ needleMode: "searching" })` in finding. Keep `renderNavigationGuidance` on the same function.

Rebuild `renderConstraints` as one form with this exact hierarchy. Keep the current slider expressions and option selection expressions unchanged inside the named blocks:

```js
return `<form data-form="constraints" class="constraints-home">
  <section class="constraints-launch">
    <header class="launch-header">
      <h1>Roll the compass!</h1>
      ${renderProfileMenu(view)}
    </header>
    <div class="launch-action">
      <p>나침반을 눌러 한 곳으로 출발해요.</p>
      ${renderCompassShell({ needleMode: "ready" }, { action: "start" })}
    </div>
    <a class="condition-scroll-cue" href="#condition-settings">조건 설정</a>
  </section>
  <section class="condition-settings" id="condition-settings" aria-labelledby="condition-settings-title">
    <h2 id="condition-settings-title">지금 필요한 조건</h2>
    <p>인원, 도보 시간과 예산을 조정할 수 있어요.</p>
    ${renderConstraintErrors(view.errors)}
    ${renderAffectedConditions(view.affectedConditions)}
    <input type="hidden" name="category" value="restaurant">
    ${renderPartySelector(constraints)}
    <div class="slider-field"><label for="walk-time-slider">도보 시간 <output id="walk-time-value">${escapeHtml(minutes)}분</output></label><input id="walk-time-slider" name="maxWalkMinutes" type="range" min="5" max="60" step="5" value="${escapeHtml(minutes)}" data-slider="walk" aria-label="최대 도보 시간"></div>
    <div class="slider-field"><label for="budget-slider">예산 <output id="budget-value"${budgetAmount == null ? " data-budget-unlimited" : ""}>${budgetAmount == null ? "상관없음" : `${escapeHtml(budgetAmount.toLocaleString("ko-KR"))}원 이하`}</output></label><input id="budget-slider" name="budget" type="range" min="0" max="12" step="1" value="${escapeHtml(budgetStep)}" data-slider="budget" data-budget-amount="${budgetAmount == null ? "" : escapeHtml(budgetAmount)}" aria-label="1인 예산"></div>
    <details data-advanced-conditions>
      <summary>${escapeHtml(advancedSummary)}</summary>
      <label>목적지 공개 수준 <select name="disclosure">
        <option value="minimal"${disclosure === "minimal" ? " selected" : ""}>최소 정보 공개 (도보시간 · 예산 · 주요 메뉴)</option>
        <option value="private"${disclosure === "private" ? " selected" : ""}>비공개</option>
      </select></label>
    </details>
    ${renderGuardedRecovery(view)}
  </section>
</form>`;
```

Do not add another Start control below the settings.

- [ ] **Step 4: Run focused tests and verify green**

Run:

```powershell
node --test prototype/vnext/screens.test.js prototype/vnext/controller.test.js
```

Expected: all screen and controller tests pass; the existing controller activates the compass button through `data-action="start"` without state changes.

- [ ] **Step 5: Commit the shared behavior**

```powershell
git add prototype/vnext/screens.js prototype/vnext/screens.test.js
git commit -m "feat: carry compass from launch into guidance"
```

---

### Task 2: First-Viewport Launch Composition

**Files:**
- Modify: `prototype/vnext/style.css`
- Modify: `prototype/vnext/index.html`

**Interfaces:**
- Consumes: `.constraints-launch`, `.launch-header`, `.launch-action`, `.condition-settings`, `.compass-action`, and `.compass-needle.is-ready` from Task 1.
- Produces: a mobile-first first viewport with settings below the fold and consistent compass size/state styling.

- [ ] **Step 1: Add launch-layout styles without changing the global prototype width**

Add phase-scoped rules:

```css
.product-screen[data-phase="constraints"] {
  display: block;
  padding: 0;
}

.constraints-home {
  display: block;
}

.constraints-launch {
  min-height: max(600px, calc(100svh - 48px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: clamp(24px, 7vw, 40px);
}

.launch-action {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
}

.condition-settings {
  display: grid;
  gap: 16px;
  padding: clamp(32px, 8vw, 48px) clamp(24px, 7vw, 40px);
  border-top: 1px solid var(--ink);
}
```

Style `.compass-action` by overriding generic button padding/background while retaining focus visibility, add a small hover/active transform, and give `.is-ready` the same needle geometry as pointing but a fixed neutral rotation. Move the `N` label from the shell pseudo-element into `.compass-north` so button and instrument share identical internal markup.

- [ ] **Step 2: Preserve responsive and reduced-motion behavior**

At mobile widths, keep the initial section aligned to the safe viewport and retain the existing 220px narrow-screen compass cap. Under reduced motion, remove launch transitions and searching rotation while leaving live text visible.

- [ ] **Step 3: Bump static asset query versions**

In `prototype/vnext/index.html`, change the four local asset query strings to the shared token `main-compass-launch-20260817` so an existing public browser tab does not reuse old CSS or JavaScript.

- [ ] **Step 4: Run the focused and full automated suite**

Run:

```powershell
node --test prototype/vnext/screens.test.js prototype/vnext/controller.test.js tests/pages_artifact_contract.test.js
npm.cmd run verify
```

Expected: every test passes and the prototype contract script reports `Prototype UX contract markers OK.`

- [ ] **Step 5: Commit the layout**

```powershell
git add prototype/vnext/style.css prototype/vnext/index.html
git commit -m "feat: move conditions below compass launch"
```

---

### Task 3: Product Contract, Browser Verification, and Publication

**Files:**
- Modify: `docs/blueprint/app_sequence.md`
- Modify: `docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md`
- Modify: `prototype/vnext/README.md`

**Interfaces:**
- Consumes: the verified launch/search/guidance behavior from Tasks 1 and 2.
- Produces: an updated active sequence contract and a published isolated prototype.

- [ ] **Step 1: Update active documentation**

Record that the first constraints viewport is a compass Start surface, condition editing is below the fold in the same form, and finding reuses the same rotating compass before guidance points it. State the hypothesis: visual continuity makes the single-action transition from decision to movement easier to understand.

- [ ] **Step 2: Verify the browser at representative sizes**

Serve `prototype/vnext/`, then verify at 390x844, 320x568, and a desktop width:

- the first viewport does not show `지금 필요한 조건`;
- the compass button is centered and keyboard-activatable;
- scrolling reaches all settings;
- Start changes the same compass to searching and then pointing guidance;
- the finding screen exposes no direction claim;
- reduced motion stops continuous rotation;
- browser console and page errors are empty.

- [ ] **Step 3: Run final verification and inspect the diff**

```powershell
npm.cmd run verify
git diff --check
git status --short --branch
```

Expected: 0 failures, no whitespace errors, and only the planned documentation changes remain before commit.

- [ ] **Step 4: Commit documentation**

```powershell
git add docs/blueprint/app_sequence.md docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md prototype/vnext/README.md
git commit -m "docs: define compass-first launch continuity"
```

- [ ] **Step 5: Push and publish the isolated prototype**

Push `codex/vnext-sequence-prototype` to `origin`. Split `prototype/vnext/` into a temporary publication branch and push that subtree to `kimkiumin/Somewhere-wireframe-sequence` `main`. Wait for the Pages deployment to succeed, then fetch the public HTML, CSS, and screens script with a cache-busting query and verify the new title, launch classes, and `RollTheCompassVNextController` namespace.
