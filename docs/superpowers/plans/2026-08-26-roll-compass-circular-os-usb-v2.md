# Roll Compass Circular OS + USB Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship and flash a visually centered circular Roll Compass OS that uses BLE contract v2 and can prove independent board-rotation behavior through deterministic USB heading simulation before the external magnetometer is installed.

**Architecture:** The iPhone sends a true-north route target and magnetic declination while the board reduces BLE freshness, simulated orientation, and journey phase into one render model. Host-testable C++ owns angle math, spring motion, circular layout, runtime reduction, and diagnostic parsing; LVGL only renders that model. Generated assets use a full-screen shell, a tightly cropped needle with emitted pivot metadata, and reproducible wordmark/Korean font subsets.

**Tech Stack:** Swift 6, Core Location, CoreBluetooth, XCTest, Arduino ESP32 core 3.3.11, C++17 host tests, LVGL 8.4.0, ESP32_Display_Panel 1.0.4, ArduinoJson 7.4.3, Python 3 + Pillow, Bun 1.3.14, lv_font_conv 1.5.3.

**Spec:** `docs/superpowers/specs/2026-08-26-roll-compass-independent-heading-os-design.md`

## Global Constraints

- The iPhone remains authoritative for GPS, trusted route, target bearing, distance, journey state, guarded actions, and server mutations.
- The board never receives or renders destination name, address, photo, review, or rating before reveal.
- BLE is the runtime journey transport; USB is limited to flashing, logs, and deterministic local diagnostics.
- Wi-Fi remains disabled in the journey path.
- BLE frames remain newline-delimited UTF-8 JSON with a maximum size of 512 bytes.
- BLE service and characteristic UUIDs remain `C1F8A100-35D1-4C53-9A03-7A1B3E620001`, `C1F8A101-35D1-4C53-9A03-7A1B3E620001`, and `C1F8A102-35D1-4C53-9A03-7A1B3E620001`.
- Contract v2 strictly rejects contract v1 guidance instead of reusing its phone-relative arrow.
- Display center is exactly `(240, 240)`; essential and interactive rectangle corners fit within radius `214`; only decorative art may reach radius `240`.
- The normal journey surface shows one centered action; paused confirmation may show exactly two vertically arranged actions.
- The current target board is `esp32:esp32:waveshare_esp32_s3_touch_lcd_21` with 16 MB flash and 8 MB PSRAM.
- No background or locked-screen navigation promise is added.

## File structure

- `ios/Somewhere/Domain/CompassAngles.swift`: shared north/angle normalization.
- `ios/Somewhere/Domain/GuidanceEngine.swift`: produces both iPhone-relative arrow and true-north route target.
- `ios/Somewhere/Platform/LocationController.swift`: derives signed magnetic declination from a valid Core Location sample.
- `ios/Somewhere/Platform/PhysicalCompassWire.swift`: BLE v2 snapshot and framing.
- `ios/Somewhere/Application/JourneyStore.swift`: maps credible guidance into the board snapshot.
- `firmware/roll-compass-board/compass_math.{h,cpp}`: host-testable angle calculations.
- `firmware/roll-compass-board/needle_spring.{h,cpp}`: fixed-step shortest-path spring.
- `firmware/roll-compass-board/compass_runtime.{h,cpp}`: one-state Roll Compass OS reducer.
- `firmware/roll-compass-board/compass_layout.h`: shared circular-safe geometry.
- `firmware/roll-compass-board/compass_diagnostics.{h,cpp}`: pure USB command parser and simulated inputs.
- `firmware/roll-compass-board/physical_compass_wire.{h,cpp}`: strict board-side BLE v2 parsing.
- `firmware/roll-compass-board/display_ui.{h,cpp}`: LVGL view of `CompassRenderModel`.
- `firmware/roll-compass-board/roll-compass-board.ino`: BLE, serial diagnostics, runtime orchestration, and display handoff.
- `firmware/roll-compass-board/tests/compass_core_test.cpp`: native C++ test executable.
- `scripts/firmware/test-board-core.sh`: native C++ test runner.
- `scripts/firmware/fetch-board-fonts.sh`: pinned Noto Sans KR acquisition and checksum verification.
- `scripts/firmware/generate-compass-assets.py`: shell/needle/pivot generation.
- `scripts/firmware/generate-board-fonts.sh`: LVGL font subset generation.
- `scripts/firmware/generate-board-assets.sh`: reproducible asset orchestration.
- `scripts/firmware/validate-generated-assets.py`: generated-asset assertions.

---

### Task 1: Move the iPhone/board wire model to north-referenced BLE v2

**Files:**
- Create: `ios/Somewhere/Domain/CompassAngles.swift`
- Modify: `ios/Somewhere/Domain/GuidanceEngine.swift`
- Modify: `ios/Somewhere/Platform/LocationController.swift`
- Modify: `ios/Somewhere/Platform/PhysicalCompassWire.swift`
- Modify: `ios/Somewhere/Application/JourneyStore.swift`
- Modify: `ios/SomewhereTests/GuidanceEngineTests.swift`
- Modify: `ios/SomewhereTests/PhysicalCompassWireTests.swift`
- Modify: `ios/SomewhereTests/JourneyStoreTests.swift`

**Interfaces:**
- Produces: `CompassAngles.normalize(_:) -> Double` and `CompassAngles.signedDelta(from:to:) -> Double`.
- Produces: `GuidanceReading.targetTrueBearingDegrees: Double` while preserving `GuidanceReading.arrowDegrees` for the iPhone UI.
- Produces: `PhysicalCompassSnapshot.targetTrueBearingDegrees: Double?` and `magneticDeclinationDegreesEast: Double?`.
- Produces: state keys `tb` and `md` with `PhysicalCompassBLE.contractVersion == 2`.

