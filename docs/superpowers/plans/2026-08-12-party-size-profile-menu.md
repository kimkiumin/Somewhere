# 인원 선택 및 상단 프로필 메뉴 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vNext 조건 화면에 `1명–5명 이상` 인원 선택을 추가하고, 프로필 편집을 상단 프로필 메뉴의 환경설정으로 이동한다.

**Architecture:** 기존 plain HTML/CSS/JavaScript 구조를 유지한다. `state.js`가 party size와 프로필 메뉴 화면 전환을 검증·관리하고, `screens.js`가 접근 가능한 폰 SVG와 상단 메뉴를 렌더링하며, `controller.js`가 화살표·프로필 메뉴·폼 저장을 기존 reducer에 연결한다. 예산은 1인 기준으로 그대로 둔다.

**Tech Stack:** Plain JavaScript, HTML template strings, CSS, Node built-in test runner, PowerShell prototype contract check.

## Global Constraints

- 카테고리는 `restaurant`로 고정한다.
- 조건 화면에는 나침반을 렌더링하지 않는다.
- 조건 화면의 단일 제품 CTA는 `이 조건으로 바로 출발`이다.
- 인원 선택값은 `partySize: 1|2|3|4|5`이며 5는 `5명 이상`이다.
- 기본 party size는 2다.
- 예산은 1인 기준이며 현재 금액 스톱과 휠 동작을 변경하지 않는다.
- 식이 조건·알레르기는 조건 화면에서 편집하지 않고 프로필 환경설정에서 편집한다.
- 실제 인증·로그아웃·세션 저장은 범위 밖이다.
- 모든 새 동작은 production code보다 failing test를 먼저 추가한다.

---

### Task 1: State contract for party size and profile menu

**Files:**
- Modify: `prototype/vnext/state.test.js`
- Modify: `prototype/vnext/state.js`

**Interfaces:**
- `defaultConstraints()` returns `partySize: 2`.
- `validateConstraints(value)` returns `errors.partySize` for missing/non-integer values outside 1–5.
- `reduce(state, { type: "SET_PARTY_SIZE", partySize })` updates constraints only in `constraints` phase.
- `reduce(state, { type: "OPEN_PROFILE_MENU" })` adds a UI-visible menu flag without changing phase.
- `reduce(state, { type: "CLOSE_PROFILE_MENU" })` clears that flag.

- [ ] **Step 1: Write failing state tests**

Add tests covering:

```js
test("defaults to two people", () => {
  assert.equal(createInitialState({ firstUse: false }).constraints.partySize, 2);
});

test("accepts party sizes one through five and rejects out-of-range values", () => {
  for (const partySize of [1, 2, 3, 4, 5]) {
    assert.equal(validateConstraints({ ...validConstraints(), partySize }).valid, true);
  }
  assert.equal(validateConstraints({ ...validConstraints(), partySize: 0 }).errors.partySize, "함께 가는 인원은 1명 이상 5명 이하로 선택해 주세요.");
  assert.equal(validateConstraints({ ...validConstraints(), partySize: 6 }).errors.partySize, "함께 가는 인원은 1명 이상 5명 이하로 선택해 주세요.");
  assert.equal(validateConstraints({ ...validConstraints(), partySize: "2" }).valid, false);
});

test("sets party size only while editing constraints", () => {
  const initial = createInitialState({ firstUse: false });
  const changed = reduce(initial, { type: "SET_PARTY_SIZE", partySize: 4 });
  assert.equal(changed.constraints.partySize, 4);
  assert.equal(reduce({ ...initial, phase: "following" }, { type: "SET_PARTY_SIZE", partySize: 4 }), initial);
});

test("opens and closes the profile menu without leaving constraints", () => {
  const initial = createInitialState({ firstUse: false });
  const opened = reduce(initial, { type: "OPEN_PROFILE_MENU" });
  assert.equal(opened.phase, "constraints");
  assert.equal(opened.profileMenuOpen, true);
  assert.equal(reduce(opened, { type: "CLOSE_PROFILE_MENU" }).profileMenuOpen, false);
});
```

- [ ] **Step 2: Run state tests and verify RED**

Run: `node --test prototype/vnext/state.test.js`

Expected: FAIL because `partySize`, validation, `SET_PARTY_SIZE`, and profile-menu state do not exist.

