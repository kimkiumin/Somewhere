# Task 4 brief — BLE framing, freshness, and single-host ownership

## Scope

Implement Task 4 from
`docs/superpowers/plans/2026-08-26-ipad-physical-compass-integration.md`
without changing the backend journey contract or the collaborator-approved
visual composition.

## Required behavior

- Physical-board scanning is persisted and opt-in. It is disabled by default.
- Settings explain that only one nearby iPad/iPhone should be enabled as host.
- Connection states distinguish disabled, unavailable, scanning, connecting,
  stale, connected, and disconnected.
- Reconnect does not replay a cached pre-disconnect snapshot. The board remains
  stale until a newly generated complete logical state frame is queued.
- A partially written logical frame is never interleaved with a newer frame.
  Only a not-yet-started queued frame may be coalesced.
- Disconnect clears transport, event reassembly, and event authority.
- Board events require a positive sequence exactly matching the latest fresh
  snapshot and a currently allowed journey action.
- Display fields are bounded by UTF-8 byte count, with grapheme-safe truncation.
- Remove the unused `review` board action.
- Release continues to construct the real CoreBluetooth client. Debug UI tests
  may inject deterministic board states only when explicit launch arguments are
  present.

## TDD evidence

Before production edits, add focused tests that fail for:

1. UTF-8 byte validation/truncation and zero event sequence rejection.
2. Non-interleaving frame queue behavior with latest-only queued coalescing.
3. Host-disabled initialization not scanning, explicit enable/disable, and
   reconnect stale authority reset.
4. Board settings reachability and deterministic status copy.

Then implement the minimum production behavior and run focused unit/UI tests,
all native unit tests, `bun run verify:ios-source`, and `git diff --check`.

## Write ownership

- `ios/Somewhere/Platform/PhysicalCompassWire.swift`
- `ios/Somewhere/Platform/PhysicalCompassController.swift`
- `ios/Somewhere/Application/JourneyStore.swift`
- `ios/Somewhere/App/SomewhereApp.swift`
- `ios/Somewhere/UI/ConstraintView.swift`
- `ios/Somewhere/UI/PhysicalCompassSettingsView.swift` (new)
- `ios/SomewhereTests/PhysicalCompassWireTests.swift`
- `ios/SomewhereTests/JourneyStoreTests.swift`
- focused board tests appended to `ios/SomewhereUITests/JourneyFlowUITests.swift`

## Out of scope

- Firmware changes (Task 5).
- Real-board PASS claims without the physical board.
- Automatic arbitration between multiple Apple hosts.
- Backend, recommendation, or hidden-destination product changes.
