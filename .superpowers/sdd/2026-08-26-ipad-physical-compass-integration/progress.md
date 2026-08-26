# SDD ledger — plan: docs/superpowers/plans/2026-08-26-ipad-physical-compass-integration.md

## Baseline

- Workspace: `/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition`
- Branch: `codex/ipad-board-integration`
- Start commit before plan docs: `0878199cca43b48aa0f5d5d85c5707409b63d1e7`
- Plan/spec commit: `70e7bcc`
- `bun run verify:ios-source`: 29 pass, 0 fail.
- iPad Pro 11-inch (2nd generation) native units: 41 pass, 0 fail.

## Pre-flight task/interface scan

| Producer / consumer | Shared file or interface | Finding | Ruling |
| --- | --- | --- | --- |
| Task 1 → Task 4 | Swift BLE wire/controller/store | Task 1 imports an intentionally incomplete baseline that Task 4 hardens. | Preserve behavior and tests first; harden only after integration. Cost if wrong: Task 4 may have to reshape the baseline. |
| Task 1 → Task 5 | Firmware wire/display/toolchain | Task 1 imports firmware that Task 5 changes. | Treat imported firmware as the red-test baseline. Cost if wrong: host-test scaffolding may need extraction. |
| Task 2 → Task 3 | `CompassView.swift`, `JourneyFlowUITests.swift` | Layout and copy tests share files. | Execute sequentially; Task 3 starts from Task 2 HEAD. Cost if wrong: small test conflict. |
| Task 3 → Task 4 | `JourneyFlowUITests.swift` | Board status tests extend the same UI suite. | Task 4 appends new board scenarios without rewriting Task 3 assertions. Cost if wrong: test organization refactor. |
| Task 4 → Task 5 | BLE v1 framing/actions/freshness | iOS and firmware must agree exactly. | Freeze final v1 semantics in Swift tests/spec before firmware changes. Cost if wrong: firmware test fixtures must be updated once. |
| Tasks 1–5 → Task 6 | generated project, tests, docs, screenshots | Verification consumes every prior output. | Regenerate only from `ios/project.yml`; generated project is evidence, not authority. Cost if wrong: stale Xcode membership hides code. |

## Internal task consistency scan

| Task | Tests vs implementation | Files vs later consumers | Result |
| --- | --- | --- | --- |
| 1 | Baseline verification precedes preservation commit. | Produces all BLE/firmware files used later. | Consistent. |
| 2 | Unit metrics and UI geometry fail before responsive layout changes. | Task 3 knowingly shares two files and follows sequentially. | Consistent. |
| 3 | UI assertions directly cover the road/copy/error defects. | Task 4 only appends board scenarios. | Consistent. |
| 4 | Wire/store/controller/UI tests cover each production behavior. | Freezes protocol for Task 5. | Consistent. |
| 5 | Host parser tests cover firmware behavior before compile. | Task 6 consumes test/compile commands. | Consistent. |
| 6 | Verification is evidence-only except handoff documentation. | No downstream implementation task. | Consistent. |

## Rulings

- Ruling: Keep the other task's dirty root checkout untouched until it passes
  fresh verification, then preserve it as one coherent baseline commit — this
  avoids lossy manual copying — cost if wrong: the source branch gains one
  additional contextual commit.
- Ruling: The 2026-08-26 spec supersedes only the side-by-side iPad clauses and
  BLE non-goal from the 2026-08-25 iPad spec — cost if wrong: collaborators may
  need a doc consolidation pass.
- Ruling: “One active host” is enforced by opt-in scanning and exhibition
  operating instructions, not cross-device automatic arbitration — cost if
  wrong: simultaneous manual enablement can still cause a connection race.

## Task progress

- Task 1: Ruling: The reviewer-confirmed stale-action firmware defect is real,
  but Task 1's binding purpose is to preserve the verified baseline unchanged;
  Task 5 must fix it before final verification — cost if wrong: the defect
  remains active until Task 5 and must block final completion if not removed.
- Task 1: minor (deferred to Task 5): declare/install Pillow or remove the clean
  asset-generation dependency ambiguity.
- Task 1: complete (commits `70e7bcc..6feef19`, review approved with the
  freshness finding explicitly carried into Task 5).
- Task 2: fix round 1/5 (1 addressed, 0 open — removed route-recovery and
  early-revealed guidance side rails; commit `91bdc1d`).
- Task 2: complete (commits `6feef19..91bdc1d`, scoped re-review clean).
- Task 3: carried failure: `ExhibitionLayoutUITests.swift:245` cannot find the
  error dismissal surface; reproduced alone after Task 2 and is owned by the
  RootView error-placement/accessibility requirement.
- Task 3 review-fix: added RED coverage for unknown maneuver instruction
  disclosure and default-launch error persistence; removed arbitrary fallback
  instruction rendering and stopped `requestLocationAccess()` from clearing
  unrelated errors. Clean focused evidence: 8 iPad UI tests and 7 iPhone 13
  UI tests passed in `.local-artifacts/task-3-review-green/`; logs are under
  `.omo/evidence/task-3-review/`. The earlier disk-interrupted iPhone run is
  excluded from authority. Commit: `3fcb68f`.
- Task 3: complete for review range `91bdc1d..3fcb68f`; no Task 4/BLE,
  controller, or firmware files changed.
- Task 5: complete for the firmware host/compile lane. Shared portable parser,
  session freshness, disconnect reset, four-action guards, UTF-8/40-byte
  validation, newline reassembly, ATT-safe event chunking, Korean display copy,
  and pinned Pillow setup are implemented. Final host evidence is 7 suites and
  58 assertions passed; final compile evidence is 83% flash and 9% RAM. No
  physical board upload, erase, or runtime PASS was claimed. Full evidence and
  owned-file list are in `task-5-report.md` and `.omo/evidence/task-5/`.
