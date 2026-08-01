# Somewhere Blueprint Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved Somewhere blueprint without conflating the already-proven V2 mobile-web/Cloudflare repository slice with the still-missing native iOS, physical-product, field-study, legal, provider, and public-release outcomes.

**Architecture:** Preserve the sealed web/backend contracts as the service core. Add a contract-driven SwiftUI client, a versioned physical-product package, authority-signed external receipts, and a top-level blueprint completion gate that is independent from the existing repository seal. Every track fails closed: local source may become ready on Ubuntu, while claims requiring macOS, an iPhone, a fabricated mockup, participants, counsel, provider rights, or production credentials remain `BLOCK` until their authority evidence is supplied.

**Tech Stack:** Bun 1.3.14, Node 24, strict TypeScript, JSON Schema 2020-12, Swift 6 / SwiftUI / Core Location / UserNotifications / CoreBluetooth, XcodeGen, OpenSCAD-compatible parametric source, SVG/PDF design assets, Vitest/Bun test, Playwright, Cloudflare Workers, Ed25519 signed evidence.

## Global Constraints

- Authority order is owner direction, `BLUEPRINT.md` and `docs/blueprint/`, current V2 design, executable evidence, then historical versions.
- The destination name, address, photos, reviews, and ratings stay hidden by default; Reveal remains a separate safety action.
- V2 has no active Reroll. Stop pauses immediately, confirmation is explicit, and a new recommendation is guarded after completion.
- Directional guidance uses validated walking-route geometry. Direct destination bearing is never a silent fallback.
- The existing `repositoryReady: PASS` at `d9605bc21bc2809b9d0391f1481f7ac451e14545` describes only the mobile-web/Cloudflare slice.
- Whole-project completion requires the blueprint's native iOS field experience and high-fidelity full-scale physical compass mockup.
- No Ubuntu check may claim Xcode build/signing, physical-device behavior, ergonomic evidence, legal approval, provider rights, production deployment, or user-study success.
- Exact coordinates, credentials, provider payloads, participant data, legal work product, and private device traces stay outside Git.
- Every new tracked source change invalidates the old exact-tree repository seal and requires a fresh final wave before any later release claim.
- Remote push, Cloudflare mutation, DNS change, signing, TestFlight upload, participant recruitment, and fabrication require their actual authority.

---

## File Structure

```text
docs/project-status.md                         whole-project human-readable truth
docs/authority-map-v2.json                     machine-readable scope boundaries
docs/operations/blueprint-completion.md        end-to-end gate runbook
docs/operations/public-release-authority.md    external receipt authority runbook
scripts/completion/                            blueprint gate validator and schemas
scripts/public-release/                        signed external receipt verification
ios/project.yml                                deterministic XcodeGen project definition
ios/Somewhere/                                 SwiftUI app, domain, platform, UI
ios/SomewhereTests/                            native contract/domain tests
ios/Fixtures/                                  non-secret cross-client fixtures
physical/spec/                                 dimensions, CMF, controls, display contract
physical/cad/                                  parametric full-scale enclosure sources
physical/display/                              realistic display-motion demonstrator
physical/storyboard/                           phone/compass responsibility narrative
scripts/physical/                              physical-package validation/export checks
research/study-a/                              versioned protocol and de-identified schemas
research/study-b/                              comparison protocol and analysis contract
```

### Task 1: Separate service-slice readiness from blueprint completion ✅

**Files:**
- Create: `docs/project-status.md`
- Create: `docs/operations/blueprint-completion.md`
- Create: `scripts/completion/blueprint-completion-v1.schema.json`
- Create: `scripts/completion/blueprint-completion-v1.json`
- Create: `scripts/completion/validate-blueprint-completion.mjs`
- Create: `scripts/completion/validate-blueprint-completion.test.mjs`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/authority-map-v2.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: the approved six roadmap phases and the existing `repositoryReady`/`releaseReady` vocabulary.
- Produces: `bun run verify:blueprint-status` and a three-valued `serviceSlice`, `blueprintProject`, and `publicRelease` result.

- [x] **Step 1: Write failing validator tests**

  Cover exact track IDs `service-web-backend`, `native-ios`, `physical-product`, `study-a`, `study-b`, `provider-legal`, and `public-operations`. Assert that a fixture with only the service track `PASS` derives `blueprintProject: BLOCK`, that any `FAIL` dominates, duplicate/unknown tracks reject, and `blueprintProject: PASS` requires every required blueprint track to pass.

