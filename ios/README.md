# Roll the compass! native field client

This directory is the contract-driven iOS 17+ client required by the approved blueprint. It is a native SwiftUI/Core Location surface; it does not embed the web application. `Roll the compass!` is the public app name; `Somewhere` remains the internal Xcode target and API namespace.

The current visual system uses the owner-approved vNext `RollCompassShell` and
independently animated `RollCompassNeedle` assets in
`Somewhere/Resources/Assets.xcassets`.
The opaque `RollCompassAppIcon` set is packaged for device and Simulator builds.
The wordmark uses the checked-in OFL-licensed `UnifrakturCook-Bold.ttf` font.
The same shell is reused as the native visual anchor on launch, active guidance,
route recovery, arrival, feedback, and no-fit states. Active guidance alone may
show the red needle; paused or direction-unavailable states deliberately show
the shell without a needle. This is a presentation rule only and does not alter
the V2 journey, selection, or server contracts.

Before changing the current interface, read the
[native product requirements](../docs/product/roll-the-compass-ios-requirements.md).
For a clean-clone Mac/Xcode walkthrough and collaborator/AI handoff, use the
[native collaboration runbook](../docs/operations/native-ios-collaboration-handoff.md).
Windows contributors should instead begin with the
[Windows collaboration handoff](../docs/operations/windows-collaboration-handoff.md),
which defines the platform-neutral source checks and the required Mac follow-up.

The checked-in bundle identifiers are intentionally non-production examples. Linux verification proves source/contract consistency only. It does **not** prove Xcode compilation, signing, simulator behavior, TestFlight distribution, or physical iPhone behavior.

`SOMEWHERE_API_ORIGIN` is deliberately `https://example.invalid` in the checked-in project. An authorized field build must override it with the canonical HTTPS service origin; source code rejects credentials, paths, query strings, fragments, non-HTTPS origins, and non-loopback HTTP.

### Physical compass companion

The native app can connect to the Waveshare ESP32-S3-Touch-LCD-2.1 companion
over CoreBluetooth. The iPhone remains authoritative for location, heading,
route guidance, destination disclosure, and guarded journey actions. USB is
only for board flashing and serial logs; Wi-Fi is reserved for a later
OTA/diagnostics milestone.

The app requests `NSBluetoothAlwaysUsageDescription` at runtime and scans for
the fixed `Roll Compass` BLE service. It intentionally does not declare
`bluetooth-central`, so this milestone makes no background or locked-screen
navigation promise. The Simulator can exercise the contract and tests but
cannot prove physical BLE hardware interaction.

See the [physical BLE operations runbook](../docs/operations/physical-compass-ble.md)
for pinned dependencies, USB commands, UUIDs, first connection, stale-state
behavior, and board limitations.

## Verification

On Ubuntu:

```sh
bun test scripts/ios/validate-ios-source.test.mjs
bun scripts/ios/validate-ios-source.mjs
bun test scripts/ios/validate-ios-field-flow.test.mjs
bun scripts/ios/validate-ios-field-flow.mjs
```

On an authorized macOS host, XcodeGen 2.42.0 is the hosted-CI source/version
parity baseline.
Build that exact version from the same pinned source commit in a temporary
directory. A locally installed XcodeGen 2.42.0 or newer also satisfies the
project's minimum-version rule, but is different build evidence.

```sh
export XCODEGEN_SHA=82c6ab9bbd5b6075fc0887d897733fc0c4ffc9ab
export XCODEGEN_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/somewhere-xcodegen.XXXXXX")"
git init "$XCODEGEN_ROOT"
git -C "$XCODEGEN_ROOT" remote add origin https://github.com/yonaskolb/XcodeGen.git
git -C "$XCODEGEN_ROOT" fetch --depth 1 origin "$XCODEGEN_SHA"
git -C "$XCODEGEN_ROOT" checkout --detach FETCH_HEAD
swift build --package-path "$XCODEGEN_ROOT" -c release
export XCODEGEN_BIN="$XCODEGEN_ROOT/.build/release/xcodegen"
"$XCODEGEN_BIN" --version | grep '2.42.0'
```