- [ ] **Step 1: Add failing angle, route-target, and BLE v2 tests**

Add these focused assertions:

```swift
func testSignedAngleDeltaWrapsAcrossNorth() {
    XCTAssertEqual(CompassAngles.normalize(-1), 359, accuracy: 0.0001)
    XCTAssertEqual(CompassAngles.signedDelta(from: 359, to: 1), 2, accuracy: 0.0001)
    XCTAssertEqual(CompassAngles.signedDelta(from: 1, to: 359), -2, accuracy: 0.0001)
}

func testCredibleGuidanceCarriesAbsoluteRouteTarget() throws {
    let reading = try XCTUnwrap(credibleGuidanceReading())
    XCTAssertGreaterThanOrEqual(reading.targetTrueBearingDegrees, 0)
    XCTAssertLessThan(reading.targetTrueBearingDegrees, 360)
}

func testCredibleStateUsesNorthReferencedV2Fields() throws {
    let snapshot = try makeSnapshot(
        targetTrueBearingDegrees: 315,
        magneticDeclinationDegreesEast: -8.2
    )
    let json = String(decoding: try PhysicalCompassWire.encodeState(snapshot), as: UTF8.self)
    XCTAssertTrue(json.contains("\"v\":2"))
    XCTAssertTrue(json.contains("\"tb\":315"))
    XCTAssertTrue(json.contains("\"md\":-8.2"))
    XCTAssertFalse(json.contains("\"b\":"))
}

func testDirectionFieldsMustAppearTogether() {
    XCTAssertThrowsError(try makeSnapshot(
        targetTrueBearingDegrees: 315,
        magneticDeclinationDegreesEast: nil
    ))
}
```

Extend the `JourneyStore` physical-compass fake to retain sent snapshots, then assert that a credible guidance update sends both v2 direction values and a suppressed update sends neither.

- [ ] **Step 2: Run the focused iOS tests and verify they fail**

Run:

```bash
bash scripts/firmware/generate-ios-project.sh
xcodebuild -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test -only-testing:SomewhereTests/GuidanceEngineTests -only-testing:SomewhereTests/PhysicalCompassWireTests -only-testing:SomewhereTests/JourneyStoreTests
```

Expected: compilation fails because the angle helper, target bearing, and v2 snapshot fields do not exist.

- [ ] **Step 3: Add shared angle math and expose the true route target**

Create `CompassAngles.swift`:

```swift
import Foundation

enum CompassAngles {
    static func normalize(_ degrees: Double) -> Double {
        let remainder = degrees.truncatingRemainder(dividingBy: 360)
        return remainder >= 0 ? remainder : remainder + 360
    }

    static func signedDelta(from: Double, to: Double) -> Double {
        let raw = normalize(to) - normalize(from)
        if raw > 180 { return raw - 360 }
        if raw < -180 { return raw + 360 }
        return raw
    }
}
```

In `GuidanceEngine.update`, retain the existing smoothed phone arrow and add the unsmoothed target:

```swift
let rawArrowDegrees = CompassAngles.normalize(targetBearing - headingDegrees)
let arrowDegrees = smoothedArrow(previous: previousArrowDegrees, next: rawArrowDegrees, maximumStepDegrees: 45)
return .credible(GuidanceReading(
    arrowDegrees: arrowDegrees,
    targetTrueBearingDegrees: targetBearing,
    remainingM: max(0, totalM - projection.progressM),
    endpointDistanceM: endpointDistanceM,
    finalCorridorDeviationM: finalProjection.deviationM,
    routeProgressIsCredible: true
))
```

Replace private normalization uses in `GuidanceEngine.swift` with `CompassAngles.normalize` and remove the duplicate helper.

- [ ] **Step 4: Derive declination from one valid Core Location sample**

In `didUpdateHeading`, populate the existing field without inventing a value when true heading is unavailable:

```swift
let trueHeading = value.trueHeading >= 0 ? value.trueHeading : nil
let declination = trueHeading.map {
    CompassAngles.signedDelta(from: value.magneticHeading, to: $0)
}
heading = HeadingSample(
    trueHeadingDegrees: trueHeading,
    magneticHeadingDegrees: value.magneticHeading,
    magneticDeclinationDegreesEast: declination,
    accuracyDegrees: value.headingAccuracy,
    capturedAt: value.timestamp
)
```

- [ ] **Step 5: Encode strict paired `tb`/`md` fields at contract version 2**

Change the snapshot initializer guard to:

```swift
let hasTarget = targetTrueBearingDegrees != nil
let hasDeclination = magneticDeclinationDegreesEast != nil
guard hasTarget == hasDeclination else { throw PhysicalCompassWireError.invalidPayload }
if let targetTrueBearingDegrees,
   (!targetTrueBearingDegrees.isFinite || !(0..<360).contains(targetTrueBearingDegrees)) {
    throw PhysicalCompassWireError.invalidNumber
}
if let magneticDeclinationDegreesEast,
   (!magneticDeclinationDegreesEast.isFinite || !(-180...180).contains(magneticDeclinationDegreesEast)) {
    throw PhysicalCompassWireError.invalidNumber
}
```

Use these coding keys:

```swift
case targetTrueBearingDegrees = "tb"
case magneticDeclinationDegreesEast = "md"
```