- [x] **Step 2: Run the red test**

  Run: `bun test scripts/completion/validate-blueprint-completion.test.mjs`

  Expected: nonzero because the validator and registry do not exist.

- [x] **Step 3: Implement the strict schema, registry, and validator**

  Registry entries have exact keys `id`, `requiredForBlueprint`, `requiredForPublicRelease`, `gate`, `evidence`, and `reason`. Evidence is a nonempty array of tracked paths or external receipt classes; missing external evidence remains `BLOCK`. The derived gate algebra is `FAIL` first, then `BLOCK`, otherwise `PASS`.

- [x] **Step 4: Publish the truthful status**

  `docs/project-status.md` must state that the d9605bc repository seal remains historical evidence for the service slice, while native source, physical design, studies, and public operations are not complete. `README.md` must link this status without weakening the existing web/backend claims.

- [x] **Step 5: Verify and commit**

  Run: `bun test scripts/completion/validate-blueprint-completion.test.mjs && bun run verify:blueprint-status && bun scripts/release/validate-release-config.mjs && git diff --check`

  Commit: `Clarify Somewhere whole-project completion gates`

### Task 2: Build the independent public-release authority verifier ✅

**Files:**
- Create: `scripts/public-release/external-receipt-v1.schema.json`
- Create: `scripts/public-release/trusted-authorities-v1.schema.json`
- Create: `scripts/public-release/public-release-decision-v1.schema.json`
- Create: `scripts/public-release/verify-public-release.mjs`
- Create: `scripts/public-release/verify-public-release.test.mjs`
- Create: `docs/operations/public-release-authority.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the exact final SHA/tree, terminal manifest digest, authority trust store, and one signed receipt per external gate.
- Produces: a signed-input-derived `PublicReleaseDecisionV1` that the repository finalizer cannot manufacture.

- [x] **Step 1: Write signature and contradiction tests**

  Generate ephemeral Ed25519 key pairs inside the test. Accept eight valid signatures bound to one SHA/tree/manifest; reject an untrusted key, missing gate, duplicate gate, expired receipt, wrong SHA/tree, wrong manifest digest, changed payload byte, wrong authority purpose, and a receipt stored inside the repository.

- [x] **Step 2: Run the red test**

  Run: `bun test scripts/public-release/verify-public-release.test.mjs`

  Expected: nonzero because the verifier is absent.

- [x] **Step 3: Implement exact receipt purposes**

  Use exact purposes `cloudflare-production`, `cloudflare-canonical-origin`, `cloudflare-production-pitr`, `provider-rights-quota`, `korean-privacy-location-review`, `study-a-rc`, `physical-iphone`, and `native-distribution`. Each canonical signed payload includes `schemaVersion`, `purpose`, `authorityId`, `issuedAt`, `expiresAt`, `finalSha`, `sourceTree`, `terminalManifestSha256`, `decision`, `evidenceDigests`, and `conditions`.

- [x] **Step 4: Document authority ownership**

  Define Cloudflare operator, provider/licensing owner, qualified Korean counsel, Study A supervisor, physical-device field lead, and Apple signing owner as separate trust purposes. A single key may not satisfy incompatible purposes unless the trust store explicitly lists both.

- [x] **Step 5: Verify and commit**

  Run: `bun test scripts/public-release/verify-public-release.test.mjs && bun run verify:release-authority && git diff --check`

  Commit: `Add authority-backed public release verification`

### Task 3: Create the native iOS contract and domain foundation ✅

**Files:**
- Create: `ios/project.yml`
- Create: `ios/README.md`
- Create: `ios/Somewhere/App/SomewhereApp.swift`
- Create: `ios/Somewhere/Domain/JourneyProjection.swift`
- Create: `ios/Somewhere/Domain/GuidanceEngine.swift`
- Create: `ios/Somewhere/Domain/ArrivalGate.swift`
- Create: `ios/Somewhere/Domain/NavigationPolicy.swift`
- Create: `ios/Somewhere/Networking/APIClient.swift`
- Create: `ios/Somewhere/Networking/WireModels.swift`
- Create: `ios/SomewhereTests/WireContractTests.swift`
- Create: `ios/SomewhereTests/GuidanceEngineTests.swift`
- Create: `ios/Fixtures/projection-examples-v1.json`
- Create: `scripts/ios/validate-ios-source.mjs`
- Create: `scripts/ios/validate-ios-source.test.mjs`

**Interfaces:**
- Consumes: `/api/v1` endpoint rows, `JourneyProjectionV1`, encoded route geometry, and `navigation-v2-*` policy.
- Produces: `APIClientProtocol`, `JourneyProjection`, `GuidanceEngine.update(location:heading:route:now:)`, and `ArrivalGate.advance(sample:)`.

- [x] **Step 1: Freeze cross-client fixtures**

  Export every canonical projection example and policy constant from the TypeScript contracts to `ios/Fixtures`. The validator compares SHA-256 and semantic values rather than maintaining hand-written divergent examples.

- [x] **Step 2: Write failing Linux structural tests**

  Assert the XcodeGen target is iOS 17+, bundle identifiers are non-production examples, source files exist, forbidden WebView types are absent, destination identity fields occur only in the revealed model, and every endpoint/action enum matches the canonical contract.

- [x] **Step 3: Implement strict Swift models and API client**

  Use `Codable` models with explicit `CodingKeys`, reject unknown phase/action combinations after decoding, retain cookies in the system URL session, keep CSRF and recovery capabilities in process memory, and map public server errors to typed retryability without logging raw bodies.

- [x] **Step 4: Port route and arrival math**

  Match the TypeScript fixtures for polyline decoding, route projection, look-ahead bearing, true/magnetic north conversion, bounded angular smoothing, progress-jump rejection, four-sample arrival dwell, and fail-closed confidence.

- [x] **Step 5: Verify and commit**

  Run on Ubuntu: `bun test scripts/ios/validate-ios-source.test.mjs && bun scripts/ios/validate-ios-source.mjs`

  Run on macOS: `xcodegen generate --spec ios/project.yml && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max'`

  Ubuntu records macOS result as `BLOCK` until that exact command receipt exists.

  Commit: `Add the native Somewhere contract and guidance core`

