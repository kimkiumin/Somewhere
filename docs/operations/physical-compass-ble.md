# Physical compass companion

This is the first physical-board integration for the native V2 client. It
targets the flat Waveshare `ESP32-S3-Touch-LCD-2.1` SKU, not the 2.1B variant.
The iPhone remains authoritative for location, heading, route guidance,
recommendation projection, reveal state, and guarded journey commands. The
board is a low-screen BLE display and touch companion.

## Transport boundaries

- USB is used only to flash firmware and read 115200-baud serial diagnostics.
- BLE is the runtime link between the iPhone app and the board.
- Wi-Fi is intentionally deferred to a later OTA/diagnostics milestone.
- The QMI8658 IMU is diagnostics-only; it is not a magnetometer and must not
  calculate the journey heading.
- There is no background or locked-screen navigation promise in this milestone.

## Pinned local toolchain

`bun run firmware:setup` installs everything under the repository's ignored
`.tools/` and `.local-artifacts/` directories. Homebrew is not required.

| Component | Version |
| --- | --- |
| Arduino CLI | 1.5.1 |
| Arduino-ESP32 core | 3.3.11 |
| ESP32 Display Panel | 1.0.4 |
| ESP32 IO Expander | 1.1.0 |
| esp-lib-utils | 0.2.0 |
| LVGL | 8.4.0 |
| ArduinoJson | 7.4.3 |
| XcodeGen | 2.46.0 |
| Board FQBN | `esp32:esp32:waveshare_esp32_s3_touch_lcd_21` |

Arduino CLI's prototype preprocessor requires the Arduino Ctags output format.
The setup script builds the official Arduino `ctags` `5.8-arduino11` source for
Apple Silicon and installs it into the CLI's local tool directory.

## Flashing over USB

From the repository root:

```sh
bun run firmware:setup
bun run firmware:assets
bun run firmware:ios
bun run firmware:compile
bun run firmware:upload
bun run firmware:monitor
```

The CH343P USB-UART normally appears as `/dev/cu.usbmodem*`. If the board
resets and receives a different port, use the new port. When more than one
modem is connected, pass it explicitly:

```sh
BOARD_PORT=/dev/cu.usbmodem5B901259011 bun run firmware:upload
BOARD_PORT=/dev/cu.usbmodem5B901259011 bun run firmware:monitor
```

Upload compiles first and does not pass an erase flag. A physical serial boot
check should show `Roll Compass board boot`, `BLE advertising: Roll Compass`,
and `Ready: connect from the Somewhere iPhone app`.

## BLE runtime contract

The board advertises as `Roll Compass` and exposes:

| Role | UUID |
| --- | --- |
| Service | `C1F8A100-35D1-4C53-9A03-7A1B3E620001` |
| Phone → board state write | `C1F8A101-35D1-4C53-9A03-7A1B3E620001` |
| Board → phone event notify | `C1F8A102-35D1-4C53-9A03-7A1B3E620001` |

Messages are compact UTF-8 JSON terminated by `\n`, with a 512-byte logical
frame limit. iOS chunks state writes to the negotiated BLE write size; the
board reassembles them before validation. The board rejects unknown versions,
unknown actions, invalid numbers, oversized frames, and malformed state.

Phone-to-board state contains only phase, approximate distance, phone-computed
bearing when credible, confidence, at most two broad categories, price band,
reveal boolean, and currently advertised guarded actions. Destination identity
is never sent to the board.

Touch intents are accepted only when the action is present in the latest phone
projection. The iPhone maps them through `JourneyStore`:

| Board intent | iPhone action |
| --- | --- |
| `stop` | immediate local pause + `requestStop` |
| `continue` | guarded `cancelStop` |
| `confirm-stop` | guarded `confirmStop` |
| `reveal` | guarded reveal-reason flow |
| `review` | no-op in this milestone |

When disconnected or when the last state is stale, the board hides the arrow
and disables touch actions. The phone's existing safety controls remain the
authority.

The board display follows the Roll Compass moodboard: a warm circular compass
face, antique-brass shell, oxblood needle, pulsing treasure signal, and rounded
touch actions. The iPhone remains the source of truth for the needle bearing;
the board does not calculate its own heading.

## First connection flow

1. Flash the board and leave it powered from USB.
2. Build and run the native iOS app on a real iPhone.
3. Grant the Bluetooth permission when iOS asks.
4. Keep the board near the iPhone; the app scans for the fixed service UUID,
   connects, discovers the two characteristics, subscribes to event
   notifications, and begins publishing safe state snapshots.
5. Touch a board action only after the board shows a connected state.

This is BLE GATT discovery, not a Wi-Fi setup flow. No destination name or
address is required for pairing, and the board does not need the app's API
origin or credentials.

## Simulator and field limitations

The iOS Simulator can compile and run the CoreBluetooth code, but its Bluetooth
XPC environment cannot prove a physical BLE connection. Physical validation
requires a real iPhone and the flashed board. The current app deliberately
does not declare `bluetooth-central`, so background and locked-screen behavior
is outside this milestone.

For the complete contract and rationale, see
`docs/superpowers/specs/2026-08-25-roll-compass-physical-compass-ble-design.md`
and `firmware/roll-compass-board/README.md`.