Set `PhysicalCompassBLE.contractVersion = 2`. In `JourneyStore.syncPhysicalCompass`, include direction only when guidance is credible and the latest heading has a valid declination; otherwise preserve distance but send both direction fields as `nil`. When guidance is credible but declination is unavailable, use `GuidanceSuppression.invalidHeading.rawValue` as confidence. Update the unknown event-version test fixture from `v:2` to `v:3`, because event frames now also use contract version 2.

- [ ] **Step 6: Run all iOS unit and source-contract tests**

Run:

```bash
xcodebuild -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test -only-testing:SomewhereTests
bun run verify:ios-source
```

Expected: all `SomewhereTests` and iOS source gates pass; encoded credible frames contain `v:2`, `tb`, and `md` and remain at or below 512 bytes.

- [ ] **Step 7: Commit the iOS v2 contract**

```bash
git add ios/Somewhere/Domain/CompassAngles.swift ios/Somewhere/Domain/GuidanceEngine.swift ios/Somewhere/Platform/LocationController.swift ios/Somewhere/Platform/PhysicalCompassWire.swift ios/Somewhere/Application/JourneyStore.swift ios/SomewhereTests/GuidanceEngineTests.swift ios/SomewhereTests/PhysicalCompassWireTests.swift ios/SomewhereTests/JourneyStoreTests.swift ios/Somewhere.xcodeproj/project.pbxproj
git commit -m "feat(ios): send north-referenced compass guidance"
```

### Task 2: Add host-tested compass math and spring motion

**Files:**
- Create: `firmware/roll-compass-board/compass_math.h`
- Create: `firmware/roll-compass-board/compass_math.cpp`
- Create: `firmware/roll-compass-board/needle_spring.h`
- Create: `firmware/roll-compass-board/needle_spring.cpp`
- Create: `firmware/roll-compass-board/tests/compass_core_test.cpp`
- Create: `scripts/firmware/test-board-core.sh`
- Modify: `package.json`

**Interfaces:**
- Produces: `roll_compass::normalizeDegrees(float) -> float`.
- Produces: `roll_compass::shortestDeltaDegrees(float from, float to) -> float`.
- Produces: `roll_compass::relativeNeedleAngle(float magneticHeading, float declinationEast, float targetTrueBearing) -> float`.
- Produces: `NeedleSpring::reset(float)` and `NeedleSpring::step(float targetDegrees, float deltaSeconds) -> float`.

- [ ] **Step 1: Create a failing native C++ test executable**

Write deterministic assertions without Arduino headers:

```cpp
#include <assert.h>
#include <math.h>

#include "compass_math.h"
#include "needle_spring.h"

static void assertNear(float actual, float expected, float tolerance = 0.01f) {
    assert(fabsf(actual - expected) <= tolerance);
}

int main() {
    assertNear(roll_compass::normalizeDegrees(-1.0f), 359.0f);
    assertNear(roll_compass::shortestDeltaDegrees(359.0f, 1.0f), 2.0f);
    assertNear(roll_compass::shortestDeltaDegrees(1.0f, 359.0f), -2.0f);
    assertNear(roll_compass::relativeNeedleAngle(350.0f, 0.0f, 10.0f), 20.0f);
    assertNear(roll_compass::relativeNeedleAngle(100.0f, -8.0f, 92.0f), 0.0f);

    roll_compass::NeedleSpring spring;
    spring.reset(350.0f);
    for (int index = 0; index < 160; ++index) spring.step(10.0f, 0.025f);
    assertNear(roll_compass::shortestDeltaDegrees(spring.angleDegrees(), 10.0f), 0.0f, 0.15f);
    assert(fabsf(spring.velocityDegreesPerSecond()) < 0.5f);
    return 0;
}
```

Create `test-board-core.sh` to compile into ignored local artifacts:

```bash
#!/usr/bin/env bash
set -euo pipefail

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_root/../.." && pwd)"
test_output_root="$project_root/.local-artifacts/firmware-tests"
compiler_bin="${COMPASS_TEST_CXX:-c++}"
mkdir -p "$test_output_root"
"$compiler_bin" -std=c++17 -Wall -Wextra -Werror \
  -I "$project_root/firmware/roll-compass-board" \
  "$project_root/firmware/roll-compass-board/tests/compass_core_test.cpp" \
  "$project_root/firmware/roll-compass-board/compass_math.cpp" \
  "$project_root/firmware/roll-compass-board/needle_spring.cpp" \
  -o "$test_output_root/compass-core-test"
"$test_output_root/compass-core-test"
```

Add `"firmware:test": "bash scripts/firmware/test-board-core.sh"` to `package.json`.

- [ ] **Step 2: Run the native test and verify it fails**

Run: `bun run firmware:test`

Expected: compilation fails because `compass_math` and `NeedleSpring` do not exist.

- [ ] **Step 3: Implement normalized angle calculations**

```cpp
float normalizeDegrees(float value) {
    value = fmodf(value, 360.0f);
    return value < 0.0f ? value + 360.0f : value;
}

float shortestDeltaDegrees(float from, float to) {
    float delta = normalizeDegrees(to) - normalizeDegrees(from);
    if (delta > 180.0f) delta -= 360.0f;
    if (delta < -180.0f) delta += 360.0f;
    return delta;
}

float relativeNeedleAngle(float magneticHeading, float declinationEast, float targetTrueBearing) {
    const float boardTrueHeading = normalizeDegrees(magneticHeading + declinationEast);
    return shortestDeltaDegrees(boardTrueHeading, targetTrueBearing);
}
```

