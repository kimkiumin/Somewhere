# Windows collaboration handoff

Status: 2026-08-27 operational guide for the current `Roll the compass!` V2
branch and physical compass companion

This is a menu, not a mandatory checklist. Read the short context once, then
use only the section that matches the work at hand. Commands assume ordinary
64-bit Windows PowerShell and do not require WSL or Git Bash.

## Three-minute context

`Roll the compass!` chooses one eligible destination, keeps its identity
hidden, and leads the user with minimal direction and approximate distance.
The current runtime responsibilities are deliberately separated:

```text
Cloudflare service owns journey and hidden-destination state
                  ↓ HTTPS
iPhone owns GPS, route guidance, magnetic/true-north handling and safety UI
                  ↓ BLE contract v2
ESP32 board renders safe projected state and sends guarded touch intents
```

USB is a development path for flashing and serial diagnostics, not the journey
transport. Wi-Fi is deferred. The board never receives the destination name or
address.

When documents disagree, use this order: the owner's latest direction, root
[`BLUEPRINT.md`](../../BLUEPRINT.md) and its linked blueprint documents, the
current V2 design, executable contracts/code/tests, then v0.2 and v0.1 only as
history. Root [`AGENTS.md`](../../AGENTS.md) and the
[documentation authority index](../README.md) explain the boundary. In
particular, V2 does not restore the historical active Reroll control.

The collaboration branch is `codex/roll-compass-native-app`. BOOT-button screen
behavior was isolated in commit `0ee5774`; use the latest remote branch tip for
all Windows tooling and documentation in this guide. Do not transplant an
older visual or prototype branch wholesale into this V2 tree.

## What is where

| Area | Main locations | Responsibility |
| --- | --- | --- |
| Product authority | `BLUEPRINT.md`, `docs/blueprint/`, `docs/product/` | Approved V2 behavior and current native requirements |
| iPhone client | `ios/Somewhere/`, `ios/project.yml` | SwiftUI, Core Location, BLE central, journey presentation |
| Service | `server/` | Journey authority, destination eligibility and persistence |
| Shared contracts | `contracts/` | Wire schemas and policy boundaries |
| Web/history | `app/`, `prototype/` | V2 web service evidence and frozen historical regression surfaces |
| Board firmware | `firmware/roll-compass-board/` | Circular LVGL UI, BLE peripheral, touch/BOOT behavior |
| Board tools | `scripts/firmware/` | Reproducible setup, compile, upload and diagnostics |
| Operations | `docs/operations/` | Platform handoffs, field checks and release boundaries |

Add or remove iOS files through `ios/project.yml`; do not hand-edit a generated
`.xcodeproj`.

## Current board behavior

The target is the flat Waveshare `ESP32-S3-Touch-LCD-2.1`, not the 2.1B. Its
480×480 circular face is filled by the compass UI. Touching outside an active
action cycles the complete UI through mount corrections
`0° → 10° → 20° → 30° → 0°` around the true display center.

A normal short press of BOOT now toggles the backlight immediately. While dark,
touch is locked but BLE, journey state, and firmware remain alive; the next
press restores the same screen. RST remains reset, and the physical power
switch remains hardware power. Do not hold BOOT while resetting or powering on
unless firmware download mode is intended.

The board's QMI8658 measures acceleration and angular velocity but is not a
magnetometer. Rotating the standalone board therefore does not rotate the
journey needle; the iPhone supplies heading. An external magnetometer would be
a separate hardware milestone. The current firmware compile occupies about 56%
of the app flash partition and 9% of global RAM, so a microSD card is not needed
for the current executable and would not enlarge that partition.

The BLE endpoints are:

| Role | UUID |
| --- | --- |
| Service | `C1F8A100-35D1-4C53-9A03-7A1B3E620001` |
| iPhone → board state write | `C1F8A101-35D1-4C53-9A03-7A1B3E620001` |
| Board → iPhone event notify | `C1F8A102-35D1-4C53-9A03-7A1B3E620001` |

Contract v2 uses newline-delimited compact JSON. The phone projects phase,
approximate distance, credible north-referenced guidance, broad category/price
cues, reveal state, and currently permitted actions. The board rejects stale,
malformed, oversized, or unadvertised input rather than showing plausible but
unsafe guidance. See the [physical BLE runbook](physical-compass-ble.md) for the
complete contract.

## Starting on Windows

Install Git for Windows, Bun `1.3.14`, and Node `24.x`, then clone the exact
collaboration branch. Bun's official Windows installer is suitable; reopen
PowerShell after installation so the updated PATH is visible.

```powershell
git clone https://github.com/kimkiumin/Somewhere.git
Set-Location Somewhere
git fetch origin
git switch --track origin/codex/roll-compass-native-app
bun install --frozen-lockfile
bun run verify:windows
```

If a local branch already exists, `git switch codex/roll-compass-native-app`
followed by `git pull --ff-only` is safer than creating it again.

The repository pins text files to LF through `.gitattributes`. Git for Windows
may keep its normal `core.autocrlf` setting; do not bulk-convert the checkout to
CRLF, because the shared Biome formatting gate verifies the checked-in LF
contract on every platform.

