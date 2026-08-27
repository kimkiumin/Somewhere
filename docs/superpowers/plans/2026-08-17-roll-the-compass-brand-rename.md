# Roll the compass! Brand Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active `Somewhere` product name with `Roll the compass!` across the vNext product, active documentation, metadata, sensor-spike copy, and internal namespaces while keeping repository locators stable.

**Architecture:** Treat the public brand, code identifiers, and stable locators as separate naming layers. TDD locks the public browser/onboarding copy and JavaScript globals first; a controlled tracked-file rewrite then updates prose and metadata while an allowlist preserves repository URLs, historical paths, branch names, and filenames.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node built-in test runner, PowerShell verification, GitHub Pages.

## Global Constraints

- Public name is exactly `Roll the compass!`.
- JavaScript namespace stem is exactly `RollTheCompass`.
- npm package name is exactly `roll-the-compass-vnext`.
- iOS sensor bundle identifier is exactly `com.rollthecompass.sensorspike`.
- Do not rename repository slugs, public URLs, local checkout directories, active branches, or historical filenames.
- Do not change sequence, state transitions, recommendation rules, navigation, Reveal/Stop behavior, or layouts beyond preventing name overflow.

---

### Task 1: Lock the public brand contract

**Files:**
- Modify: `tests/project_contract.test.js`
- Modify: `prototype/vnext/screens.test.js`
- Modify: `prototype/vnext/index.html`
- Modify: `prototype/vnext/screens.js`
- Modify: `prototype/vnext/style.css`

**Interfaces:**
- Consumes: `extractTitle(html)` and `renderProductScreen(view)`.
- Produces: exact browser title `Roll the compass! vNext 시퀀스 프로토타입` and exact onboarding heading `Roll the compass!`.

- [ ] **Step 1: Write failing title and onboarding tests**

```js
assert.equal(extractTitle(vnextHtml), "Roll the compass! vNext 시퀀스 프로토타입");
assert.match(screens.renderProductScreen(view({ phase: "onboarding" })), />Roll the compass!<\/h1>/);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/project_contract.test.js prototype/vnext/screens.test.js`

Expected: FAIL because the current title and onboarding heading still contain `Somewhere`.

- [ ] **Step 3: Implement the exact public copy**