### Task 4: Implement the SwiftUI field journey and native sensors

**Files:**
- Create: `ios/Somewhere/Application/JourneyStore.swift`
- Create: `ios/Somewhere/Platform/LocationController.swift`
- Create: `ios/Somewhere/Platform/NotificationController.swift`
- Create: `ios/Somewhere/UI/RootView.swift`
- Create: `ios/Somewhere/UI/ConstraintView.swift`
- Create: `ios/Somewhere/UI/CompassView.swift`
- Create: `ios/Somewhere/UI/StopConfirmationView.swift`
- Create: `ios/Somewhere/UI/RevealView.swift`
- Create: `ios/Somewhere/UI/RecoveryView.swift`
- Create: `ios/Somewhere/UI/FeedbackView.swift`
- Create: `ios/Somewhere/Resources/Info.plist`
- Create: `ios/SomewhereTests/JourneyStoreTests.swift`
- Create: `ios/SomewhereUITests/JourneyFlowUITests.swift`

**Interfaces:**
- Consumes: Task 3 API/domain types and iOS Core Location/notification callbacks.
- Produces: the native field-test flow from constraint entry through delayed feedback with no map-first UI.

- [ ] **Step 1: Write store transition tests**

  Test ready/commit/follow/near/arrive/reveal, immediate pause, cancel stop, confirm stop, skippable reason, guarded recovery, route recovery, expired session, and server sequence conflicts. Assert no active reroll and no destination leak before Reveal.

- [ ] **Step 2: Implement Core Location fail-closed behavior**

  Request when-in-use location in context, start true-heading updates only while guidance is active, stop both streams after confirmed stop/expiry, suppress the arrow for invalid accuracy/staleness/interference, and recompute after foreground/recovery before pointing.

- [ ] **Step 3: Implement the minimal SwiftUI surface**

  Keep one phone canvas with distance, arrow/confidence, representative category text, and price band. Use explicit accessibility labels, 44-point controls, Dynamic Type, reduced motion, Korean copy, and distinct pointing/error/pause states.

