# Roll Compass board firmware

This sketch targets the flat Waveshare `ESP32-S3-Touch-LCD-2.1` board (not the
2.1B variant). The phone remains the journey authority; this board only
renders safe guidance and emits touch intents over BLE.

For the latest physical-device handoff, read the Korean
[board specifications and display troubleshooting guide](../../docs/operations/board-display-handoff.md).
For an accessible introduction and a prompt to give your coding AI, start with
[AI-assisted board work](../../docs/operations/board-collaborator-start-here.md).
The September 6 renderer changes have not been flashed to the handed-off board.

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
esp32:esp32:waveshare_esp32_s3_touch_lcd_21:CDCOnBoot=cdc
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

The needle has five local presentation styles: the exact 2 px source line,
precision spear, dual rail, balanced mechanical, and curved cutlass. A tap on
empty instrument space advances to the next style and wraps back to the source
line. Journey action buttons keep touch priority, and changing a needle style
never emits a BLE action or changes the contract-v2 bearing/safety rules.

`firmware:assets` still regenerates the Korean fallback fonts and the legacy
asset bundle used by the Windows restore path. It is not a regeneration step
for the collaborator's source artwork. Refresh that artwork only from the
exact source commit documented in the Windows handoff, then re-run the host
tests and Arduino compile.

For a new Korean phrase, add it to `font-text.txt` and run
`bun run firmware:fonts`. This cross-platform Bun command verifies/downloads the
pinned font, generates 16/20px Korean+ASCII subsets, and repacks the Windows
bundle. No Python, WSL, or image regeneration is needed for text-only changes.
Commit the phrase list and bundle together. Windows CI checks reproducibility.
The exact source-derived instrument headers remain tracked separately.

The Korean subset comes from Noto Sans KR at Google Fonts commit
`6a003b5eb672dc8bf5bff5937cf5863f8b175445`; the generator pins/verifies its SHA-256.
Keep [its OFL notice](OFL-NotoSansKR.txt) with redistributed font assets. The legacy
wordmark uses the separately tracked
[UnifrakturCook OFL notice](../../ios/Somewhere/Resources/Fonts/OFL-UnifrakturCook.txt).

Readouts use actual LVGL font metrics to fit their fixed width with `...` when
necessary. Unknown glyphs show `ON PHONE` using the source ASCII font; the
original BLE value is unchanged. The supported Korean phrases include the
app's `따뜻한 한식`/`보통 가격대` preview and route-recovery status text.
This is a curated glyph subset, not a complete Korean font. `instrument_text.*`
also fits the font line height so mixed Korean/ASCII values are not clipped.

## USB flashing and diagnostics

The board exposes native USB-Serial/JTAG as well as a CH343P USB-UART path.
The last verified macOS upload used native `/dev/cu.usbmodem1101`; port names
depend on connector/driver and can change. Upload compiles first and rewrites
the application sectors; it does not perform a whole-chip erase:

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

This development build starts in a deterministic visual demo without a phone
or magnetometer: it shows `320m`, `TONKATSU`, `PRICE -`, starts the source-style
2 px needle at 35 degrees, and moves it back and forth from 23 to 47 degrees on
an eight-second loop. The tick/cardinal rose counter-rotates with that simulated
heading, with a fixed 12-o'clock reference mark. This keeps the motion visible without letting the default
demo drift away from the collaborator preview's composition. Demo mode keeps
status and action controls hidden. The first fresh, valid BLE v2 snapshot
automatically ends this independent preview before rendering, so the app's
`d`, `m[0]`, and `p` values take priority. The serial console can restart that
preview with `sim on`, then use `target 0..359`, `heading 0..359`, `declination -180..180`,
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
board-relative direction from v2 `tb`/`md` and a valid board heading only when
confidence is `credible`, approximate
distance, the first representative menu and price cue, and only the actions
advertised by the phone. A stale, paused, route-recovery, or otherwise
non-credible state hides the exact arrow and disables unsafe actions.

The renderer prefers two 480×480 RGB565 framebuffers in PSRAM with LVGL direct
mode. If the PSRAM reserve or panel/LVGL initialization is insufficient, it
falls back to two 20-row internal-RAM draw buffers. Boot logs identify the
selected `display_mode` and current PSRAM/free-heap values.

The overall screen has a fixed `0°` mount orientation. The source ticks and
upright cardinal labels rotate by the negative true board heading during
credible guidance; readouts, controls, and the top reference mark remain fixed.
Unsafe guidance freezes the rose and hides the needle. Touching empty instrument
space cycles only the five needle styles. Active journey actions keep priority.

Lines use tight LVGL bounds and skip identical pixel geometry. Animation runs
on 25ms steps and pauses while the backlight is off. Heading-only updates do
not reset readout text. `bun run firmware:test-renderer` uses the real pinned
LVGL rasterizer on macOS/Linux to compare pixels, erase old strokes, and check
dirty-region reduction. This does not measure physical LCD tearing or FPS.

A short press of the physical BOOT button toggles the LCD backlight like a
phone power button. BLE, the current journey state, and the firmware remain
active while the screen is dark, and touch input is locked until the next BOOT
press wakes it. RST remains the hardware reset button. Avoid holding BOOT while
pressing RST or powering on because that combination selects firmware download
mode instead of starting the app.

Wi-Fi and the QMI8658 IMU are intentionally not used for heading in this
checkpoint. Wi-Fi is reserved for a later OTA/diagnostics milestone, and the
QMI8658 is not a magnetometer. Without a separately wired LIS2MDL, the board
cannot react to its own physical rotation in live mode. The phone supplies the
north-referenced target and declination, not the board heading. The current
sketch still reports the sensor as missing; wiring a LIS2MDL also requires a
driver and calibration integration before live pointing is possible.