- [ ] **Step 4: Implement a fixed-step damped spring**

Use exact tuning constants and bound large frame gaps:

```cpp
float NeedleSpring::step(float targetDegrees, float deltaSeconds) {
    const float dt = fminf(fmaxf(deltaSeconds, 0.001f), 0.05f);
    const float displacement = shortestDeltaDegrees(angleDegrees_, targetDegrees);
    constexpr float stiffness = 115.0f;
    constexpr float damping = 17.0f;
    velocityDegreesPerSecond_ += (stiffness * displacement - damping * velocityDegreesPerSecond_) * dt;
    angleDegrees_ = normalizeDegrees(angleDegrees_ + velocityDegreesPerSecond_ * dt);
    if (fabsf(displacement) < 0.04f && fabsf(velocityDegreesPerSecond_) < 0.2f) {
        angleDegrees_ = normalizeDegrees(targetDegrees);
        velocityDegreesPerSecond_ = 0.0f;
    }
    return angleDegrees_;
}
```

- [ ] **Step 5: Run the native tests and firmware compile**

Run:

```bash
bun run firmware:test
bun run firmware:compile
```

Expected: native test exits `0`; the Arduino sketch still compiles with the new source files unused.

- [ ] **Step 6: Commit the pure compass core**

```bash
git add package.json firmware/roll-compass-board/compass_math.h firmware/roll-compass-board/compass_math.cpp firmware/roll-compass-board/needle_spring.h firmware/roll-compass-board/needle_spring.cpp firmware/roll-compass-board/tests/compass_core_test.cpp scripts/firmware/test-board-core.sh
git commit -m "feat(firmware): add tested compass motion core"
```

### Task 3: Add the Roll Compass OS reducer and strict board-side BLE v2 parser

**Files:**
- Create: `firmware/roll-compass-board/compass_runtime.h`
- Create: `firmware/roll-compass-board/compass_runtime.cpp`
- Modify: `firmware/roll-compass-board/physical_compass_wire.h`
- Modify: `firmware/roll-compass-board/physical_compass_wire.cpp`
- Modify: `firmware/roll-compass-board/tests/compass_core_test.cpp`
- Modify: `scripts/firmware/test-board-core.sh`

**Interfaces:**
- Consumes: `relativeNeedleAngle` from Task 2.
- Produces: `CompassOsState`, `JourneyPhase`, `SensorHealth`, `CalibrationHealth`, `RuntimeInput`, and `CompassRenderModel`.
- Produces: `CompassRenderModel reduceRuntime(const RuntimeInput &input)`.
- Produces: `ParseStateResult parseStateFrame(const uint8_t *data, size_t length, BoardState &state)` with `Accepted`, `Invalid`, and `UnsupportedVersion`.

- [ ] **Step 1: Add failing reducer tests for state precedence and direction suppression**

Add a helper with safe defaults and these assertions:

```cpp
roll_compass::RuntimeInput input{};
input.bootComplete = true;
input.bleConnected = true;
input.snapshotFresh = true;
input.sensorHealth = roll_compass::SensorHealth::Ready;
input.calibrationHealth = roll_compass::CalibrationHealth::Valid;
input.phase = roll_compass::JourneyPhase::Following;
input.hasCredibleTarget = true;
input.targetTrueBearingDegrees = 10.0f;
input.magneticDeclinationDegreesEast = 0.0f;
input.boardMagneticHeadingDegrees = 350.0f;

auto guiding = roll_compass::reduceRuntime(input);
assert(guiding.state == roll_compass::CompassOsState::Guiding);
assert(guiding.showNeedle);
assertNear(guiding.targetNeedleAngleDegrees, 20.0f);

input.snapshotFresh = false;
auto stale = roll_compass::reduceRuntime(input);
assert(stale.state == roll_compass::CompassOsState::Stale);
assert(!stale.showNeedle);

input.snapshotFresh = true;
input.sensorHealth = roll_compass::SensorHealth::Missing;
assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::SensorMissing);

input.sensorHealth = roll_compass::SensorHealth::Ready;
input.protocolMismatch = true;
assert(roll_compass::reduceRuntime(input).state == roll_compass::CompassOsState::UpdateRequired);
```

- [ ] **Step 2: Run the host test and verify it fails**

Run: `bun run firmware:test`

Expected: compilation fails because `compass_runtime.h` does not exist.

- [ ] **Step 3: Define the pure runtime model and deterministic precedence**

Use these enums and render fields:

```cpp
enum class CompassOsState : uint8_t {
    Boot, Pairing, SensorMissing, Calibrating, Ready, Guiding, Near,
    Paused, Arrived, Stale, MagneticAnomaly, UpdateRequired
};
enum class JourneyPhase : uint8_t {
    Idle, Selecting, Committed, Following, RouteRecovery, Near, Paused,
    Arrived, Stopped, Completed, Expired, Unknown
};
enum class SensorHealth : uint8_t { Missing, WarmingUp, Ready, Fault, Anomaly };
enum class CalibrationHealth : uint8_t { Missing, Collecting, Valid, Invalid };

struct RuntimeInput {
    bool bootComplete = false;
    bool bleConnected = false;
    bool protocolMismatch = false;
    bool snapshotFresh = false;
    SensorHealth sensorHealth = SensorHealth::Missing;
    CalibrationHealth calibrationHealth = CalibrationHealth::Missing;
    JourneyPhase phase = JourneyPhase::Idle;
    bool hasCredibleTarget = false;
    float targetTrueBearingDegrees = 0.0f;
    float magneticDeclinationDegreesEast = 0.0f;
    float boardMagneticHeadingDegrees = 0.0f;
    bool hasDistance = false;
    float distanceM = 0.0f;
    uint8_t actionMask = 0;
};

struct CompassRenderModel {
    CompassOsState state = CompassOsState::Boot;
    bool showNeedle = false;
    float targetNeedleAngleDegrees = 0.0f;
    bool hasDistance = false;
    float distanceM = 0.0f;
    uint8_t actionMask = 0;
};
```

