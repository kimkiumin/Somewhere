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

On Windows, use the WSL-free PowerShell wrapper instead of these macOS-oriented
shell commands. The one-time setup and explicit COM-port workflow are in the
[Windows collaboration handoff](../../docs/operations/windows-collaboration-handoff.md).
That wrapper restores the exact generated image and font sources from the
checked-in integrity-verified `generated-assets-v1.br` bundle, so a clean
Windows clone does not need Python or the font/image generation dependencies.
The source-derived circular instrument headers are tracked separately and are
not reconstructed by that legacy bundle restore.

The live renderer uses the checked-in collaborator port at
`3022401c02e92204d2751f569b19745024724c80`: exact SVG-derived tick geometry in
`compass_artwork.h` and the source bitmap data for `Univers Next Pro Thin
Condensed` in `univers_next_pro_thin_condensed_font.h`. It draws a black
480×480 circular instrument with off-white cardinals/ticks, green
`REMAINING`/`PRICE`/`MENU` readouts, and a pink relative-bearing needle. The
readout baselines and bounds are tested against the circular face; there is no
scrolling or square card layer.

`firmware:assets` still regenerates the Korean fallback fonts and the legacy
asset bundle used by the Windows restore path. It is not a regeneration step
for the collaborator's source artwork. Refresh that artwork only from the
exact source commit documented in the Windows handoff, then re-run the host
tests and Arduino compile.

After an intentional fallback-font change on the maintainer toolchain, run
`bun run firmware:assets` and then
`bun scripts/firmware/package-board-assets.mjs` so clean Windows clones receive
the same generated inputs. The exact source-derived instrument headers remain
tracked files and do not need to be packed into that legacy bundle.

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
RGB LCD and CST820 touch controller. The LVGL UI shows the source instrument,
phone-computed direction only when confidence is `credible`, approximate
distance, the first representative menu and price cue, and only the actions
advertised by the phone. A stale, paused, route-recovery, or otherwise
non-credible state hides the exact arrow and disables unsafe actions.

The renderer prefers two 480×480 RGB565 framebuffers in PSRAM with LVGL direct
mode. If the PSRAM reserve or panel/LVGL initialization is insufficient, it
falls back to two 20-row internal-RAM draw buffers. Boot logs identify the
selected `display_mode` and current PSRAM/free-heap values.

Tap anywhere outside an active action to compensate for the physical USB-port
mount angle. The complete circular UI cycles `0° → 10° → 20° → 30° → 0°`;
boot always starts at `0°`. The correction rotates the source ticks/cardinals,
needle, readouts, and controls around the true 240×240 glass center.

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
