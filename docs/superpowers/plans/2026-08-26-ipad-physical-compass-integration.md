# iPad portrait and physical compass integration implementation plan

> **Execution:** Use `superpowers:subagent-driven-development` for bounded
> implementation tasks and `superpowers:test-driven-development` for every
> production behavior change.

**Goal:** Integrate the existing physical-board work into the Universal app,
correct the iPad portrait composition to a proportional iPhone-style layout,
and produce honest simulator and physical-device evidence.

**Spec:** `docs/superpowers/specs/2026-08-26-ipad-physical-compass-integration-design.md`

## Global constraints

- Preserve the V2 backend, recommendation behavior, hidden-destination
  boundary, journey state machine, collaborator artwork, and iPhone 13 compact
  composition.
- iPad guidance order is direction card → large compass → remaining information
  → Stop. No guidance side rail.
- iPad compass is 58–64% of available width; arrival content is approximately
  80% of available width.
- Never display an exact road name before reveal.
- BLE scanning is opt-in and one app host owns the board at a time.
- Keep production CoreBluetooth real; deterministic board states are Debug/UI
  test only.
- Do not erase board flash. Do not claim physical PASS without real hardware.
- Use `apply_patch` for repository source edits.

## Task 1: Preserve and integrate the existing board baseline

**Owner:** Main agent

**Files:** Existing dirty board/BLE files in the root checkout, then the
integration branch equivalents under `firmware/`, `ios/`, `scripts/`, and
`docs/`.

- [ ] Re-run the native source gate, native unit tests, firmware compile, and
  `git diff --check` in the root checkout.
- [ ] Commit the coherent board/BLE baseline without generated secrets or build
  artifacts.
- [ ] Cherry-pick it into the integration branch and resolve iPad conflicts by
  retaining both Universal layout configuration and BLE construction.
- [ ] Regenerate `ios/Somewhere.xcodeproj` from `ios/project.yml`.
- [ ] Run the same source/unit/firmware baseline in the integration worktree.

## Task 2: Scale the approved iPhone composition across iPad portrait

**Owner:** Luna Max implementation worker

**Files:**

- `ios/Somewhere/UI/SomewhereLayout.swift`
- `ios/Somewhere/UI/ConstraintView.swift`
- `ios/Somewhere/UI/CompassView.swift`
- `ios/Somewhere/UI/ArrivalView.swift`
- `ios/SomewhereTests/SomewhereLayoutTests.swift`
- `ios/SomewhereUITests/JourneyFlowUITests.swift`

- [ ] Add failing layout/unit/UI tests for the 58–64% compass width, ~80%
  arrival width, vertical guidance ordering, default-size no-scroll behavior,
  and iPhone 13 compact preservation.
- [ ] Observe each new test fail for the intended old side-by-side/small-layout
  reason.
- [ ] Implement the minimum responsive metrics and vertical iPad compositions.
- [ ] Run focused tests on iPad Pro 11-inch (2nd generation) and iPhone 13.
- [ ] Commit the task and write its report.

## Task 3: Correct hidden-guidance copy and error placement

**Owner:** Luna Max implementation worker

**Files:**

- `ios/Somewhere/UI/CompassView.swift`
- `ios/Somewhere/UI/RecoveryView.swift`
- `ios/Somewhere/UI/RootView.swift`
- `ios/SomewhereUITests/JourneyFlowUITests.swift`

- [ ] Add failing UI assertions proving exact road names are absent, `보물 숨김`
  is absent, `목적지 숨김` remains, and an error is readable without covering the
  header or primary action.
- [ ] Remove the road-name suffix, replace stale copy, and place errors in the
  bounded content flow or a safe inset.
- [ ] Verify on both target simulators and commit with a report.

## Task 4: Harden BLE framing, freshness, and single-host ownership

**Owner:** Main agent

**Files:**

- `ios/Somewhere/Platform/PhysicalCompassWire.swift`
- `ios/Somewhere/Platform/PhysicalCompassController.swift`
- `ios/Somewhere/Application/JourneyStore.swift`
- `ios/Somewhere/App/SomewhereApp.swift`
- `ios/Somewhere/UI/ProfileSettingsView.swift` or a focused board settings view
- `ios/SomewhereTests/PhysicalCompassWireTests.swift`
- `ios/SomewhereTests/JourneyStoreTests.swift`
- `ios/SomewhereUITests/JourneyFlowUITests.swift`

- [ ] Add failing tests for UTF-8 byte truncation, positive monotonic sequence,
  non-interleaving logical frames, reconnect freshness reset, guarded events,
  and opt-in scanning.
- [ ] Add a serial transport queue that completes in-flight frames and coalesces
  only a queued snapshot.
- [ ] Add explicit connection status and persisted board-host enablement.
- [ ] Add Debug/UI-test deterministic board states and events without altering
  Release construction.
- [ ] Remove the unused v1 `review` event and regenerate the project.
- [ ] Run source gates, all native unit tests, and focused board UI tests.

## Task 5: Harden firmware protocol and Korean display

**Owner:** Luna Max implementation worker

**Files:**

- `firmware/roll-compass-board/physical_compass_wire.*`
- `firmware/roll-compass-board/roll-compass-board.ino`
- `firmware/roll-compass-board/display_ui.*`
- `firmware/roll-compass-board/README.md`
- `scripts/firmware/` test/compile helpers
- `package.json`

- [ ] Add host-runnable failing parser tests for sequence monotonicity, reconnect
  epoch reset, UTF-8 byte limits, oversized/malformed frames, action guards, and
  event notification chunking.
- [ ] Clear stale/action authority on disconnect and require a fresh accepted
  state before rendering an arrow or sending an action.
- [ ] Split event notifications into ATT-safe chunks.
- [ ] Replace `CLUE` with a compact Korean-capable category/menu rendering
  strategy and keep flash usage below 90%.
- [ ] Run host parser tests and `bun run firmware:compile`, then commit/report.

## Task 6: Full verification, screenshots, and handoff

**Owner:** Main agent with Luna Max QA worker

**Files:** Native E2E scripts/tests, `ios/README.md`, board operation docs, and
local ignored evidence directories.

- [ ] Regenerate the Xcode project and run `git diff --check`.
- [ ] Run all native unit and UI tests on iPad Pro 11-inch (2nd generation) and
  iPhone 13; retain iPhone 15 Pro Max as regression evidence.
- [ ] Run `bun run verify:ios-source`, V2 app/server/contract/Worker E2E gates,
  production build, and firmware host/compile checks.
- [ ] Capture launch, conditions, following, paused, arrival, settings, and board
  status screenshots at the exact iPad target size; review them against the
  approved collaborator concept.
- [ ] If hardware is connected, compile/upload without erase, capture serial
  boot, and run one real BLE round trip. Otherwise record that lane as BLOCKED.
- [ ] Update collaborator-readable handoff docs with commands, results, design
  decisions, one-host instructions, and every remaining external block.
- [ ] Run a whole-branch code review, resolve material findings, commit, and push
  `codex/ipad-board-integration`.

