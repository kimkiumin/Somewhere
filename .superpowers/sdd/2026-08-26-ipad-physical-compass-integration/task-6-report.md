# Task 6 report — app-only final verification and collaborator handoff

Date: 2026-08-26

Branch: `codex/ipad-board-integration`

Verified implementation HEAD: `b609d022f57636fb72f58dc17f28a5fa978b33d3`

## Scope boundary

This task verifies the iOS app and its existing web/backend contracts. The
round-LCD firmware is owned by another session and was not changed, compiled,
uploaded, or claimed as physically verified here. The app-side dependency is
kept: explicit CoreBluetooth host opt-in, BLE v1 framing, safe hidden-state
projection, delivered-sequence authority, lifecycle reset, and one-host
operating copy.

## Product and layout outcome

- The collaborator-approved antique/pirate compass artwork, red needle, warm
  paper palette, and `Roll the compass!` identity remain the visual authority.
- iPad Pro 11-inch (2nd generation) portrait uses a proportional full-width
  composition rather than a small centered phone card. Direction, compass,
  remaining information, and Stop remain vertically ordered.
- The launch and active journey surfaces do not use scroll navigation. The
  compact constraints/settings surfaces may scroll only where their secondary
  controls or accessibility text size require it.
- iPhone 13 keeps the compact composition and first-viewport Stop behavior.
- The needle and compass remain contained, destination identity stays hidden
  before reveal, and Stop/back/safety controls remain directly reachable.
- Dietary/allergy choices stay in settings; journey conditions expose the
  restaurant-only flow and budget slider requested by the collaborator.

## App-side physical-compass contract

- CoreBluetooth remains dormant until the user enables `물리 나침반 연결`.
- The settings surface says that only one nearby iPad or iPhone should act as
  host and reports deterministic disconnected/scanning/connecting/connected
  states.
- Release builds instantiate the real Bluetooth controller; UI-test board
  state injection remains DEBUG-only.
- Board input is accepted only for the latest state actually delivered in the
  current connection epoch and only while the current journey still authorizes
  that action.
- Disconnect, stop, backgrounding, expiry, and replacement clear authority so
  an old board event cannot control a new journey.

## Native verification

Target runtimes were iOS 26.5 simulators generated from the tracked XcodeGen
project source.

| Lane | Result | Evidence |
| --- | ---: | --- |
| iPad Pro 11-inch (2nd generation) native units | 68/68 pass | `.local-artifacts/task-6-review-final/ipad-units-final.xcresult` |
| iPad exhibition layouts | 10/10 scenarios pass | 9 pass in `final-ipad-exhibition-ui.xcresult`; the single missed-tap scenario passed in `ipad-final-polish/.local-artifacts/task-6/conditions-tap-retry.xcresult` |
| iPad journey flow | 41/41 pass | `final-ipad-journey-a/b/c.xcresult` |
| iPhone 13 app matrix | 8/8 pass | `.local-artifacts/task-6-review-final/iphone13-app-ui.xcresult` |
| iOS source/field gate | 34/34 pass | 35 unit and 42 UI scenarios declared |
| iOS Release simulator build | PASS | XcodeBuildMCP Release build on `Somewhere iPhone 13` |

The iPhone conditions test first recorded one intermittent XCUITest tap miss,
then passed alone. Commit `58f17a7` applies the existing central-coordinate
fallback used by the iPad capture suite; the full seven-test iPhone matrix then
passed in one run.

The app was also built, installed, and launched as a normal process on the
`Somewhere iPhone 13` simulator. Runtime inspection found four launch targets
and zero launch-surface scroll areas; the conditions link opened the budget
surface and exposed its explicit back control.

The final app review added regression coverage for three lifecycle/layout
boundaries: automatic arrival retries after a failed request, a new journey ID
receives an independent arrival gate, and backgrounding suppresses stale
guidance while invalidating the previously delivered board authority. Safety
reveal now uses a compact name/address card on iPhone and iPad, keeping the
compass composition and Stop in one non-scrolling viewport.

## Web, backend, and release regression

- App unit tests: 183/183 pass.
- Server tests: 238/238 pass.
- Contract tests: 15/15 pass.
- General Playwright E2E: 34 pass, 3 intentional WebKit automation skips.
- Real local Worker E2E: 5/5 pass across Chromium and WebKit handshake before
  the reviewed route capability expired.
- Blueprint executable gates: 31 study + 22 completion + 34 iOS + 14 native
  evidence tests pass.
- TypeScript typecheck and Biome lint pass. Biome reports only nine existing
  informational `useLiteralKeys` notices in server files.
- Public-release authority verifier tests: 8/8 pass.
- External production diagnostic build: PASS, 17 artifacts,
  `buildDigest=sha256:a9669ed1dbf0807d6f01cf715550ae01900138b9a1c604580da7e9a69903ac75`,
  and zero external writes.

Commit `7c026bc` resets the local Worker's temporary `+1 hour` feedback clock
after the feedback scenario. Without the reset, later tests could observe the
field route as expired and incorrectly fail with `no_fit`.

## Important operational block

The checked-in Seoul Forest restaurant route capability expired at
`2026-08-26T06:00:00Z` (`2026-08-26 15:00 KST`). The venue, evidence, and
rights fixtures expire at `2026-08-27T06:00:00Z`. These dates were not extended
because doing so would falsely claim a new field/rights review. After expiry,
the real backend is expected to fail closed with `no_fit` until an authorized
reviewer renews the route and provider evidence. This is the immediate external
dependency for a live exhibition build; the deterministic native UI harness is
not affected.

## Collaborator reproduction

```sh
git switch codex/ipad-board-integration
bun install
xcodegen generate --spec ios/project.yml
bun run verify:ios-source
bun run test:e2e
open ios/Somewhere.xcodeproj
```

Run `bun run test:e2e:v2` only after an authorized reviewer renews the expired
route capability; the real Worker correctly fails closed with `no_fit` in the
current repository state.

In Xcode, select the `Somewhere` scheme and either iPhone 13 or iPad Pro
11-inch (2nd generation). A real installation still requires the collaborator's
Apple Development team/signing, an explicit reachable `SOMEWHERE_API_ORIGIN`,
location permission, and current field-authority data. Enable the physical
compass host on only one Apple device when the separate hardware session is
ready.

## Honest remaining limits

- No physical iPhone 13 or physical iPad installation/signing was performed in
  this final simulator run.
- No real board pairing or round-LCD behavior is claimed in this app-only task.
- TestFlight/App Store signing, Cloudflare production secrets/domain,
  provider-rights/Korean-legal authority, live field route renewal, and signed
  release evidence remain external.
- The Linux-only operations release lane still requires its supported runner;
  its application-level Task 14 tests passed 60/60, then the macOS host recorded
  the expected legal-authority BLOCK and five cleanup-harness failures caused
  by missing Linux `setsid` and BSD `realpath` lacking `-e`. Simulator, app,
  web, server, contract, source, and diagnostic production gates above are
  independently green.
