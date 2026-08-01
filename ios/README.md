# Somewhere native field client

This directory is the contract-driven iOS 17+ client required by the approved blueprint. It is a native SwiftUI/Core Location surface; it does not embed the web application.

The checked-in bundle identifiers are intentionally non-production examples. Linux verification proves source/contract consistency only. It does **not** prove Xcode compilation, signing, simulator behavior, TestFlight distribution, or physical iPhone behavior.

`SOMEWHERE_API_ORIGIN` is deliberately `https://example.invalid` in the checked-in project. An authorized field build must override it with the canonical HTTPS service origin; source code rejects credentials, paths, query strings, fragments, non-HTTPS origins, and non-loopback HTTP.

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
