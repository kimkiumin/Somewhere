# Task 4 report — BLE framing, freshness, and single-host ownership

## Outcome

Implemented the iOS host side of the physical-compass BLE v1 contract without
changing the backend journey contract or the collaborator-approved compass
composition.

- Board discovery is disabled by default and persisted behind an explicit
  settings toggle.
- The settings surface identifies the Apple device as the board host, shows all
  transport states, and warns that only one nearby iPad/iPhone should be
  enabled.
- Release builds instantiate the real CoreBluetooth client. Deterministic board
  states remain DEBUG-only and require explicit UI-test launch arguments.
- Reconnect establishes a new stale epoch, drops cached transport/event state,
  and waits for a freshly generated logical state frame before accepting board
  input.
- The write queue finishes the frame already in flight and coalesces only the
  not-yet-started queued frame, preventing line-frame interleaving.
- Board actions require a positive sequence that exactly matches the latest
  fresh snapshot and remains allowed by the current journey projection.
- Display fields now use UTF-8 byte limits and grapheme-safe truncation. The
  unused `review` action was removed.

## Independent review closure

The first independent review found five gaps: callbacks from a previous use of
the same `CBPeripheral` could be mistaken for the current connection, a board
event was not checked against the advertised action set as well as the live
journey, disconnect immediately collapsed into scanning, large accessibility
text could clip the fixed-height settings sheet, and the settings/status tests
did not cover those branches.

The review round closes those gaps by binding every peripheral callback to a
monotonic connection epoch, requiring both snapshot and journey authority,
publishing `disconnected` before retrying, providing deterministic Korean copy
for every transport state, and adding an adaptive settings-only scroll fallback
at Accessibility XXXL. The main journey remains a non-scrolling composition.

## TDD evidence

### RED

The focused tests were written first and failed because the byte contract,
frame queue, and persisted host ownership did not yet exist:

```text
xcodebuild test ...
  -only-testing:SomewhereTests/JourneyStoreTests
  -only-testing:SomewhereTests/PhysicalCompassWireTests
```

Evidence: `.omo/evidence/task-4/red-focused.log`

Observed compile failures included missing `PhysicalCompassBLE.maxDisplayBytes`,
`PhysicalCompassWire.truncateDisplayText`, and `PhysicalCompassFrameQueue`.

### GREEN

- Focused wire/store tests after the final reconnect-callback guard: 37 passed,
  0 failed (`.omo/evidence/task-4/green-focused-final-3.log`).
- All native unit tests on iPhone 13: 57 passed, 0 failed
  (`.omo/evidence/task-4/green-all-units-iphone13.log`).
- Board-settings UI scenario on iPhone 13: 1 passed, 0 failed
  (`.omo/evidence/task-4/green-board-settings-ui-1.log`).
- The same board-settings UI scenario on iPad Pro 11-inch (2nd generation):
  1 passed, 0 failed
  (`.omo/evidence/task-4/green-board-settings-ipad-final.log`).
- Release simulator build: succeeded
  (`.omo/evidence/task-4/green-release-build.log`).
- Final source/field gate: 29 passed, 0 failed; field-flow gate reports 27
  unit and 35 UI scenarios
  (`.omo/evidence/task-4/green-ios-source-final.log`).
- `git diff --check`: clean.

### Review-fix RED → GREEN

- RED compile evidence for the missing connection epoch and dual action
  authority: `.omo/evidence/task-4/review-red-focused.log`.
- RED source-gate evidence for missing settings/transport coverage:
  `.omo/evidence/task-4/review-red-field-gate.log`.
- RED compile evidence for missing deterministic status presentation:
  `.omo/evidence/task-4/review-red-status-copy.log`.
- Final focused store/wire run: 40 passed, 0 failed
  (`.omo/evidence/task-4/review-green-focused-final.log`).
- Accessibility XXXL settings scenario on iPhone 13: 1 passed, 0 failed
  (`.omo/evidence/task-4/review-green-accessibility-final-2.log`).
- Final normal-size board settings on iPhone 13 and iPad Pro 11-inch (2nd
  generation): 1 passed on each device, 0 failed
  (`.omo/evidence/task-4/review-green-board-iphone13-final.log`,
  `.omo/evidence/task-4/review-green-board-ipad-final.log`).
- Final source/field gate: 30 passed, 0 failed; field-flow gate reports 28 unit
  and 36 UI scenarios (`bun run verify:ios-source`).
- Final review-fix Release simulator build:
  `.omo/evidence/task-4/review-green-release-build-final.log`.

All peripheral callbacks are also bound to the currently selected peripheral,
so late callbacks from a cancelled reconnect epoch cannot mutate the new
transport.

## Files changed

- `ios/Somewhere/App/SomewhereApp.swift`
- `ios/Somewhere/Application/JourneyStore.swift`
- `ios/Somewhere/Platform/PhysicalCompassController.swift`
- `ios/Somewhere/Platform/PhysicalCompassWire.swift`
- `ios/Somewhere/UI/ConstraintView.swift`
- `ios/Somewhere/UI/PhysicalCompassSettingsView.swift`
- `ios/SomewhereTests/JourneyStoreTests.swift`
- `ios/SomewhereTests/PhysicalCompassWireTests.swift`
- `ios/SomewhereUITests/JourneyFlowUITests.swift`
- `scripts/ios/validate-ios-field-flow.test.mjs`

## Deliberate limits

- This task does not claim real-board PASS: no physical Waveshare board was
  connected for this lane.
- Single-host ownership is an explicit persisted opt-in plus operating warning,
  not distributed arbitration between Apple devices.
- Firmware remains unchanged here; Task 5 must mirror the now-frozen wire,
  action, freshness, and UTF-8 semantics before final integration verification.
