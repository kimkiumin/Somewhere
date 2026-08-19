# Native iOS collaboration and Mac development handoff

Status: operational runbook for the current `Roll the compass!` native app

This page is written for both human collaborators and coding agents. It explains
what to read, where the implementation lives, and how to reproduce the app on a
Mac. It cannot override the product authority described in
[`../README.md`](../README.md).

## Start here

Read in this order:

1. root [`AGENTS.md`](../../AGENTS.md);
2. documentation authority [`../README.md`](../README.md);
3. current native requirements
   [`../product/roll-the-compass-ios-requirements.md`](../product/roll-the-compass-ios-requirements.md);
4. native source/build reference [`../../ios/README.md`](../../ios/README.md);
5. this runbook;
6. [`ios-field-release.md`](ios-field-release.md) only for signing, TestFlight,
   or physical-device evidence.

Do not treat the frozen v0.1 prototype, v0.2 web app, old prompt packs, or an
isolated wireframe branch as current native authority.

## Branch and prototype relationship

- Native baseline: `codex/v2-macos-handoff` at `8fd64d4` before this review work.
- Current native review branch: `codex/roll-compass-native-app`.
- Collaborator visual prototype: `codex/roll-the-compass-visual`, currently
  represented by `prototype/vnext` at `0d96147`.

The visual prototype and V2 native implementation are isolated histories with
different directory and product boundaries. Do not merge the prototype branch
wholesale into V2: doing so removes the V2 iOS/backend tree. Port approved
interaction and visual decisions deliberately, then preserve native safety,
contract, and test boundaries.

## Implementation map

| Concern | Canonical location |
| --- | --- |
| App entry and launch arguments | `ios/Somewhere/App/SomewhereApp.swift` |
| Journey orchestration and UI state | `ios/Somewhere/Application/JourneyStore.swift` |
| Route/arrival guidance math | `ios/Somewhere/Domain/GuidanceEngine.swift`, `ArrivalGate.swift` |
| API contract adapter | `ios/Somewhere/Networking/APIJourneyService.swift` |
| Real and Debug sensor adapters | `ios/Somewhere/Platform/LocationController.swift`, `SimulatorHeadingReplay.swift` |
| Screen routing | `ios/Somewhere/UI/RootView.swift` |
| Launch/conditions/profile | `ConstraintView.swift`, `OnboardingView.swift`, `ProfileSettingsView.swift` |
| Active guidance | `CompassView.swift`, `SomewhereCompass.swift` |
| Arrival/reveal/recovery | `ArrivalView.swift`, `RevealView.swift`, `RecoveryView.swift` |
| Design tokens and assets | `SomewhereStyle.swift`, `ios/Somewhere/Resources/` |
| Project definition | `ios/project.yml` |
| Native tests | `ios/SomewhereTests/`, `ios/SomewhereUITests/` |
| GPS/local Worker QA | `scripts/ios/`, `scripts/release/local-v2-serve.sh` |

Edit `ios/project.yml`, not the generated `.xcodeproj`. Regenerate the project
after adding source, resource, or target files.

## Mac prerequisites

Verified development baseline:

- macOS with Xcode 26.6 selected by `xcode-select`;
- iOS 26.5 Simulator runtime;
- XcodeGen 2.42.0 or newer;
- Bun 1.3.14 and Node 24;
- Git and an authenticated GitHub account.

Check the machine before changing code:

```sh
xcode-select -p
xcodebuild -version
xcrun simctl list runtimes
xcodegen --version
bun --version
node --version
```

Expected repository versions are Bun `1.3.14`, Node `v24.x`, Swift 6, and an
iOS 17 minimum deployment target. A newer Xcode/SDK is valid local evidence but
must be recorded because it is not byte-identical to an older CI build.

## Clean-clone setup

```sh
gh repo clone kimkiumin/Somewhere Somewhere
cd Somewhere
git fetch origin
git switch --track origin/codex/roll-compass-native-app
bun install --frozen-lockfile
xcodegen generate --spec ios/project.yml
xcodebuild -list -project ios/Somewhere.xcodeproj
open ios/Somewhere.xcodeproj
```

If the review branch has not been published yet, use
`origin/codex/v2-macos-handoff` and apply the reviewed changes separately.

In Xcode, choose the shared `Somewhere` scheme, select an installed iPhone
Simulator, and press Run. Simulator builds do not require an Apple signing team.

## Fast UI/demo workflow without a backend

The checked-in `https://example.invalid` origin intentionally prevents a fake
production connection. To inspect a deterministic screen, open
**Product → Scheme → Edit Scheme → Run → Arguments** and add separate arguments:

```text
--ui-test-state
following
--ui-test-credible-guidance
--ui-test-no-notifications
```

Useful states include `following`, `arrived-rich`, `paused`, `stopped`,
`route-recovery`, and `expired`. Remove the arguments before checking the normal
launch flow. These modes compile only into Debug behavior and are not a field or
release result.

With XcodeBuildMCP, first inspect session defaults, then use:

```json
{
  "launchArgs": ["--ui-test-state", "following", "--ui-test-credible-guidance", "--ui-test-no-notifications"],
  "extraArgs": ["CODE_SIGNING_ALLOWED=NO", "SOMEWHERE_API_ORIGIN=https://example.invalid"]
}
```

