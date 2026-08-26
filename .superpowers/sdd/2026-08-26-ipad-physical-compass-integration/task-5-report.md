# Task 5 report — firmware freshness, chunking, and Korean display

## Outcome

Implemented the firmware side of the reviewed Physical Compass BLE v1
contract. The Arduino sketch and host tests compile the same portable
`physical_compass_protocol.*` implementation.

- State sequences are positive and strictly increasing within a connection
  epoch. Disconnect/reconnect clears the parser, queued state, accepted state,
  freshness, action authority, and visible direction, so a new epoch accepts a
  low positive sequence.
- The board only exposes the latest complete state and only emits a touch
  event when the accepted sequence is still fresh and advertises that exact
  action.
- The contract has exactly `stop`, `continue`, `confirm-stop`, and `reveal`;
  `review` is rejected and cannot be encoded.
- The portable parser validates UTF-8, enforces the 40-byte display boundary,
  rejects malformed/unknown/oversized fields and frames, reassembles newline
  frames, coalesces complete input to the latest state, and safely recovers
  after an oversized line.
- Event notifications use `MTU - 3` bytes for a valid negotiated MTU and a
  conservative 20-byte ATT payload fallback, preserving frame order and the
  final newline.
- Production display copy is Korean (`분류`, price/status/action labels) with
  no `CLUE` surface or destination identity.
- Asset generation now runs only through a local pinned environment with
  `Pillow==11.3.0`.

## TDD evidence

### RED

Initial host execution was intentionally run before the portable production
translation units existed:

```text
bun run firmware:test
```

Binary observable: the host runner exited with status 1 because
`physical_compass_protocol.cpp` and `display_copy.cpp` were not present. The
captured RED log is:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/red-host.log`

The later first protocol implementation also produced a captured compile RED
when the display header was not yet included:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/green-protocol-first-failure.log`

### GREEN

Final host invocation:

```text
bun run firmware:test
```

Binary observable: `firmware host tests: 7 suites, 58 assertions passed`,
status 0. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/host-final.log`

The seven suites cover these exact scenarios:

1. Positive sequence acceptance, duplicate/older/zero rejection, monotonic
   reconnect epoch, and low-sequence reset.
2. Atomic disconnect clearing of partial input, queued/accepted state,
   freshness, action authority, and visible sequence.
3. Valid/malformed UTF-8, 40-byte ASCII/Korean boundaries, safe truncation,
   required-field rejection, unknown version/action, non-finite numbers, and
   oversized frames.
4. Newline reassembly, coalescing, and recovery after an oversized logical
   line.
5. Exactly four actions, no `review`, advertised-action and accepted-sequence
   guards, and stale-action suppression.
6. Negotiated-MTU and 20-byte fallback event chunking, byte bounds, ordering,
   and newline preservation.
7. Korean category, price, and waiting copy with no `CLUE` surface.

The host binary is compiled by
`scripts/firmware/test-board-host.sh` from the firmware-owned portable source,
not from a duplicate test model.

## Assets and toolchain

Setup invocation:

```text
bun run firmware:setup
```

Binary observable: status 0, local environment installed
`Pillow==11.3.0`, Arduino CLI 1.5.1, and ESP32 core 3.3.11. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/setup.log`

Final asset invocation:

```text
bun run firmware:assets
```

Binary observable: status 0; generated a 520x520 RGBA565 LVGL header using
Pillow 11.3.0. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/assets-final.log`

Generated header size: 10,140,678 bytes at
`firmware/roll-compass-board/compass_assets.h`. It is an ignored generated
artifact and is not staged as a source change.

## Compile and flash assertion

Final compile invocation:

```text
bun run firmware:compile
```

FQBN: `esp32:esp32:waveshare_esp32_s3_touch_lcd_21`

Binary observables:

- Sketch: 2,615,637 bytes, 83% of 3,145,728-byte program storage.
- Globals: 31,636 bytes, 9% of 327,680-byte dynamic memory.
- Flash assertion: `83% < 90%`, status 0.

Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/compile-final.log`

The compile helper keeps the Arduino CLI log outside its cleaned build
directory and fails if the parsed flash percentage is 90% or higher.

## Scope and final checks

`git diff --check` was run after implementation and returned status 0. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5/diff-check.log`

The owned change set is:

- `firmware/roll-compass-board/README.md`
- `firmware/roll-compass-board/dependencies.lock`
- `firmware/roll-compass-board/display_copy.cpp`
- `firmware/roll-compass-board/display_copy.h`
- `firmware/roll-compass-board/display_ui.cpp`
- `firmware/roll-compass-board/physical_compass_protocol.cpp`
- `firmware/roll-compass-board/physical_compass_protocol.h`
- `firmware/roll-compass-board/physical_compass_wire.cpp`
- `firmware/roll-compass-board/physical_compass_wire.h`
- `firmware/roll-compass-board/roll-compass-board.ino`
- `scripts/firmware/compile-board.sh`
- `scripts/firmware/physical_compass_wire_test.cpp`
- `scripts/firmware/requirements.txt`
- `scripts/firmware/run-assets.sh`
- `scripts/firmware/setup-toolchain.sh`
- `scripts/firmware/test-board-host.sh`
- `package.json`
- `.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/progress.md`
- `.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/task-5-report.md`

No iOS, app, server, contracts, or unrelated documentation files were
modified.

## Deliberate limits and hypothesis

No board upload or flash erase was run. No physical runtime PASS is claimed;
the evidence above is host-test and compile evidence only.

Hypothesis: a stale-safe, low-screen board that preserves the phone's current
action authority while presenting compact Korean category/price cues can
support physical discovery without exposing destination identity or becoming a
map UI.