The checked-in default origin is safe only for buildability. Keep it for an
offline source check, or export the owner-approved canonical HTTPS origin before
a network-backed simulator or field build. The validator rejects credentials,
paths, queries, fragments, and non-HTTPS origins.

```sh
export SOMEWHERE_API_ORIGIN="${SOMEWHERE_API_ORIGIN:-https://example.invalid}"
bun scripts/release/validate-https-origin.mjs --origin "$SOMEWHERE_API_ORIGIN"
```

Generate and verify the project in the same shell so the pinned binary and
validated origin remain bound to every command:

```sh
"${XCODEGEN_BIN:-xcodegen}" generate --spec ios/project.yml
xcodebuild -list -project ios/Somewhere.xcodeproj
xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max' \
  -only-testing:SomewhereTests \
  CODE_SIGNING_ALLOWED=NO \
  SOMEWHERE_API_ORIGIN="$SOMEWHERE_API_ORIGIN"
xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max' \
  -only-testing:SomewhereUITests \
  CODE_SIGNING_ALLOWED=NO \
  SOMEWHERE_API_ORIGIN="$SOMEWHERE_API_ORIGIN"
xcodebuild archive \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$PWD/.local-artifacts/Somewhere.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  SOMEWHERE_API_ORIGIN="$SOMEWHERE_API_ORIGIN"
```

## Simulator test harness and local Worker

The Debug app has deterministic launch-only states so the hidden destination
flow can be inspected without waiting for GPS, route expiry, or a real venue.
Pass `--ui-test-no-notifications` to suppress delayed-feedback scheduling while
manually inspecting a screen. The supported `--ui-test-state` values are:

```text
following, following-next-step, following-revealed, arrived-unrevealed, arrived-revealed, paused,
stopped, stopped-revealed, completed, completed-revealed, route-recovery,
arrived-rich, expired
```

Add `--ui-test-credible-guidance` to a following/near state to inject a stable
420 m, 315° guidance reading. It drives the same separately animated needle and
distance presentation as a live credible sensor reading without changing the
Release build.

The active `following` and `near` guidance surface is intentionally a single
non-scrolling viewport: a short bearing-derived direction cue, the shared
compass, remaining distance, safety note, and fixed outline `멈춤` action. The
summary icon and needle both derive from the same credible bearing, so they must
not claim conflicting directions.

The native vNext surface also includes first-use onboarding, dietary/allergy
profile pickers, party size, walking-time and budget controls, minimal/private
disclosure, explicit reveal reasons, stop reasons with Skip, guarded recovery
review, no-fit condition review, external-map handoff warning, and arrival
detail fallback fields. These screens are exercised by `JourneyFlowUITests`;
the prototype-only control panel is intentionally not shipped in the app.

### Virtual field route replay

Apple's iOS Simulator can replay Core Location movement, but it has no
magnetometer and therefore cannot produce `CLHeading`. For an end-to-end
Debug-only route run, launch the app with
`--simulator-heading-from-course`; the test-only adapter derives a temporary
heading from consecutive simulated locations. The production/Release path
never uses movement course as a device-facing heading substitute.

With the app in the real local Worker `following` state, replay one of the
reviewed Seoul Forest routes:

```sh
node scripts/ios/simulate-ios-route.mjs \
  --udid 4A1D0101-F286-4584-A2D5-ADA691A7F0CE \
  --candidate restaurant \
  --speed 8 \
  --interval 1 \
  --dwell 16
```

The runner reads the checked-in route geometry, interpolates location updates,
holds the endpoint long enough for the four-sample/12-second arrival gate, and
leaves the endpoint active for inspection. Use `--scenario off-route` to move
120 metres outside the corridor before returning to the reviewed route. This
runner is a local QA tool only; it is not bundled into the app or production
deployment.

With XcodeBuildMCP, use `build_run_sim` with for example:

```json
{
  "launchArgs": ["--ui-test-state", "following", "--ui-test-no-notifications"],
  "extraArgs": ["CODE_SIGNING_ALLOWED=NO", "SOMEWHERE_API_ORIGIN=https://example.invalid"]
}
```