## Simulator build and automated tests

```sh
xcodegen generate --spec ios/project.yml

xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO \
  SOMEWHERE_API_ORIGIN=https://example.invalid
```

If that simulator name is unavailable, choose an available device in
`xcrun simctl list devices available` and substitute its name or UDID.

## Real local Worker and virtual GPS

Use this when the request must cross the real session/journey API instead of a
deterministic launch state.

Terminal A:

```sh
bash scripts/release/local-v2-start-for-qa.sh
```

Terminal B:

```sh
node scripts/ios/local-ios-loopback-proxy.mjs
```

In **Product → Scheme → Edit Scheme → Test → Arguments**, add the environment
variable `SOMEWHERE_RUN_LOCAL_E2E=1` for this run. Then build the app with the
loopback-only Simulator origin:

```sh
xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SomewhereUITests/VirtualFieldFlowUITests \
  CODE_SIGNING_ALLOWED=NO \
  SOMEWHERE_API_ORIGIN=http://127.0.0.1:8788
```

An AI agent using XcodeBuildMCP should pass
`testRunnerEnv: {"SOMEWHERE_RUN_LOCAL_E2E":"1"}` instead of editing the
scheme. The API origin is still an app build setting and must be supplied in
`extraArgs`; setting only the test-runner environment is insufficient.

The two tests cover a real one-tap session/commit, off-route suppression and
recovery, multi-sample arrival, and automatic reveal. The proxy is loopback-only
and exists solely to adapt the local development cookie; never use it as a field
or production origin.

For manual movement after the app enters `following`:

```sh
node scripts/ios/simulate-ios-route.mjs \
  --udid <simulator-udid> \
  --candidate restaurant \
  --speed 8 \
  --interval 1 \
  --dwell 16
```

Launch the Debug app with `--simulator-heading-from-course` because Simulator
does not provide magnetometer heading. Release builds never use this fallback.

## Running on a connected iPhone

1. Connect the iPhone, trust the Mac, and enable Developer Mode on the phone.
2. In Xcode Signing & Capabilities, choose the owner's approved Team and a
   unique bundle identifier. Do not commit personal team IDs.
3. Select the connected iPhone as the run destination.
4. Build with an owner-approved HTTPS API origin reachable by the phone.
   `127.0.0.1` points to the phone itself and cannot reach the Mac Worker.
5. Accept the location permission in context and keep the app foregrounded.

A free Personal Team can install a development build on an owned phone for
short-lived testing, subject to Apple's current account/device limits. It does
not provide TestFlight or production distribution. Another collaborator should
sign with their own authorized team or use an owner-provided TestFlight build;
never share certificates or private keys through Git.

The exact command-line signing and Debug field-replay commands are maintained in
[`../../ios/README.md`](../../ios/README.md). The evidence requirements are in
[`ios-field-release.md`](ios-field-release.md).

## Repository verification before handoff

Run from the repository root:

```sh
bun run test:app
bun run test:server
bun run test:contracts
bun run typecheck
bun run lint
bun run verify:blueprint
bun run verify:release-authority
bun audit
git diff --check
```

Run the native Xcode tests on macOS as shown above. `verify:release` contains
Linux-specific operational gates and should run in the repository's Ubuntu CI,
not be treated as a Mac prerequisite.

## Contribution rules for humans and agents

- Preserve hidden destination identity before the allowed reveal path.
- Never add a map, candidate list, Reroll, direct-destination bearing fallback,
  or background-navigation promise without a newer owner decision.
- Keep Release sensor behavior real; deterministic movement and heading stay
  Debug-only.
- Keep API, domain math, orchestration, and SwiftUI view responsibilities in
  their existing layers.
- Add a regression test before changing journey transitions, sensor confidence,
  disclosure, or arrival behavior.
- Do not commit `.xcodeproj`, DerivedData, archives, result bundles, credentials,
  signing files, raw field traces, or `demo-artifacts/`.
- Do not merge the isolated visual prototype branch wholesale.
- Update the native requirements when an owner decision changes visible product
  behavior; update this runbook when the build/test procedure changes.

## Copyable AI handoff context

```text
You are working on the native iPhone app for Roll the compass! in the Somewhere
repository. Read AGENTS.md, docs/README.md,
docs/product/roll-the-compass-ios-requirements.md, ios/README.md, and
docs/operations/native-ios-collaboration-handoff.md in that order. Treat the
v0.1 prototype and v0.2 web app as historical evidence. Preserve the native
SwiftUI/Core Location architecture, hidden-destination boundary, immediate Stop,
multi-sample arrival, and Debug/Release sensor separation. Edit ios/project.yml,
not the generated Xcode project. Do not merge the isolated visual prototype
branch wholesale. Run the relevant Bun tests and Xcode Simulator tests before
claiming completion, and report external signing/field/legal gates separately.
```

## End-of-session handoff

Record the branch, commit, Xcode version, Simulator/runtime, tests run, and any
external blocker. Leave the tree free of generated projects and private evidence,
push to a review branch, and use a Draft PR as the shared context record.
