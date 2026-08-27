# SensorSpike iOS External Gate

This directory intentionally contains SwiftUI/Core Location source and a unit-test source only. It does **not** contain an Xcode project because this workspace is Windows and cannot truthfully generate or validate one.

Status of external gates:

- `SensorSpike.xcodeproj` creation: **BLOCKED** - requires macOS and Xcode.
- Simulator test result: **BLOCKED** - requires macOS, Xcode, and an installed iOS simulator runtime.
- Real iPhone field run: **BLOCKED** - requires a signed build on a physical iPhone and supervised field testing.

## Generate the Xcode project on macOS

1. Check out this repository on a Mac with Xcode installed and open Xcode.
2. Choose **File > New > Project > iOS > App**.
3. Set Product Name to `SensorSpike`, Interface to `SwiftUI`, Language to `Swift`, and minimum deployment to iOS 18.
4. Save the project at `ios/SensorSpike`, creating `ios/SensorSpike/SensorSpike.xcodeproj`, and include a unit-test target named `SensorSpikeTests`.
5. Select the `SensorSpike` app target, open **Signing & Capabilities**, and set its Bundle Identifier to exactly `com.rollthecompass.sensorspike`.
6. Add `SensorSpike/SensorSpikeApp.swift`, `SensorSpike/LocationHeadingModel.swift`, and `SensorSpike/ContentView.swift` to the `SensorSpike` target. Add `SensorSpikeTests/LocationHeadingModelTests.swift` to the `SensorSpikeTests` target.
7. In the app target's **Info** settings, add `NSLocationWhenInUseUsageDescription` with this exact value: `Roll the compass! uses location and heading only for this supervised sensor feasibility test.`
8. Confirm **Signing & Capabilities** has no Background Modes capability. This spike must not request background location.

## Run on macOS

From the repository root, first run the unit test against an installed simulator:

```sh
xcodebuild test -project ios/SensorSpike/SensorSpike.xcodeproj -scheme SensorSpike -destination 'platform=iOS Simulator,name=iPhone 16'
```

Then select a provisioned physical iPhone in Xcode, build and run `SensorSpike`, grant When In Use location permission, and complete `docs/research/ios_sensor_spike_protocol.md`. A simulator result is useful for build and unit-test feedback, but it does not satisfy the real-device sensor gate.