Reducer priority is: boot, protocol mismatch, disconnected pairing, missing/fault sensor, invalid/collecting calibration, magnetic anomaly, stale snapshot, active guidance without a credible target, then journey phase. `Following`, `Near`, and `RouteRecovery` without a credible target reduce to `Stale`. `Paused` and `Stopped` reduce to `Paused`; `Arrived` and `Completed` reduce to `Arrived`; idle/selecting/committed/expired reduce to `Ready`. Only `Guiding` and `Near` with `hasCredibleTarget` show the needle.

- [ ] **Step 4: Upgrade board-side state parsing to contract v2**

Replace `bearingDegrees` with paired fields in `BoardState`:

```cpp
bool hasDirection = false;
float targetTrueBearingDegrees = 0.0f;
float magneticDeclinationDegreesEast = 0.0f;
```

Return `UnsupportedVersion` before parsing the rest of a v1 frame. Validate `tb` in `[0, 360)`, `md` in `[-180, 180]`, and require both fields to be present or absent together. Keep existing distance, safe disclosure, action, reveal, timestamp, sequence, and frame-size validation.

Map every accepted wire phase into the full `JourneyPhase` enum during runtime input construction; never branch on phase strings inside `display_ui.cpp`.

- [ ] **Step 5: Run native tests and compile the board**

Run:

```bash
bun run firmware:test
bun run firmware:compile
```

Expected: runtime tests pass; board compiles with contract version `2`; a compile warning is not accepted because firmware compile runs with `--warnings all`.

- [ ] **Step 6: Commit runtime reduction and BLE v2 parsing**

```bash
git add firmware/roll-compass-board/compass_runtime.h firmware/roll-compass-board/compass_runtime.cpp firmware/roll-compass-board/physical_compass_wire.h firmware/roll-compass-board/physical_compass_wire.cpp firmware/roll-compass-board/tests/compass_core_test.cpp scripts/firmware/test-board-core.sh
git commit -m "feat(firmware): reduce v2 guidance into compass os states"
```

### Task 4: Add deterministic USB state and orientation diagnostics

**Files:**
- Create: `firmware/roll-compass-board/compass_diagnostics.h`
- Create: `firmware/roll-compass-board/compass_diagnostics.cpp`
- Modify: `firmware/roll-compass-board/tests/compass_core_test.cpp`
- Modify: `scripts/firmware/test-board-core.sh`

**Interfaces:**
- Consumes: `RuntimeInput` and state enums from Task 3.
- Produces: `DiagnosticCommand parseDiagnosticCommand(const char *line)`.
- Produces: `bool applyDiagnosticCommand(const DiagnosticCommand &, DiagnosticState &)`.
- Produces: `DiagnosticState::applyTo(RuntimeInput &, uint32_t nowMs)`.
- Produces: `bool DiagnosticState::enabled() const`.

- [ ] **Step 1: Add failing parser and state-injection tests**

```cpp
auto heading = roll_compass::parseDiagnosticCommand("heading 90");
assert(heading.type == roll_compass::DiagnosticCommandType::Heading);
assertNear(heading.valueDegrees, 90.0f);

auto sweep = roll_compass::parseDiagnosticCommand("sweep ccw");
assert(sweep.type == roll_compass::DiagnosticCommandType::SweepCounterClockwise);

auto invalid = roll_compass::parseDiagnosticCommand("heading 720");
assert(invalid.type == roll_compass::DiagnosticCommandType::Invalid);

roll_compass::DiagnosticState diagnostic;
assert(roll_compass::applyDiagnosticCommand(heading, diagnostic));
roll_compass::RuntimeInput simulated{};
diagnostic.applyTo(simulated, 1000);
assert(simulated.sensorHealth == roll_compass::SensorHealth::Ready);
assert(simulated.calibrationHealth == roll_compass::CalibrationHealth::Valid);
assertNear(simulated.boardMagneticHeadingDegrees, 90.0f);
```

- [ ] **Step 2: Run the host test and verify it fails**

Run: `bun run firmware:test`

Expected: compilation fails because the diagnostic parser does not exist.

- [ ] **Step 3: Implement the exact command grammar**

Accept only these newline-stripped commands:

```text
sim on
sim off
state guiding
state near
state paused
state arrived
state calibrating
state sensor-missing
state anomaly
target <0..359.999>
declination <-180..180>
heading <0..359.999>
sweep cw
sweep ccw
sweep stop
```

Reject trailing tokens and non-finite values. `sim on` starts with connected/fresh, sensor ready, calibration valid, target `0°`, declination `0°`, heading `0°`, and phase `guiding`. A sweep advances simulated magnetic heading by `45°/s` using elapsed milliseconds. `sim off` returns control to BLE and the real sensor input without copying simulated values into production state.

- [ ] **Step 4: Run tests and board compile**

Run:

```bash
bun run firmware:test
bun run firmware:compile
```

Expected: all valid commands parse, invalid commands are rejected, and diagnostics remain a pure module until orchestration is connected in Task 6.

- [ ] **Step 5: Commit USB diagnostic parsing**