- [ ] **Step 4: Implement contextual notification permission**

  Ask only before the first delayed feedback notification, schedule at server-provided `dueAt`, and fall back to an in-app prompt on next launch when denied.

- [ ] **Step 5: Verify and commit**

  Run the Task 3 macOS command plus `xcodebuild test -project ios/Somewhere.xcodeproj -scheme SomewhereUITests -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max'`.

  Commit: `Build the native Somewhere field journey`

### Task 5: Add native build, signing, and exact-device evidence gates

**Files:**
- Create: `.github/workflows/ios-ci.yml`
- Create: `scripts/ios/native-build-receipt-v1.schema.json`
- Create: `scripts/ios/native-device-receipt-v1.schema.json`
- Create: `scripts/ios/verify-native-evidence.mjs`
- Create: `scripts/ios/verify-native-evidence.test.mjs`
- Create: `docs/operations/ios-field-release.md`

**Interfaces:**
- Consumes: exact SHA/tree, generated Xcode project digest, xcodebuild result bundle digest, signing metadata without private key material, and four native device scenarios.
- Produces: the `native-ios` blueprint track gate and `native-distribution` external receipt input.

- [ ] **Step 1: Test fail-closed native evidence**

  Reject simulator-only evidence as a field pass, unsigned/archive-only evidence as TestFlight pass, mismatched bundle/SHA/policy/route/provider digests, missing privacy manifest, missing background-behavior declaration, and any raw coordinate attachment.

- [ ] **Step 2: Add read-only CI**

  `ios-ci.yml` runs XcodeGen, unit tests, UI tests, archive without distribution signing, privacy manifest inspection, and secret scanning on `macos-15`. It uploads sanitized result metadata only.

- [ ] **Step 3: Define physical native scenarios**

  Require open-sky and building-dense walks, interrupted network, heading interference/recalibration, foreground recovery, Stop/reveal, false-arrival and missed-arrival observations, each bound to exact build and RC policy.

- [ ] **Step 4: Verify and commit**

  Run: `bun test scripts/ios/verify-native-evidence.test.mjs && bun scripts/ios/verify-native-evidence.mjs --evidence /private/native-evidence --output /private/native-verdict.json`

  Without private evidence, expected gate is `BLOCK`, not command failure.

  Commit: `Gate native Somewhere field evidence`

### Task 6: Produce the full-scale physical compass design package

**Files:**
- Create: `physical/README.md`
- Create: `physical/spec/form-directions-v1.json`
- Create: `physical/spec/selected-form-v1.json`
- Create: `physical/spec/cmf-v1.json`
- Create: `physical/spec/control-contract-v1.json`
- Create: `physical/cad/direction-a-handheld.scad`
- Create: `physical/cad/direction-b-clip.scad`
- Create: `physical/cad/direction-c-lanyard.scad`
- Create: `physical/cad/selected-compass.scad`
- Create: `physical/drawings/full-scale-front.svg`
- Create: `physical/drawings/full-scale-side.svg`
- Create: `scripts/physical/validate-physical-package.mjs`
- Create: `scripts/physical/validate-physical-package.test.mjs`

**Interfaces:**
- Consumes: the physical-product blueprint's three-row display, Stop/reveal control hierarchy, status icons, and companion-phone division.
- Produces: three measurable form directions and one selected parametric full-scale model suitable for 1:1 print/fabrication review.

- [ ] **Step 1: Write physical-package contract tests**

  Require three distinct directions; millimetre dimensions; grip, carry, mass, balance, thumb reach, display window, controls, CMF, assembly, and test hypotheses; forbid zero/negative geometry; and ensure the selected form references one direction without claiming ergonomic validation.

- [ ] **Step 2: Create three real form sources**

  Each OpenSCAD file uses the same 82 mm nominal dial class and 12–18 mm depth study but differs in grip/carry: palm-held rounded body, spring clip, and lanyard/pocket body. Sources include display window, needle recess, primary Stop control, recessed Reveal control, status channel, and printable split surfaces.

- [ ] **Step 3: Select and document one refinement direction**

  Selection criteria are outdoor legibility, one-hand Stop, accidental activation resistance, carry comfort hypothesis, model mass target, and fabrication simplicity. Mark every untested ergonomic claim as `HYPOTHESIS`.