- [ ] **Step 3: Implement minimal state behavior**

Add `partySize: 2` to default constraints; add the exact validation message above; add reducer branches for `SET_PARTY_SIZE`, `OPEN_PROFILE_MENU`, `CLOSE_PROFILE_MENU`, and ensure profile menu is reset when entering profile or leaving constraints. Include `partySize` in `NO_FIT_FIELDS` only if affected-condition reporting needs to identify it; do not add unrelated behavior.

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `node --test prototype/vnext/state.test.js`

Expected: all state tests pass.

- [ ] **Step 5: Commit**

```powershell
git add prototype/vnext/state.js prototype/vnext/state.test.js
git commit -m "feat: model party size and profile menu state"
```

### Task 2: Render party selector and profile menu

**Files:**
- Modify: `prototype/vnext/screens.test.js`
- Modify: `prototype/vnext/screens.js`
- Modify: `prototype/vnext/style.css`

**Interfaces:**
- `renderProductScreen(view)` renders the selector above the walking-time control on `constraints`.
- `renderProductScreen(view)` renders a top-right profile button and menu when `view.profileMenuOpen` is true.
- The selector uses `data-action="party-decrement"` and `data-action="party-increment"`.

- [ ] **Step 1: Write failing screen tests**

Add tests asserting:

```js
test("constraints render party selector before walking time", () => {
  const html = renderProductScreen(constraintsView({ constraints: { ...validConstraints(), partySize: 3 } }));
  assert.ok(html.indexOf("함께 가는 인원") < html.indexOf("최대 도보 시간"));
  assert.match(html, /data-action="party-decrement"/);
  assert.match(html, /data-action="party-increment"/);
  assert.match(html, /aria-live="polite"[^>]*>3명/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 3);
});

test("five or more renders five pawns and disables the increment control", () => {
  const html = renderProductScreen(constraintsView({ constraints: { ...validConstraints(), partySize: 5 } }));
  assert.match(html, /5명 이상/);
  assert.equal((html.match(/data-party-pawn/g) || []).length, 5);
  assert.match(html, /data-action="party-increment"[^>]*disabled/);
});

test("profile edit is not a constraints CTA and profile menu exposes settings and logout", () => {
  const closed = renderProductScreen(constraintsView({ profileMenuOpen: false }));
  assert.doesNotMatch(closed, /프로필 수정/);
  assert.match(closed, /data-action="open-profile-menu"/);
  const open = renderProductScreen(constraintsView({ profileMenuOpen: true }));
  assert.match(open, /환경설정/);
  assert.match(open, /로그아웃/);
});
```

- [ ] **Step 2: Run screen tests and verify RED**

Run: `node --test prototype/vnext/screens.test.js`

Expected: FAIL because the selector, profile button, and menu are not rendered.

- [ ] **Step 3: Implement minimal rendering and CSS**

Add small helpers for party labels and a single pawn SVG template. Render exactly `partySize` pawns, with `aria-hidden="true"`, and a text live region. Use real buttons with the required aria labels and disabled boundary states. Add a top-right profile button and a menu with `data-action="open-profile-settings"` and a non-authenticated `data-action="logout-placeholder"` item. Add layout styles for the selector, pawn row, header, and menu without changing compass styles.

- [ ] **Step 4: Run screen tests and verify GREEN**

Run: `node --test prototype/vnext/screens.test.js`

Expected: all screen tests pass.

- [ ] **Step 5: Commit**

```powershell
git add prototype/vnext/screens.js prototype/vnext/screens.test.js prototype/vnext/style.css
git commit -m "feat: render party selector and profile menu"
```

### Task 3: Wire controller interactions and form data

**Files:**
- Modify: `prototype/vnext/controller.test.js`
- Modify: `prototype/vnext/controller.js`

**Interfaces:**
- Product actions dispatch `SET_PARTY_SIZE`, `OPEN_PROFILE_MENU`, `CLOSE_PROFILE_MENU`, `OPEN_PROFILE`, and `SAVE_PROFILE` through existing delegated click handling.
- `readConstraints(form)` returns `partySize` from the hidden/selectable field.

- [ ] **Step 1: Write failing controller tests**

Add tests covering:

```js
test("party arrow buttons update party size and stop at both boundaries", () => {
  const mounted = mountFixture({ firstUse: false });
  const root = mounted.root;
  root.click(productButton("party-increment"));
  assert.equal(mounted.controller.getState().constraints.partySize, 3);
  root.click(productButton("party-decrement"));
  assert.equal(mounted.controller.getState().constraints.partySize, 2);
});

test("profile menu opens settings and profile save returns to constraints", () => {
  const mounted = mountFixture({ firstUse: false });
  mounted.root.click(productButton("open-profile-menu"));
  assert.equal(mounted.controller.getState().profileMenuOpen, true);
  mounted.root.click(productButton("open-profile-settings"));
  assert.equal(mounted.controller.getState().phase, "profile");
  mounted.root.click(productButton("save-profile", { form: profileFormFixture() }));
  assert.equal(mounted.controller.getState().phase, "constraints");
});

test("start forwards party size with the other constraints", () => {
  const mounted = mountFixture({ firstUse: false });
  mounted.root.click(productButton("party-increment"));
  const form = constraintsFormFixture({ partySize: "3" });
  mounted.root.click(productButton("start", { form }));
  assert.equal(mounted.controller.getState().constraints.partySize, 3);
  assert.equal(mounted.controller.getState().phase, "finding");
});
```

- [ ] **Step 2: Run controller tests and verify RED**

Run: `node --test prototype/vnext/controller.test.js`

Expected: FAIL because the delegated actions and party-size form reading are not wired.

- [ ] **Step 3: Implement controller wiring**

Add product action handlers for party increment/decrement using the current state value, profile menu open/close, and settings open. Add `partySize: Number(data.get("partySize"))` to `readConstraints`. Ensure opening settings closes the menu and saving profile leaves the menu closed. Keep the single start action and existing wheel handlers unchanged.

- [ ] **Step 4: Run controller tests and verify GREEN**

Run: `node --test prototype/vnext/controller.test.js`

Expected: all controller tests pass.

- [ ] **Step 5: Commit**

```powershell
git add prototype/vnext/controller.js prototype/vnext/controller.test.js
git commit -m "feat: connect party and profile interactions"
```

### Task 4: Update blueprint and prototype documentation

**Files:**
- Modify: `docs/blueprint/app_sequence.md`
- Modify: `docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md`
- Modify: `prototype/vnext/README.md`

- [ ] **Step 1: Add documentation assertions/checklist**

Record the exact contract: party selector before walking time, values 1–5+, default 2, per-person budget, top-right profile menu, settings editing, and non-functional logout placeholder.

- [ ] **Step 2: Update documents**

Add an amendment dated 2026-08-12 to the app sequence and design spec. Mark the prototype README with the new interaction and known limitation that authentication is not implemented.

- [ ] **Step 3: Review docs for contradictions**

Search for a constraints-screen `프로필 수정` CTA or any statement that dietary/allergy editing occurs in the recurring form; update only those references.

- [ ] **Step 4: Commit**

```powershell
git add docs/blueprint/app_sequence.md docs/superpowers/specs/2026-07-26-somewhere-app-sequence-prototype-design.md prototype/vnext/README.md
git commit -m "docs: record party size and profile menu flow"
```

### Task 5: Full verification and browser walkthrough

**Files:**
- No planned source changes; add a test only if a verified defect is found, following a new RED-GREEN cycle.

- [ ] **Step 1: Run focused tests**

Run: `node --test prototype/vnext/state.test.js prototype/vnext/screens.test.js prototype/vnext/controller.test.js`

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run full verification**

Run: `npm.cmd run verify`

Expected: Node tests and `Prototype UX contract markers OK.` both pass.

- [ ] **Step 3: Walk the local browser prototype**

Open or refresh `http://127.0.0.1:63301/` and verify:

1. The constraints screen has the profile icon at top right.
2. Party selector appears above walking time with 2 pawns by default.
3. Arrow clicks reach 1 and 5+ and disable at boundaries.
4. Walking time and budget continue to behave as before.
5. Profile menu opens; settings edits searchable diet/allergy values and saves back to constraints.
6. The start CTA remains singular and the constraints screen has no compass.

- [ ] **Step 4: Inspect final diff and status**

Run: `git diff HEAD~4..HEAD --stat; git status --short --branch`

Confirm only the planned feature, tests, docs, and design/plan artifacts changed; do not push unless the user separately requests it.