```bash
git add firmware/roll-compass-board/compass_diagnostics.h firmware/roll-compass-board/compass_diagnostics.cpp firmware/roll-compass-board/tests/compass_core_test.cpp scripts/firmware/test-board-core.sh
git commit -m "feat(firmware): add deterministic compass diagnostics"
```

### Task 5: Generate tight compass assets and product fonts reproducibly

**Files:**
- Create: `scripts/firmware/fetch-board-fonts.sh`
- Create: `scripts/firmware/generate-board-fonts.sh`
- Create: `scripts/firmware/generate-board-assets.sh`
- Create: `scripts/firmware/validate-generated-assets.py`
- Modify: `scripts/firmware/generate-compass-assets.py`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `.gitignore`

**Interfaces:**
- Produces ignored `firmware/roll-compass-board/compass_assets.h` and `compass_asset_metrics.h`.
- Produces ignored `firmware/roll-compass-board/roll_compass_wordmark_font.c`, `roll_compass_korean_16.c`, and `roll_compass_korean_20.c`.
- Produces `bun run firmware:assets` as the only required generation command.

- [ ] **Step 1: Add failing generated-asset assertions**

The validator must assert:

```python
assert metrics["shell_width"] == 480
assert metrics["shell_height"] == 480
assert 40 <= metrics["needle_width"] <= 180
assert 180 <= metrics["needle_height"] <= 360
assert 0 <= metrics["needle_pivot_x"] < metrics["needle_width"]
assert 0 <= metrics["needle_pivot_y"] < metrics["needle_height"]
assert metrics["screen_hub_x"] == 240
assert metrics["screen_hub_y"] == 240
```

Also assert that all three generated font source files exist and contain `lv_font_t` declarations with the expected symbol names.

- [ ] **Step 2: Run validation and verify it fails against the 520×520 needle canvas**

Run: `python3 scripts/firmware/validate-generated-assets.py`

Expected: failure because metrics and generated font sources do not exist.

- [ ] **Step 3: Pin the font converter and Korean font source**

Run: `bun add --dev lv_font_conv@1.5.3`

Create `fetch-board-fonts.sh` that downloads from Google Fonts commit `6a003b5eb672dc8bf5bff5937cf5863f8b175445` into `.local-artifacts/firmware-fonts/` and verifies:

```text
NotoSansKR[wght].ttf  194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252
OFL.txt                1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9
```

Use `curl --fail --location --silent --show-error --retry 3`, calculate with `shasum -a 256`, and abort before replacing a valid cached file when the checksum differs.

- [ ] **Step 4: Replace the giant needle canvas with alpha-bounds plus pivot metadata**

In the Python generator:

1. Keep the shell on a centered 480×480 output.
2. Resize the source needle to the approved dial proportion.
3. Transform the known source hub with the same scale.
4. Compute the non-zero alpha bounding box.
5. Expand each side by 8 pixels, clamped to the transformed source bounds.
6. Emit only that crop as `rollCompassNeedleImage`.
7. Emit `kNeedlePivotX`, `kNeedlePivotY`, `kNeedleScreenX = 240 - kNeedlePivotX`, and `kNeedleScreenY = 240 - kNeedlePivotY` in `compass_asset_metrics.h`.

The generated UI position must therefore satisfy:

```cpp
kNeedleScreenX + kNeedlePivotX == 240
kNeedleScreenY + kNeedlePivotY == 240
```

- [ ] **Step 5: Generate the wordmark and Korean subsets**

Use the checked-in `ios/Somewhere/Resources/Fonts/UnifrakturCook-Bold.ttf` for the 24-pixel wordmark symbols `Roll the compass`. Use the pinned Noto Sans KR variable font for 16- and 20-pixel, 4-bpp subsets containing exactly the Korean strings rendered by the state system:

```text
아이폰을 기다리는 중
방향 센서를 연결해 주세요
나침반을 움직여 보정하세요
준비됐어요
바늘을 따라가세요
거의 다 왔어요
잠시 멈췄어요
계속하기
여정 끝내기
도착했어요
아이폰에서 확인하기
방향을 확인하는 중
자기장을 확인해 주세요
업데이트가 필요해요
남은 거리
```

Invoke the local executable through `bunx --bun lv_font_conv` with `--format lvgl`, `--bpp 4`, explicit `--size`, `--font`, `--symbols`, and output path arguments. Preserve the Google Fonts `OFL.txt` beside the cached source and keep the existing Unifraktur OFL file unchanged.

- [ ] **Step 6: Orchestrate and validate generation**

Set `firmware:assets` to `bash scripts/firmware/generate-board-assets.sh`. The orchestrator runs font fetch, compass generation, font generation, then validation.

Run:

```bash
bun run firmware:assets
bun run firmware:compile
```

Expected: validation passes; the board compiles with a 480×480 shell, tight needle, emitted pivot, and Korean/wordmark font sources.

- [ ] **Step 7: Commit the reproducible asset pipeline**

```bash
git add .gitignore package.json bun.lock scripts/firmware/fetch-board-fonts.sh scripts/firmware/generate-board-fonts.sh scripts/firmware/generate-board-assets.sh scripts/firmware/generate-compass-assets.py scripts/firmware/validate-generated-assets.py
git commit -m "feat(firmware): generate centered compass assets and fonts"
```

### Task 6: Replace the square overlay UI with the circular Roll Compass OS

