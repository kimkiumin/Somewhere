# Roll the compass physical BLE prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the connected Waveshare ESP32-S3-Touch-LCD-2.1 and connect it to the native iOS V2 app through a tested BLE display/touch contract.

**Architecture:** The iPhone remains authoritative for location, heading, route guidance, recommendation projection, and guarded server actions. The board is a BLE display and touch companion. USB is used for Arduino CLI flashing and serial logs; Wi-Fi is deferred to OTA/diagnostics.

**Tech Stack:** Swift 6/UIKit CoreBluetooth on iOS 17, Arduino CLI 1.5.1, Arduino-ESP32 3.3.11, Espressif ESP32_Display_Panel 1.0.4, LVGL 8.4.0, ArduinoJson 7.4.3, Waveshare board preset `esp32:esp32:waveshare_esp32_s3_touch_lcd_21`.

**Spec:** `docs/superpowers/specs/2026-08-25-roll-compass-physical-compass-ble-design.md`

## Global Constraints

- Preserve `/prototype` as frozen historical evidence.
- Do not expose destination name, address, photo, or other identity over BLE
  before the server has revealed it; this prototype does not send identity even
  after reveal.
- Do not let board events bypass `JourneyStore` or `JourneyServiceProtocol`.
- Do not add maps, standalone GPS, cellular, background navigation promises, or
  live place APIs.
- Do not erase the board's flash during setup or upload.
- Keep production iOS BLE code real; use dependency injection for tests.
- Use `apply_patch` for repository edits and run the listed verification after
  each task.

---

## Task 1: Freeze and test the BLE wire contract

**Files:**

- Create `ios/Somewhere/Platform/PhysicalCompassWire.swift`.
- Create `ios/SomewhereTests/PhysicalCompassWireTests.swift`.
- Update `ios/project.yml` only if needed to include the new source through the
  existing directory source rule.

- [x] Define v1 snapshot/event types, action mappings, UUID constants, compact
  JSON keys, newline framing, 512-byte logical limit, finite-number checks, and
  malformed-input rejection.
- [x] Add tests for a credible snapshot, a suppressed snapshot, Korean display
  strings staying within the frame limit, every allowed board action, newline
  framing, unknown action/version rejection, and identity never appearing in a
  snapshot.
- [x] Run the focused Swift tests after project generation:
  `xcodebuild -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 16 Pro' test -only-testing:SomewhereTests/PhysicalCompassWireTests`.

## Task 2: Implement the CoreBluetooth central client

**Files:**

- Create `ios/Somewhere/Platform/PhysicalCompassController.swift`.
- Update `ios/Somewhere/Resources/Info.plist` with
  `NSBluetoothAlwaysUsageDescription`.
- Update `ios/SomewhereTests/PhysicalCompassWireTests.swift` only for test
  doubles if needed.

- [x] Implement scanning by the fixed service UUID, connection, service and
  characteristic discovery, notification subscription, newline event parsing,
  bounded chunked state writes, disconnect recovery, and explicit stop.
- [x] Keep the controller injectable behind `PhysicalCompassClient`; make the
  production adapter `@MainActor` and use the same Swift 6 legacy callback
  boundary pattern already used by Core Location.
- [x] Do not add `UIBackgroundModes`/`bluetooth-central`; document that the
  current app has no locked-screen navigation promise.
- [x] Run the native source gate and focused Swift tests.

## Task 3: Connect the controller to JourneyStore

**Files:**

- Update `ios/Somewhere/Application/JourneyStore.swift`.
- Update `ios/Somewhere/App/SomewhereApp.swift` only if construction needs an
  explicit production client.
- Update `ios/SomewhereTests/JourneyStoreTests.swift` with a recording BLE fake.

- [x] Inject a `PhysicalCompassClient` with the real controller as the default.
- [x] Start the scanner at app initialization and stop it on teardown without
  changing the app's existing journey lifecycle.
- [x] Publish safe snapshots after server projections and credible/suppressed
  guidance changes; include only route distance, arrow, confidence, safe
  categories, price band, phase, reveal boolean, and guarded actions.