`verify:windows` is the shared Windows smoke gate: firmware command-plan tests,
contract tests, TypeScript checks, lint, the web build, and platform-neutral iOS
source validators. It intentionally does not pretend to be the full release
gate. Linux operations scripts, Playwright system dependencies, and production
release evidence remain covered by Ubuntu CI; Xcode compilation and iOS runtime
evidence remain covered by macOS/physical-device paths.

## Compiling and flashing the board without WSL

Install the official Arduino CLI `1.5.1` Windows MSI or ZIP and make
`arduino-cli.exe` available on PATH. If it must live elsewhere, set
`SOMEWHERE_ARDUINO_CLI` to its full path for the current PowerShell session.
The repository wrapper stores cores, libraries, config, and build output under
ignored `.local-artifacts/` folders rather than changing a global Arduino IDE
profile.

```powershell
# One-time pinned core/library setup
.\scripts\firmware\windows-board.ps1 setup

# See detected serial ports, then compile or flash explicitly
.\scripts\firmware\windows-board.ps1 ports
.\scripts\firmware\windows-board.ps1 compile
.\scripts\firmware\windows-board.ps1 upload -Port COM7
.\scripts\firmware\windows-board.ps1 monitor -Port COM7
```

Replace `COM7` with the CH343P port shown by the `ports` command or Windows
Device Manager. Upload always compiles first and never guesses a port. The
monitor uses 115200 baud with DTR and RTS disabled. If opening it catches no
startup log, leave it open and press RST once.

The setup pins Arduino-ESP32 `3.3.11`, ESP32 Display Panel `1.0.4`, ESP32 IO
Expander `1.1.0`, esp-lib-utils `0.2.0`, LVGL `8.4.0`, and ArduinoJson `7.4.3`.
The exact FQBN is
`esp32:esp32:waveshare_esp32_s3_touch_lcd_21`. Generated compass assets are
stored in the checked-in `generated-assets-v1.br` build bundle; the wrapper
validates every embedded digest before writing, refuses linked/reparse output
paths, and atomically restores the ignored C/C++ inputs before setup, compile,
or upload. Ordinary firmware changes therefore do not require a Windows image
or font generation toolchain, and a stale linked file cannot redirect the
restore outside the firmware directory.

Useful serial commands for a phone-free visual check are `sim on`,
`target 315`, `heading 0`, `sweep cw`, `state near`, `sweep stop`, and
`sim off`. Simulation cannot send real BLE actions.

## Working on iOS source from Windows

Windows contributors can review and edit Swift, tests, resources, BLE
contracts, and `ios/project.yml`. `bun run verify:windows` includes the
platform-neutral source and field-flow validators, which catch many contract
and project-definition mistakes before handoff.

Windows cannot provide Xcode, iOS Simulator, signing, archive distribution, or
a physical iPhone/board BLE result. After an iOS source change, a Mac owner or
macOS CI must generate the project and run the native build/tests. Physical BLE,
GPS/heading quality, and foreground lifecycle behavior still require a real
iPhone; the Simulator cannot prove a connection to this board.

## CI and verification meaning

GitHub Actions divides evidence by platform:

- `windows-collaboration.yml` runs the PowerShell entry point in dry-plan mode
  and executes `verify:windows` on a Windows runner. CI has no connected board,
  so it does not flash hardware.
- `v2-ci.yml` is the Ubuntu repository gate for the larger service slice and
  operations checks.
- `ios-ci.yml` generates and builds the Xcode project, runs native unit/UI
  tests, and creates an unsigned archive on macOS. It grants no signing or
  distribution authority.

The automated service slice has previously reached repository `PASS`, while
the full approved blueprint and public release remain `BLOCK` until provider
rights/quotas, legal and production operations, study policy, and same-build
physical evidence exist. A successful Windows smoke must not be restated as
production readiness.

## Practical troubleshooting

- **`bun` is not recognized:** reopen PowerShell after installation and check
  `bun --version`; the expected version is `1.3.14`.
- **Arduino CLI version mismatch:** install `1.5.1` or point
  `$env:SOMEWHERE_ARDUINO_CLI` at the pinned executable. The wrapper fails
  closed on a different version.
- **No COM port:** use the board's USB-UART connector, try a data-capable cable,
  inspect Device Manager, reconnect the board, then rerun `ports`.
- **Upload cannot enter download mode:** normally the CH343P auto-download
  circuit handles this. If recovery is needed, hold BOOT, tap RST, release
  BOOT, upload, then press RST to run normally.
- **Board resets when a monitor opens:** the wrapper disables DTR/RTS. Keep the
  monitor open and tap RST once if startup was still interrupted.
- **Simulator sees no board:** expected. Treat Simulator coverage as source/UI
  evidence and move the BLE check to a physical iPhone.

## Lightweight handoff note

A collaborator does not need to reproduce every gate for every change. A useful
handoff says what the change was for, which areas were touched, which commands
actually passed, what could not be checked on that Windows machine, and which
Mac/Ubuntu/physical check the owner should run next. Record observed evidence;
do not upgrade an unrun check to `PASS`.

Official platform references used by this path:

- [Bun installation](https://bun.sh/docs/installation)
- [Arduino CLI installation](https://arduino.github.io/arduino-cli/dev/installation/)
- [Arduino-ESP32 installation](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html)
- [Apple Xcode system requirements](https://developer.apple.com/xcode/system-requirements/)
- [Waveshare ESP32-S3-Touch-LCD-2.1 documentation](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1)
