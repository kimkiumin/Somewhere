# Task 5 report — firmware reviewer fixes

## Outcome

The board-side fixes for the independent review of commit `42f0602` are
implemented on `codex/ipad-board-integration`. The phone remains the GPS,
heading, route, and destination-authority device; the board still receives
only the hidden-state display projection and never claims standalone GPS or
reveals destination identity.

- Every public display entry point, including UI construction, state updates,
  connection updates, ticks, touch reads, and callback mutation, takes the
  LVGL recursive mutex before reading or mutating display state.
- Action authorization and event notification now share `pendingStateMutex`.
  Disconnect invalidates the session before releasing that mutex, so an
  authorized action cannot notify after session invalidation. Notification
  status failures retry the current ATT chunk at most three times; the iOS
  newline-delimited event JSON and chunk format are unchanged.
- A pending newer sequence blocks all actions from the older accepted state
  until the pending state is applied.
- Stale rendering no longer depends on the needle's prior visibility. It
  redraws the stale view, hiding the needle and clearing distance, menu/price,
  and actions.
- Korean copy and curated categories use a tracked 1-bit, 14 px LVGL Hangul
  subset generated from the pinned LVGL Korean font. The subset contains 103
  glyphs and is 29,742 bytes; unsupported characters use the existing ASCII
  fallback. Menu labels use continuous circular scrolling, and Bluetooth
  status is placed in the lower-center channel at `(176, 307, 128, 24)`.
- Price rendering is a closed whitelist: only `low`, `medium`, and `high`
  receive Korean labels; arbitrary wire text becomes `가격 미정`.
- JSON container recursion is bounded at `kMaxJsonDepth = 8` before array or
  object materialization.
- The Arduino compile helper removes the firmware build directory before each
  compile. It uses a clean build directory before each compile, so the report
  and helper agree on clean builds.

## TDD and source-contract evidence

The RED host invocation was:

```text
bun run firmware:test
```

Binary observable: exit status 1 with two failing assertions for the pending
sequence action guard and arbitrary price fallback. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/red-host.log`

The initial RED source-contract invocation was:

```text
bash scripts/firmware/display_source_contract_test.sh
```

Binary observable: exit status 1 with 17 missing reviewer-fix assertions before
the production changes. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/red-source-contract.log`

The final host invocation was:

```text
bun run firmware:test
```

Binary observable: exit status 0; `firmware host tests: 9 suites, 69
assertions passed`, followed by the source-contract suite passing. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/host-green-final.log`

The final source-contract invocation was:

```text
bash scripts/firmware/display_source_contract_test.sh
```

It checks mutex ordering, stale redraw independence, Hangul font use, menu
scrolling, lower-center Bluetooth placement, bounded per-chunk retry, parser
depth checks, and clean-build script/report agreement. Its status-0 output is
24 assertions passed, captured at:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/source-contract-final.log`

## Assets and Arduino compile

The final asset invocation was:

```text
bun run firmware:assets
```

Binary observable: status 0; the 520x520 compass assets and tracked
`display_hangul_font.c/.h` were generated with the pinned local Pillow
environment. The output reports 103 Hangul glyphs and 29,742 bytes for the C
font source. Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/assets-green-final.log`

The final clean compile invocation was:

```text
bun run firmware:compile
```

FQBN: `esp32:esp32:waveshare_esp32_s3_touch_lcd_21`.

Binary observables: status 0; sketch size 2,610,669 bytes, `82%` of
3,145,728-byte program storage; globals 31,636 bytes, `9%` of 327,680-byte
dynamic memory, with 296,044 bytes remaining; flash assertion `82% < 90%`.
Artifact:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/compile-green-final.log`

## Final checks and scope

The final `git diff --check` invocation and status-0 output are captured at:

`/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition/.omo/evidence/task-5-review/diff-check-final.log`

Owned implementation and test files in this attempt are:

- `firmware/roll-compass-board/display_copy.cpp`
- `firmware/roll-compass-board/display_hangul_font.c`
- `firmware/roll-compass-board/display_hangul_font.h`
- `firmware/roll-compass-board/display_ui.cpp`
- `firmware/roll-compass-board/physical_compass_protocol.cpp`
- `firmware/roll-compass-board/physical_compass_protocol.h`
- `firmware/roll-compass-board/roll-compass-board.ino`
- `scripts/firmware/compile-board.sh`
- `scripts/firmware/display_source_contract_test.sh`
- `scripts/firmware/generate-hangul-font.py`
- `scripts/firmware/physical_compass_wire_test.cpp`
- `scripts/firmware/run-assets.sh`
- `scripts/firmware/test-board-host.sh`
- `.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/task-5-report.md`

No iOS, web, backend, or unrelated files were changed. The generated
`compass_assets.h` and build directories remain ignored artifacts.

## Physical-only limits

No board upload, flash erase, or physical runtime PASS is claimed. A physical
run is still required to verify Korean glyph legibility, circular-scroll timing,
lower-center status placement, touch behavior under concurrent BLE callbacks,
BLE packet loss beyond synchronous notification status errors, and compass
calibration/magnetic interference. The bounded retry has no application-level
acknowledgement, so a silent radio loss remains undetectable. The board has no
GPS and does not disclose destination name, address, or identity.
