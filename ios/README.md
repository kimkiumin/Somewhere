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
xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max'
```

Until the macOS command and later exact-device scenarios produce authority-bound receipts, the native blueprint track remains `BLOCK`.