**Files:**
- Create: `firmware/roll-compass-board/compass_layout.h`
- Modify: `firmware/roll-compass-board/display_ui.h`
- Modify: `firmware/roll-compass-board/display_ui.cpp`
- Modify: `firmware/roll-compass-board/roll-compass-board.ino`
- Modify: `firmware/roll-compass-board/tests/compass_core_test.cpp`
- Modify: `scripts/firmware/test-board-core.sh`

**Interfaces:**
- Consumes: `CompassRenderModel`, `NeedleSpring`, generated image metrics, and generated fonts.
- Produces: `displayUiSetModel(const CompassRenderModel &model)`.
- Produces: `displayUiTick(uint32_t nowMs)` with fixed-step motion.
- Produces: `displayUiSetEventCallback(PhysicalCompassEventCallback callback)` with existing sequence guards.

- [ ] **Step 1: Add failing circular-containment assertions**

Define `Rect` and `rectFitsCircle` in `compass_layout.h`, then test these named bounds from the same header:

```cpp
assert(roll_compass::rectFitsCircle(roll_compass::kBrandBounds, 240, 240, 214));
assert(roll_compass::rectFitsCircle(roll_compass::kStatusBounds, 240, 240, 214));
assert(roll_compass::rectFitsCircle(roll_compass::kDistanceBounds, 240, 240, 214));
assert(roll_compass::rectFitsCircle(roll_compass::kPrimaryActionBounds, 240, 240, 214));
assert(roll_compass::rectFitsCircle(roll_compass::kPausedContinueBounds, 240, 240, 214));
assert(roll_compass::rectFitsCircle(roll_compass::kPausedEndBounds, 240, 240, 214));
```

Use these concrete bounds:

```cpp
constexpr Rect kBrandBounds{135, 38, 210, 28};
constexpr Rect kStatusBounds{110, 76, 260, 24};
constexpr Rect kDistanceBounds{150, 340, 180, 56};
constexpr Rect kPrimaryActionBounds{150, 398, 180, 44};
constexpr Rect kPausedContinueBounds{160, 344, 160, 40};
constexpr Rect kPausedEndBounds{160, 396, 160, 40};
```

- [ ] **Step 2: Run the native tests and verify they fail**

Run: `bun run firmware:test`

Expected: compilation fails because `compass_layout.h` does not exist.

- [ ] **Step 3: Build a single model-driven LVGL tree**

Delete the corner brand, connection pill, status/info cards, clue/price panel, sparkles, and four-button row. Create only:

- centered 480×480 shell;
- centered glow ring;
- tightly cropped needle at generated screen coordinates and pivot;
- centered Unifraktur wordmark;
- one Korean status label;
- centered distance caption/value;
- one primary lower soft key;
- two paused-state choices, hidden outside `Paused`;
- calibration progress arc and brass ghost needle, hidden outside `Calibrating`.

State rendering must be a total switch over `CompassOsState`. The red needle is visible only when `model.showNeedle` is true. `SensorMissing`, `Stale`, `MagneticAnomaly`, and `UpdateRequired` hide it and expose no journey action. `Boot` fades in the parchment face and performs one restrained brass-needle sweep. `Pairing` breathes the brass ring slowly. `Arrived` settles the needle into a short brass seal animation. No state uses a continuous particle field.

- [ ] **Step 4: Render exact state copy and action priority**

Use this mapping:

```cpp
case CompassOsState::Pairing: status = "아이폰을 기다리는 중"; break;
case CompassOsState::SensorMissing: status = "방향 센서를 연결해 주세요"; break;
case CompassOsState::Calibrating: status = "나침반을 움직여 보정하세요"; break;
case CompassOsState::Ready: status = "준비됐어요"; break;
case CompassOsState::Guiding: status = "바늘을 따라가세요"; break;
case CompassOsState::Near: status = "거의 다 왔어요"; break;
case CompassOsState::Paused: status = "잠시 멈췄어요"; break;
case CompassOsState::Arrived: status = "도착했어요"; break;
case CompassOsState::Stale: status = "방향을 확인하는 중"; break;
case CompassOsState::MagneticAnomaly: status = "자기장을 확인해 주세요"; break;
case CompassOsState::UpdateRequired: status = "업데이트가 필요해요"; break;
case CompassOsState::Boot: status = ""; break;
```

In `Guiding`/`Near`, display only `stop` when advertised. In `Paused`, display only `continue` and `confirm-stop` when advertised. In `Arrived`, display only `reveal` when advertised; label it `아이폰에서 확인하기` and do not show identity.

- [ ] **Step 5: Connect BLE, runtime reduction, USB diagnostics, and rendering**

In the sketch loop:

```cpp
processPendingBleState();
processSerialDiagnostics();
roll_compass::RuntimeInput input = buildRuntimeInput(millis());
if (diagnosticState.enabled()) diagnosticState.applyTo(input, millis());
const roll_compass::CompassRenderModel model = roll_compass::reduceRuntime(input);
displayUiSetModel(model);
displayUiTick(millis());
delay(5);
```

Track accepted snapshot time separately from BLE connection time. Map `UnsupportedVersion` to `protocolMismatch = true` and clear it only after a valid v2 snapshot. Keep malformed frames non-destructive until the accepted snapshot becomes stale after six seconds.

- [ ] **Step 6: Drive the needle with the fixed-step spring**

Accumulate elapsed time and run the spring at 25 ms steps, capped at four catch-up steps per tick. Convert the spring's normalized angle to LVGL tenths of a degree. Enable image transform antialiasing on the needle style and never rotate the shell.

- [ ] **Step 7: Run tests, regenerate assets, and compile**

Run:

```bash
bun run firmware:test
bun run firmware:assets
bun run firmware:compile
git diff --check
```