Change the `<title>` and onboarding `<h1>` to the exact approved strings. Retain responsive wrapping through the existing heading rules; add only the minimum `overflow-wrap` or width rule if a 360 px browser check proves it necessary.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test tests/project_contract.test.js prototype/vnext/screens.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/project_contract.test.js prototype/vnext/screens.test.js prototype/vnext/index.html prototype/vnext/screens.js prototype/vnext/style.css
git commit -m "feat: rename prototype to Roll the compass"
```

### Task 2: Rename runtime namespaces and metadata

**Files:**
- Modify: `prototype/vnext/app.js`
- Modify: `prototype/vnext/controller.js`
- Modify: `prototype/vnext/state.js`
- Modify: `prototype/vnext/screens.js`
- Modify: `prototype/vnext/controller.test.js`
- Modify: `prototype/vnext/state.test.js`
- Modify: `prototype/vnext/screens.test.js`
- Modify: `spikes/navigation/geometry.js`
- Modify: `spikes/navigation/geometry.test.js`
- Modify: `spikes/physical-display/display-state.js`
- Modify: `package.json`
- Modify: `tests/pages_artifact_contract.test.js`

**Interfaces:**
- Consumes: existing CommonJS exports and browser globals.
- Produces: `RollTheCompassVNextState`, `RollTheCompassVNextScreens`, `RollTheCompassVNextController`, `RollTheCompassVNextApp`, and `RollTheCompassGeometry`; CommonJS APIs remain unchanged.

- [ ] **Step 1: Change test expectations to the new globals and package prefixes**

```js
assert.equal(typeof globalThis.RollTheCompassVNextController.createController, "function");
assert.equal(globalThis.SomewhereVNextController, undefined);
assert.equal(typeof globalThis.RollTheCompassGeometry.trueBearing, "function");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test prototype/vnext/*.test.js spikes/navigation/geometry.test.js tests/pages_artifact_contract.test.js`

Expected: FAIL because only the old namespaces exist.

- [ ] **Step 3: Rename runtime globals, error strings, package metadata, and temp prefixes**

Keep `module.exports` keys stable. Replace only browser-global names and product metadata. Set `package.json` name to `roll-the-compass-vnext` and the Pages test temporary prefix to `roll-the-compass-pages-contract-`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test prototype/vnext/*.test.js spikes/navigation/geometry.test.js tests/pages_artifact_contract.test.js`

Expected: PASS and no old globals on `globalThis`.

- [ ] **Step 5: Commit**

```bash
git add prototype/vnext spikes/navigation package.json tests/pages_artifact_contract.test.js
git commit -m "refactor: rename Roll the compass namespaces"
```

### Task 3: Rename active documentation and sensor-spike copy

**Files:**
- Modify: `BLUEPRINT.md`
- Modify: `README.md`
- Modify: `docs/blueprint/*.md`
- Modify: `docs/sequence/*.md`
- Modify: `docs/research/*.md`
- Modify: `docs/superpowers/specs/*.md`
- Modify: `docs/superpowers/plans/*.md`
- Modify: `prototype/vnext/README.md`
- Modify: `spikes/web-sensors/index.html`
- Modify: `ios/SensorSpike/README.md`

**Interfaces:**
- Consumes: the naming contract and compatibility-boundary allowlist.
- Produces: active prose that calls the product `Roll the compass!`, sensor copy that uses the new brand, and bundle instructions using `com.rollthecompass.sensorspike`.

- [ ] **Step 1: Replace prose and headings while preserving locator literals**

Replace product-name prose, headings, validation labels, sensor title, permission description, and bundle identifier. Do not alter literal GitHub URLs, local paths, branch names, or filenames.

- [ ] **Step 2: Audit old-name occurrences**

Run:

```powershell
rg -n -i --hidden --glob '!/.git/**' --glob '!*.lock' 'Somewhere' .
```

Expected: only the compatibility-boundary occurrences documented in the design spec.

- [ ] **Step 3: Run documentation and repository contracts**

Run: `node --test tests/project_contract.test.js tests/pages_artifact_contract.test.js`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add BLUEPRINT.md README.md docs prototype/vnext/README.md spikes/web-sensors/index.html ios/SensorSpike/README.md
git commit -m "docs: rename project to Roll the compass"
```

### Task 4: Verify, publish, and inspect the public prototype

**Files:**
- Verify: all changed tracked files
- External: `kimkiumin/Somewhere-wireframe-sequence` mirror and Pages deployment

**Interfaces:**
- Consumes: verified `prototype/vnext/` subtree.
- Produces: public prototype content carrying the new brand while the existing URL remains stable.

- [ ] **Step 1: Run complete local verification**

Run: `npm.cmd run verify`

Expected: all tests pass and the prototype contract reports success.

- [ ] **Step 2: Inspect the final diff and old-name allowlist**

Run: `git diff --check`, `git status -sb`, and the tracked-file `rg` audit.

- [ ] **Step 3: Push the source branch and update the isolated public mirror**

Push `codex/vnext-sequence-prototype`, split `prototype/vnext/` to the existing public mirror, and wait for Pages deployment success.

- [ ] **Step 4: Verify the public site**

Confirm HTTP 200 for the page and all assets, browser title `Roll the compass! vNext 시퀀스 프로토타입`, onboarding heading `Roll the compass!`, no old `Somewhere` product copy, and the existing arrival flow.

- [ ] **Step 5: Report stable locators explicitly**

State that repository slugs, URLs, local checkout directories, branch names, and historical filenames were intentionally preserved to avoid broken links.

