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

On an authorized macOS host with XcodeGen and Xcode:

```sh
xcodegen generate --spec ios/project.yml
xcodebuild -list -project ios/Somewhere.xcodeproj
xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max' \
  -only-testing:SomewhereTests \
  CODE_SIGNING_ALLOWED=NO
xcodebuild test \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max' \
  -only-testing:SomewhereUITests \
  CODE_SIGNING_ALLOWED=NO
xcodebuild archive \
  -project ios/Somewhere.xcodeproj \
  -scheme Somewhere \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$PWD/.local-artifacts/Somewhere.xcarchive" \
  CODE_SIGNING_ALLOWED=NO
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