Expected: all circular bounds pass; the generated pivot equals `(240, 240)` on screen; the board compiles without old corner widgets or a 520×520 rotating needle.

- [ ] **Step 8: Commit the circular OS**

```bash
git add firmware/roll-compass-board/compass_layout.h firmware/roll-compass-board/display_ui.h firmware/roll-compass-board/display_ui.cpp firmware/roll-compass-board/roll-compass-board.ino firmware/roll-compass-board/tests/compass_core_test.cpp scripts/firmware/test-board-core.sh
git commit -m "feat(firmware): render the circular roll compass os"
```

### Task 7: Enable tear-resistant rendering, flash the connected board, and run the USB visual checkpoint

**Files:**
- Modify: `firmware/roll-compass-board/lvgl_v8_port.h`
- Modify: `firmware/roll-compass-board/lvgl_v8_port.cpp`
- Modify: `firmware/roll-compass-board/roll-compass-board.ino`
- Modify: `firmware/roll-compass-board/README.md`
- Modify: `docs/operations/physical-compass-ble.md`

**Interfaces:**
- Consumes: the complete simulated circular OS from Tasks 1–6.
- Produces: preferred two-framebuffer LVGL direct mode, a checked partial-buffer fallback, and a flashed physical USB checkpoint.

- [ ] **Step 1: Add a source assertion for direct-mode rendering**

Extend `test-board-core.sh` with exact checks:

```bash
rg -q '#define LVGL_PORT_AVOID_TEARING_MODE[[:space:]]+\(3\)' "$project_root/firmware/roll-compass-board/lvgl_v8_port.h"
rg -Fq 'configFrameBufferNumber(useDirectMode ? 2 : 1)' "$project_root/firmware/roll-compass-board/roll-compass-board.ino"
rg -q 'LVGL_BUFFER_PARTIAL' "$project_root/firmware/roll-compass-board/lvgl_v8_port.cpp"
rg -q '1310720' "$project_root/firmware/roll-compass-board/roll-compass-board.ino"
```

- [ ] **Step 2: Run the verification and confirm the mode check fails**

Run: `bun run firmware:test`

Expected: failure because the Arduino branch still sets avoid-tearing mode `0`.

- [ ] **Step 3: Prefer double-buffer direct mode and keep an explicit allocation fallback**

Set the preferred Arduino mode to:

```cpp
#define LVGL_PORT_AVOID_TEARING_MODE (3)
```

Keep rotation at `0°`. Before `board->begin()`, choose direct mode only when free PSRAM is at least `1,310,720` bytes (two 480×480 RGB565 buffers plus a 384 KiB reserve). Configure two framebuffers for direct mode and one for the partial fallback:

```cpp
const bool useDirectMode = ESP.getFreePsram() >= 1310720;
board->getLCD()->configFrameBufferNumber(useDirectMode ? 2 : 1);
```

Change `lvgl_port_init` to accept a C-compatible `lvgl_port_buffer_mode_t` with `LVGL_BUFFER_DIRECT_DOUBLE` and `LVGL_BUFFER_PARTIAL`. Compile both flush paths instead of selecting the entire implementation with one preprocessor branch. Direct mode obtains the two LCD framebuffers and sets `disp_drv.direct_mode = 1`; partial mode allocates the existing two 20-row internal-SRAM draw buffers and uses the existing bitmap flush callback. If `board->begin()` fails after selecting two framebuffers, destroy that board instance, create and initialize a fresh `Board`, configure one framebuffer, and retry once in partial mode. After display initialization, log PSRAM size, free PSRAM, selected mode, and free heap. If direct LVGL initialization fails, deinitialize it, select `LVGL_BUFFER_PARTIAL`, and log `display_mode=partial_fallback` before rendering.

- [ ] **Step 4: Run complete software verification**

Run:

```bash
bun run firmware:test
bun run firmware:assets
bun run firmware:compile
xcodebuild -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test -only-testing:SomewhereTests
bun run verify:ios-source
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 5: Flash the currently connected board**

Run:

```bash
bun run firmware:upload
```

Expected: the upload script detects the current `/dev/cu.usbmodem*` port, writes without erasing unrelated flash regions, and reports a successful upload.

- [ ] **Step 6: Exercise the circular UI through USB**

Open `bun run firmware:monitor` and send this exact sequence:

```text
sim on
target 0
heading 0
heading 90
heading 180
heading 270
sweep cw
state near
state paused
state arrived
state calibrating
state sensor-missing
state anomaly
sim off
```

Observe that the hub remains centered, the target stays fixed in world space as heading changes, all text/actions remain within the round glass, the sweep follows the shortest path without tearing, and safety states hide the red needle.

- [ ] **Step 7: Run a one-minute sweep and inspect runtime health**

Run `sim on`, `target 315`, and `sweep cw` for at least 60 seconds. Stop with `sweep stop`. Confirm serial logs show no reset, allocation failure, stale heap decline, or watchdog event.

- [ ] **Step 8: Update operating notes and commit the flashed checkpoint**

Document BLE v2, USB commands, expected no-sensor state, direct-mode rendering, and the external LIS2MDL requirement.

```bash
git add firmware/roll-compass-board/lvgl_v8_port.h firmware/roll-compass-board/lvgl_v8_port.cpp firmware/roll-compass-board/roll-compass-board.ino firmware/roll-compass-board/README.md docs/operations/physical-compass-ble.md scripts/firmware/test-board-core.sh
git commit -m "feat(hardware): flash circular compass os checkpoint"
```
