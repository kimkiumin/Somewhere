# Task 4 review package

## Review range

- Base: `91bdc1d`
- Head: `HEAD` (Task 4 review-fix tip)
- Worktree: `/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-ble-hardening`

## Authority

- `docs/superpowers/specs/2026-08-26-ipad-physical-compass-integration-design.md`
- `docs/superpowers/plans/2026-08-26-ipad-physical-compass-integration.md`
- `.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/task-4-brief.md`
- `.superpowers/sdd/2026-08-26-ipad-physical-compass-integration/task-4-report.md`

## Review focus

Inspect the complete Task 4 range from `91bdc1d` through the review-fix commit
for correctness and regressions, especially:

1. CoreBluetooth reconnect epochs, late callbacks, write-without-response
   backpressure, complete-frame ordering, and stale event authority.
2. Positive sequence enforcement and UTF-8 byte/grapheme handling.
3. Persisted opt-in behavior, one-host operating copy, and whether production
   Release always uses the real client while deterministic injection remains
   DEBUG-only and explicit.
4. Board action authorization against both the fresh snapshot and current
   journey projection.
5. iPhone/iPad settings usability and test adequacy.

Do not review firmware implementation in this task. Report only actionable
findings with file/line references and severity; say `APPROVED` when no finding
remains. Real-board PASS is explicitly not claimed.

## Evidence

- RED: `.omo/evidence/task-4/red-focused.log`
- Final focused units: `.omo/evidence/task-4/green-focused-final-3.log`
  (37 passed)
- All units: `.omo/evidence/task-4/green-all-units-iphone13.log`
  (57 passed)
- iPhone board-settings UI: `.omo/evidence/task-4/green-board-settings-ui-1.log`
- iPad board-settings UI: `.omo/evidence/task-4/green-board-settings-ipad-final.log`
- Release build: `.omo/evidence/task-4/green-release-build.log`
- Source/field gate: `.omo/evidence/task-4/green-ios-source-final.log`

## Prior findings that must be re-checked

1. Same-object `CBPeripheral` reconnect callbacks are epoch-bound and cannot
   mutate a newer connection.
2. Board events require authority in both the fresh advertised snapshot and the
   live journey projection.
3. A disconnect has an observable deterministic status before a retry scan.
4. Settings remain operable at Accessibility XXXL without introducing scrolling
   to the core journey screen.
5. Tests cover all transport status copy and the settings/source contract.

## Review-fix evidence

- Focused store/wire tests: 40 passed
  (`.omo/evidence/task-4/review-green-focused-final.log`).
- Accessibility XXXL UI: 1 passed
  (`.omo/evidence/task-4/review-green-accessibility-final-2.log`).
- iPhone 13 normal settings UI: 1 passed
  (`.omo/evidence/task-4/review-green-board-iphone13-final.log`).
- iPad Pro 11-inch (2nd generation) normal settings UI: 1 passed
  (`.omo/evidence/task-4/review-green-board-ipad-final.log`).
- Source/field gate: 30 passed; 28 unit and 36 UI scenarios
  (`bun run verify:ios-source`).
- Release build: `.omo/evidence/task-4/review-green-release-build-final.log`.