- [ ] **Step 4: Verify and commit**

  Run: `bun test scripts/physical/validate-physical-package.test.mjs && bun scripts/physical/validate-physical-package.mjs`

  If OpenSCAD is available, also run: `openscad -o /tmp/somewhere-selected.stl physical/cad/selected-compass.scad` and record only the STL digest/geometry summary outside Git.

  Commit: `Add the Somewhere physical compass design package`

### Task 7: Build the display-motion demonstration and interaction storyboard

**Files:**
- Create: `physical/display/index.html`
- Create: `physical/display/display.css`
- Create: `physical/display/display.ts`
- Create: `physical/display/display.test.ts`
- Create: `physical/storyboard/phone-compass-flow.svg`
- Create: `physical/storyboard/recovery-states.svg`
- Create: `physical/storyboard/README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: distance, up to two broad menu categories, price band, confidence, network, Bluetooth, pause, and stop state.
- Produces: a deterministic realistic display demonstrator and system-responsibility storyboard.

- [ ] **Step 1: Write motion/state tests**

  Assert distance and price never move, menu loops in one direction without reversing, reduced-motion yields a static clipped label, precise needle is hidden for stale/error states, technical error rotates slowly, pause/stop is still, and destination identity never appears.

- [ ] **Step 2: Implement the demonstrator**

  Use fixed 1:1 display-window dimensions and keyboard-accessible state controls outside the simulated product face. Include cellular, Wi-Fi, and Bluetooth status icons in the lower-center channel.

- [ ] **Step 3: Create the responsibility storyboard**

  Show provider/backend selection, iPhone route/sensor computation, absolute-bearing plus north-reference transfer, physical-device heading, local relative-needle calculation, stale suppression, reconnection, Stop, and Reveal.

- [ ] **Step 4: Verify and commit**

  Run: `bun test physical/display/display.test.ts && bun run physical:build && bun run physical:e2e`

  Commit: `Demonstrate the Somewhere physical display and recovery states`

### Task 8: Expand Study A into native plus embodied-product acceptance

**Files:**
- Create: `research/study-a/protocol-v1.md`
- Create: `research/study-a/session-v1.schema.json`
- Create: `research/study-a/aggregate-v1.schema.json`
- Create: `research/study-a/templates/session.template.json`
- Create: `research/study-a/validate-study-a.mjs`
- Create: `research/study-a/validate-study-a.test.mjs`
- Modify: `app/qa/field/v2/promote-navigation-policy.mjs`
- Modify: `app/qa/field/v2/README.md`

**Interfaces:**
- Consumes: 5–8 supervised sessions, exact native/PWA build, route/provider/policy digests, and physical mockup version.
- Produces: a de-identified Study A verdict, navigation RC promotion eligibility, and physical handling findings.

- [ ] **Step 1: Test evidence separation**

  Require dyad shared-selection sessions and individual handling sessions to be labeled separately. Reject raw coordinates, names, contact details, free-text venue identity, missing consent version, missing supervisor signature, pre-build evidence, or a visual-only animation claiming embodied pointing success.

- [ ] **Step 2: Freeze measures and stop rules**

  Record comprehension, selection time, comparison reopening, movement start, route/sensor failure, Stop/reveal trust, false/missed arrival, display readability, one-hand use, accidental Stop, carry comfort, and state distinction. Stop a session for safety concern, consent withdrawal, unreliable route, or data-boundary breach.

- [ ] **Step 3: Bind RC promotion to the expanded aggregate**

  RC promotion requires 5–8 valid sessions, no open critical safety issue, explicit accepted thresholds, exact build/route/provider/schema digests, and an approved Study A supervisor signature. Physical findings may remain `BLOCK` without falsifying navigation calibration.

- [ ] **Step 4: Verify and commit**

  Run synthetic negative fixtures: `bun test research/study-a/validate-study-a.test.mjs`

  Run real private evidence: `bun research/study-a/validate-study-a.mjs --input /private/study-a --trusted-supervisors /private/authority/study-a-signers.json --output /private/study-a-verdict.json`

  Commit: `Bind Study A to native and physical acceptance`

### Task 9: Freeze Study B and final product evidence synthesis

**Files:**
- Create: `research/study-b/protocol-v1.md`
- Create: `research/study-b/dataset-v1.schema.json`
- Create: `research/study-b/analysis-contract-v1.json`
- Create: `research/study-b/analyze-study-b.mjs`
- Create: `research/study-b/analyze-study-b.test.mjs`
- Create: `docs/product/final-narrative-template.md`
- Create: `scripts/completion/assemble-blueprint-verdict.mjs`
- Create: `scripts/completion/assemble-blueprint-verdict.test.mjs`

**Interfaces:**
- Consumes: 10–15 counterbalanced dyads, frozen primary endpoint and practical-difference threshold, native/physical evidence, and public-release receipts.
- Produces: Study B result and final blueprint verdict without blending distinct failure causes.

- [ ] **Step 1: Test counterbalanced analysis invariants**

  Reject individual-level inference as the primary unit, unmatched category/area/budget/time/pair conditions, absent order/carryover fields, changed endpoint after data collection, combined restaurant/cafe conclusions, and conflation of external interruption with recommendation failure.

- [ ] **Step 2: Implement deterministic analysis**

  Report paired selection-time difference, practical-threshold decision, comparison count, departure, selection reopened, arrival, external interruption, and destination reaction. Show restaurant and cafe strata separately and identify bundle-level attribution limits.

- [ ] **Step 3: Assemble the final blueprint verdict**

  Require Phase 0–5 exit evidence, native field pass, high-fidelity physical package plus handling/readability evidence, provider/legal feasibility, Study A and Study B results, risk ledger disposition, and exact public-release decision. Preserve `BLOCK` for every absent authority receipt.

- [ ] **Step 4: Verify and commit**

  Run: `bun test research/study-b/analyze-study-b.test.mjs scripts/completion/assemble-blueprint-verdict.test.mjs`

  Commit: `Add comparative validation and blueprint synthesis`

### Task 10: Re-run independent gates and seal the final whole-project package

**Files:**
- Modify only defects found by the final reviews.
- External output: `$SOMEWHERE_EVIDENCE_ROOT/blueprint-final/<sha>/`

**Interfaces:**
- Consumes: Tasks 1–9 and the actual external receipts.
- Produces: separate immutable verdicts for service repository, native field experience, physical product, research, public operations, and whole blueprint.

- [ ] **Step 1: Run repository and new-track verification**

  Run: `bun install --frozen-lockfile && bun run verify:release && bun run verify:blueprint && git diff --check`

- [ ] **Step 2: Run independent code/security/native/product/research reviews**

  Bind each review to the same commit/tree and exact evidence digests. A reviewer cannot review its own implementation evidence. Any important finding returns the affected track to `BLOCK` or `FAIL`.

- [ ] **Step 3: Run actual external gates in dependency order**

  Provider/legal approval precedes participant exposure; protected Cloudflare staging precedes exact-build field sessions; Study A precedes RC promotion; RC promotion precedes final PWA/native device runs; physical handling evidence precedes Study B; all required receipts precede public release synthesis.

- [ ] **Step 4: Seal without overclaim**

  Write a manifest over every decision and sanitized artifact. `blueprintProject: PASS` requires the blueprint deliverables and studies; `publicRelease: PASS` additionally requires all eight authority receipts. If any real-world input is absent, emit a precise `BLOCK` and the single next authorized action.

- [ ] **Step 5: Commit local closure metadata**

  Commit: `Seal the completed Somewhere blueprint package`

## Self-Review

- Spec coverage: Phase 0 truth, Phase 1 native/physical feasibility, Phase 2 integrated native/physical prototype, Phase 3 Study A, Phase 4 Study B, Phase 5 final package, and all eight public-release gates each map to a task.
- Placeholder scan: no task delegates behavior to unspecified error handling, tests, or future implementation; external evidence is described as a fail-closed authority input with exact commands and schemas.
- Type consistency: `serviceSlice`, `blueprintProject`, and `publicRelease` remain distinct; external purpose IDs exactly match the existing eight gate IDs; native fixtures consume contract version 1 and the existing navigation policy.

## Execution Order

The owner already selected supervised central orchestration with OMO-native GLM and Claude review. Execute Tasks 1–2 locally first because they make every later claim truthful, Tasks 3–5 as the native track, Tasks 6–7 as the physical track in parallel where file ownership does not overlap, Task 8 before RC promotion, Task 9 only after Study A freezes its decision rule, and Task 10 last.
