# Task 5 brief — firmware freshness, chunking, and Korean display

## Scope

Harden the Waveshare ESP32-S3-Touch-LCD-2.1 Rev 2.0 firmware against the
reviewed iOS BLE v1 contract. The iPad/iPhone remains the journey, GPS,
direction, and action authority; the board only renders fresh safe state and
emits currently authorized touch intent.

## Required behavior

- Accept only positive state sequences that increase within the current BLE
  connection epoch. Duplicate, zero, older, malformed, and oversized logical
  frames must not replace the accepted state.
- On disconnect, atomically clear partial reassembly, queued state, current
  action authority, freshness, and visible direction. A new connection starts
  stale and may accept a low positive sequence as the first state of its new
  epoch.
- Never render a direction needle or send an action until one complete fresh
  state has been accepted in the current epoch. Touch events must echo exactly
  that accepted sequence and only an action advertised by that state.
- Remove the unused `review` action so firmware agrees with the iOS four-action
  contract: `stop`, `continue`, `confirm-stop`, `reveal`.
- Enforce the 40-byte UTF-8 display-field limit without splitting a UTF-8 code
  point. Reject invalid UTF-8 and over-limit required fields; keep at most two
  menu/category values.
- Reassemble newline-delimited state frames without interleaving, reject
  overlong partial data safely, and retain only the latest complete
  not-yet-applied state.
- Split event notification frames into ATT-safe chunks derived from the
  negotiated MTU (or a conservative 20-byte fallback), preserving one complete
  newline-delimited event frame in order.
- Replace `CLUE`/`HIDDEN CLUE`/English waiting copy with a compact
  Korean-capable category/menu presentation that fits the 480×480 circular
  display. Do not add destination identity, maps, or road names.
- Keep compiled flash usage below 90%. Do not upload or erase the physical
  board in this task.
- Resolve the asset generator's Pillow dependency explicitly: declare a pinned
  local requirement/setup path or remove the dependency. Do not rely on an
  undeclared global Python package.

## TDD evidence

Before production edits, add host-runnable tests that fail for:

1. zero/duplicate/decreasing sequence rejection and new-epoch sequence reset;
2. disconnect clearing fresh rendering and action authority;
3. UTF-8 validation/40-byte boundaries, malformed/oversized frames, and frame
   reassembly/coalescing;
4. allowed-action/accepted-sequence event guards and removal of `review`;
5. event-frame ATT chunk ordering and newline preservation;
6. Korean display copy with no remaining `CLUE` surface.

Tests must execute firmware-owned logic, not a separate duplicate contract
model. Prefer extracting portable state/session/framing helpers that both the
Arduino sketch and host test binary compile. If Arduino types prevent direct
host compilation, introduce the smallest adapter boundary and prove the shared
logic through that boundary.

Then run:

- the new firmware host test command;
- `bun run firmware:assets` from the declared environment;
- `bun run firmware:compile`;
- a flash-size assertion that fails at 90% or above;
- `git diff --check`.

## Write ownership

- `firmware/roll-compass-board/physical_compass_wire.*`
- `firmware/roll-compass-board/roll-compass-board.ino`
- `firmware/roll-compass-board/display_ui.*`
- `firmware/roll-compass-board/README.md`
- `scripts/firmware/` host tests/compile helpers/dependency setup
- `package.json` and a firmware-local dependency declaration when needed
- task report under this ledger directory

Do not edit iOS, app, server, contract, recommendation, or backend files.

## Required report

Record RED and GREEN commands/outcomes, exact flash/RAM percentages, every
changed file, protocol decisions, and the explicit statement that no physical
board upload/runtime PASS is claimed without a connected board.