- [x] Map board intents to existing methods: `stop` → `requestStop`,
  `continue` → `cancelStop`, `confirm-stop` → `confirmStop`, `reveal` →
  `requestReveal`, `review` → no-op. Ignore actions not present in the latest
  projection.
- [x] Test hidden identity, snapshot refresh, guarded touch mapping, and no-op
  behavior for unadvertised actions.
- [x] Run all native unit tests and the existing `verify:ios-source` gate.

## Task 4: Scaffold and configure the board firmware

**Files:**

- Create `firmware/roll-compass-board/roll-compass-board.ino`.
- Create `firmware/roll-compass-board/board_config.h`.
- Create `firmware/roll-compass-board/physical_compass_wire.h`.
- Create `firmware/roll-compass-board/physical_compass_wire.cpp`.
- Create `firmware/roll-compass-board/display_ui.h`.
- Create `firmware/roll-compass-board/display_ui.cpp`.
- Create `firmware/roll-compass-board/lv_conf.h`.
- Create `firmware/roll-compass-board/esp_panel_board_supported_conf.h`.
- Create `firmware/roll-compass-board/README.md`.
- Create `firmware/roll-compass-board/dependencies.lock`.

- [x] Use the official Espressif board preset for ST7701/CST820 initialization
  and LVGL, with local configuration selecting
  `BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_2_1`.
- [x] Add the BLE GATT server with the same UUIDs, newline reassembly, state
  validation, safe stale handling, and `Roll Compass` advertising name.
- [x] Render status, arrow, distance, safe disclosure, and guarded action
  buttons. Send touch intents only for actions advertised by the phone.
- [x] Keep Wi-Fi and QMI8658 out of the runtime path; leave clear extension
  notes for OTA/diagnostics.
- [x] Add serial diagnostics at 115200 baud without destination identity.

## Task 5: Add reproducible local toolchain setup and commands

**Files:**

- Create `scripts/firmware/setup-toolchain.sh`.
- Create `scripts/firmware/generate-ios-project.sh`.
- Create `scripts/firmware/compile-board.sh`.
- Create `scripts/firmware/upload-board.sh`.
- Create `scripts/firmware/monitor-board.sh`.
- Update `package.json` with `firmware:*` scripts.
- Update `.gitignore` for `.tools/` and local firmware build artifacts.

- [x] Download and verify pinned Arduino CLI 1.5.1 and XcodeGen 2.46.0 under
  `.tools/` without requiring Homebrew.
- [x] Configure an isolated Arduino CLI data directory, add Espressif's official
  package index, install core 3.3.11, and install the pinned display/LVGL/
  ArduinoJson dependencies.
- [x] Generate the Xcode project from `ios/project.yml` before native builds.
- [x] Discover `/dev/cu.usbmodem*` safely, print the detected WCH CH343P port,
  and let upload accept `BOARD_PORT` when multiple ports exist.
- [ ] Compile first, then upload to the connected port without an erase flag;
  print the exact FQBN and port used.
- [ ] Run setup and compile on this machine, then upload once if compile passes.

## Task 6: Document and verify the physical integration

**Files:**

- Create `docs/operations/physical-compass-ble.md`.
- Update `ios/README.md` with the Bluetooth permission and runtime limitation.
- Update `docs/prototype_notes.md` only if the repository's existing current
  documentation workflow requires a cross-reference; do not rewrite historical
  v0.1 notes.

- [x] Document USB flashing versus BLE runtime, board port, dependency
  versions, first pairing flow, stale/disconnect behavior, safe action rules,
  and the Wi-Fi/OTA deferral.
- [ ] Run `bun run verify:ios-source`, native tests, firmware compile, and a
  serial boot check after upload. The source gate, native tests, and firmware
  compile pass; the serial boot check awaits a visible USB port.
- [ ] Report any simulator limitation separately from the physical-board
  result; a simulator cannot prove BLE hardware interaction.
