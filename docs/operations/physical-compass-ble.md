# Physical compass companion

This is the first physical-board integration for the native V2 client. It
targets the flat Waveshare `ESP32-S3-Touch-LCD-2.1` SKU, not the 2.1B variant.
The iPhone remains authoritative for location, heading, route guidance,
recommendation projection, reveal state, and guarded journey commands. The
board is a low-screen BLE display and touch companion.

## Transport boundaries

- USB is used to flash firmware and run deterministic 115200-baud serial
  diagnostics; it is not the production journey transport.
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
| Board FQBN | `esp32:esp32:waveshare_esp32_s3_touch_lcd_21:CDCOnBoot=cdc` |

Arduino CLI's prototype preprocessor requires the Arduino Ctags output format.
The setup script builds the official Arduino `ctags` `5.8-arduino11` source for
Apple Silicon and installs it into the CLI's local tool directory.

## Flashing over USB

The commands below are the pinned macOS path. Windows collaborators should use
the WSL-free PowerShell setup, explicit COM-port upload, and troubleshooting in
the [Windows collaboration handoff](windows-collaboration-handoff.md).

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

Upload compiles first and does not pass an erase flag. The monitor requests DTR
and RTS disabled. If opening the native USB-Serial/JTAG port still interrupts
boot on macOS, keep the monitor open and press the physical RST button once.
A physical serial boot check should show `Roll Compass board boot`, a
`psram_total=...` line with `display_mode=direct_double` (or `partial` /
`partial_fallback`),
`BLE advertising: Roll Compass`, and
`Ready: connect from the Somewhere iPhone app`.

The current development firmware starts in a phone-free visual demo and shows
`320m`, `TONKATSU`, `PRICE -`, and a source-style 2 px needle that starts at 35
degrees and sweeps at 18 degrees per second. Status and action controls stay
hidden in this visual demo. Send these newline-delimited commands in the
monitor to override or restart it:

```text
sim on
target 315
heading 0
sweep cw
state near
sweep stop
sim off
```

Other accepted states are `guiding`, `paused`, `arrived`, `calibrating`,
`sensor-missing`, and `anomaly`; `sweep ccw`, `declination -180..180`, and any
`target`/`heading` from `0` through less than `360` are also accepted. While
simulation is active, touch controls cannot emit BLE events.

## BLE runtime contract

The board advertises as `Roll Compass` and exposes:

| Role | UUID |
| --- | --- |
| Service | `C1F8A100-35D1-4C53-9A03-7A1B3E620001` |
| Phone → board state write | `C1F8A101-35D1-4C53-9A03-7A1B3E620001` |
| Board → phone event notify | `C1F8A102-35D1-4C53-9A03-7A1B3E620001` |

Messages use strict contract v2 compact UTF-8 JSON terminated by `\n`, with a 512-byte logical
frame limit. iOS chunks state writes to the negotiated BLE write size; the
board reassembles them before validation. The board rejects unknown versions,
unknown actions, invalid numbers, oversized frames, and malformed state.

Phone-to-board state contains only phase, approximate distance, phone-computed
true-north target bearing plus magnetic declination when credible, confidence,
at most two broad categories, price band,
reveal boolean, and currently advertised guarded actions. Destination identity
is never sent to the board. The two north-reference fields are present or
absent together, so a stale or low-confidence phone heading cannot leave a
plausible-looking old arrow on the display.

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

The board display follows the collaborator's source-derived circular instrument:
black `#050706` face, off-white ticks/cardinals, green `#4DFF76` readouts, and
pink-red `#FF3850` needle. The iPhone remains the source of truth for the needle
bearing; the board does not calculate its own heading.

The display prefers two full RGB565 framebuffers in PSRAM and LVGL direct mode
to prevent visible tearing during the needle sweep. It automatically falls
back to partial 20-row buffers when memory or initialization is insufficient.
The source artwork is fixed at `0°`; touching outside an active action has no
display effect, so the readouts, ticks, cardinals, and needle remain aligned to
the physical circular face.

The physical BOOT button is also the screen button after normal startup. One
short press turns the backlight off and locks touch input; the next press wakes
the same live BLE journey screen. This does not power down the ESP32. RST keeps
its normal hardware-reset behavior. Do not hold BOOT while pressing RST or
powering on unless firmware download mode is intended.

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

The onboard QMI8658 measures acceleration and rotation rate but not magnetic
north. Until an external LIS2MDL magnetometer is wired and calibrated, rotating
the standalone board cannot make it behave as an independent compass. The
expected safe runtime state is therefore sensor-missing unless the iPhone owns
orientation or USB simulation is explicitly enabled. A microSD card does not
change this sensor requirement and does not expand the executable app
partition.

For the complete contract and rationale, see
`docs/superpowers/specs/2026-08-25-roll-compass-physical-compass-ble-design.md`
and `firmware/roll-compass-board/README.md`.
