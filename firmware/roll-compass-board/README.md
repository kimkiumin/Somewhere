# Roll Compass board firmware

This sketch targets the flat Waveshare `ESP32-S3-Touch-LCD-2.1` board (not the
2.1B variant). The phone remains the journey authority; this board only
renders safe guidance and emits touch intents over BLE.

## Local setup

From the repository root:

```sh
bun run firmware:setup
bun run firmware:assets
bun run firmware:ios
bun run firmware:compile
```

The setup is pinned in `dependencies.lock` and installs Arduino CLI and XcodeGen
under `.tools/`, with Arduino data under `.local-artifacts/`. Homebrew is not
required. The supported board FQBN is:

```text
esp32:esp32:waveshare_esp32_s3_touch_lcd_21
```

`firmware:assets` regenerates the 520px cropped LVGL compass shell and needle
from the shared iOS artwork. The board crop removes the transparent outer
decoration so the circular body reaches the display edges; the image is
intentionally clipped by the 480×480 face. The dial owns most of the display
while status, distance, and touch actions sit on top as small rounded overlays
rather than separate cards.

## USB flashing and diagnostics

The connected CH343P USB-UART port is normally exposed as
`/dev/cu.usbmodem*`. Upload compiles first and does not erase flash:

```sh
bun run firmware:upload
BOARD_PORT=/dev/cu.usbmodem5B901259011 bun run firmware:upload
bun run firmware:monitor
```

The port can change after a reset. If more than one modem is connected, set
`BOARD_PORT` explicitly. Serial speed is 115200. The monitor requests DTR and
RTS disabled. If macOS still interrupts boot while opening the native
USB-Serial/JTAG port, leave the monitor connected and press the physical RST
button once; subsequent logs and commands then use the already-open port.

The serial console also drives a deterministic visual preview. Start with
`sim on`, then use `target 0..359`, `heading 0..359`, `declination -180..180`,
`sweep cw`, `sweep ccw`, `sweep stop`, and `state guiding|near|paused|arrived|calibrating|sensor-missing|anomaly`.
`sim off` returns control to the live runtime. Simulated buttons never emit BLE
actions.

## BLE runtime contract

- Advertised name: `Roll Compass`
- Service: `C1F8A100-35D1-4C53-9A03-7A1B3E620001`
- State write characteristic: `C1F8A101-35D1-4C53-9A03-7A1B3E620001`
- Event notify characteristic: `C1F8A102-35D1-4C53-9A03-7A1B3E620001`

State and event messages are newline-delimited compact JSON. The board rejects
unknown versions/actions, invalid numbers, oversized frames, and any payload
that does not contain the safe state fields. Destination identity is not part
of the board contract. Contract v2 sends the north-referenced target bearing
and magnetic declination as an all-or-nothing pair; it does not send a
phone-relative arrow angle.

## Display behavior

The official Espressif `ESP32_Display_Panel` preset initializes the 480×480
RGB LCD and CST820 touch controller. The LVGL UI shows connection status,
phone-computed direction only when confidence is `credible`, approximate
distance, safe category/price cues, and only the actions advertised by the
phone. A stale state hides the arrow and disables actions.

The renderer prefers two 480×480 RGB565 framebuffers in PSRAM with LVGL direct
mode. If the PSRAM reserve or panel/LVGL initialization is insufficient, it
falls back to two 20-row internal-RAM draw buffers. Boot logs identify the
selected `display_mode` and current PSRAM/free-heap values.

Tap anywhere outside an active action to compensate for the physical USB-port
mount angle. The complete circular UI cycles `0° → 10° → 20° → 30° → 0°`;
boot always starts at `0°`. The correction rotates the shell, needle, labels,
and controls around the true 240×240 glass center.

A short press of the physical BOOT button toggles the LCD backlight like a
phone power button. BLE, the current journey state, and the firmware remain
active while the screen is dark, and touch input is locked until the next BOOT
press wakes it. RST remains the hardware reset button. Avoid holding BOOT while
pressing RST or powering on because that combination selects firmware download
mode instead of starting the app.

Wi-Fi and the QMI8658 IMU are intentionally not used for heading in this
checkpoint. Wi-Fi is reserved for a later OTA/diagnostics milestone, and the
QMI8658 is not a magnetometer. Without a separately wired LIS2MDL, the board
cannot react to its own physical rotation: the phone remains the heading source
and the no-sensor state is expected outside explicit USB simulation.