The normal UI test target exercises these projections automatically. For a
real local Worker journey, build `app/dist`, apply the local D1 migrations,
start the local Worker on `127.0.0.1:8787`, and run the loopback-only cookie
adapter in a second terminal. The macOS-compatible helper is:

```sh
bash scripts/release/local-v2-start-for-qa.sh
```

Or run the two processes separately:

```sh
node scripts/ios/local-ios-loopback-proxy.mjs
```

The proxy defaults to the self-signed HTTPS Worker produced by
`local-v2-serve.sh`. If Wrangler was started without HTTPS, set
`SOMEWHERE_UPSTREAM_PROTOCOL=http` for the proxy process.

Build the Simulator app with
`SOMEWHERE_API_ORIGIN=http://127.0.0.1:8788`, then grant and inject the Seoul
Forest origin before launching:

```sh
xcrun simctl privacy 4A1D0101-F286-4584-A2D5-ADA691A7F0CE grant location example.somewhere.field
xcrun simctl location 4A1D0101-F286-4584-A2D5-ADA691A7F0CE set 37.54385,127.03695
```

For the repeatable local Worker UI run, keep that build setting on the app
target and opt the two network-backed tests in with the test-runner variable:

```text
session_set_defaults:
  configuration: Debug
  extraArgs: ["SOMEWHERE_API_ORIGIN=http://127.0.0.1:8788"]
test_sim:
  testRunnerEnv: {"SOMEWHERE_RUN_LOCAL_E2E": "1"}
```

The test runner then verifies the real request sequence
`session → one-tap journey/commit → arrival with automatic reveal`; the
off-route scenario also verifies guidance suppression and recovery. A test-runner environment variable
alone is not sufficient because the app's API origin is compiled into its
Info.plist.

This lets the Simulator exercise `start → following → arrival → automatic reveal`
plus `stop request/confirm` against the real Worker fixture. The adapter exists
only because the local HTTP server cannot legitimately set the production
`__Host-...; Secure` cookie; it is not part of the production path.

### Connected iPhone Debug field replay

Core Device and iPhone Mirroring do not provide a supported arbitrary-GPS
setter for a physical iPhone. The Debug app therefore has a separate,
launch-argument-only Seoul Forest route replay for supervised QA. It is behind
`#if DEBUG`, never starts in Release, and does not replace the production
Core Location adapter.

Build and install an authorized Debug app with a reachable HTTPS Worker origin,
then launch it with the replay flag:

```sh
xcodebuild \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -configuration Debug \
  -destination 'id=<physical-device-udid>' \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" \
  SOMEWHERE_API_ORIGIN="$SOMEWHERE_API_ORIGIN" \
  build

xcrun devicectl device install app \
  --device <physical-device-udid> \
  "<derived-data-path>/Build/Products/Debug-iphoneos/Somewhere.app"

xcrun devicectl device process launch \
  --device <physical-device-udid> \
  --terminate-existing \
  example.somewhere.field \
  --physical-field-route-replay \
  --ui-test-no-notifications
```

The replay starts at the Seoul Forest main-gate fixture, follows the reviewed
Seongsu restaurant route, holds the endpoint for the four-sample arrival gate, and
automatically reveals the destination after a credible arrival. Use iPhone
Mirroring or the phone itself to start from the launch compass and observe the
live direction/distance guidance; use `멈춤` if you need to reveal early.

If Xcode reports that the named destination does not exist, create an
`iPhone 15 Pro Max` simulator once in **Xcode → Window → Devices and
Simulators** with an installed iOS runtime, then rerun the commands. Hosted CI
does this automatically and addresses the created simulator by UDID, so it does
not depend on the runner's preinstalled device list.

Until the macOS command and later exact-device scenarios produce authority-bound receipts, the native blueprint track remains `BLOCK`.

For a clean Mac checkout and context-loading order, use the
[non-authoritative macOS handoff](../docs/operations/macos-ios-handoff.md). For
signing, TestFlight, and physical iPhone evidence, use the
[native field and distribution runbook](../docs/operations/ios-field-release.md).
