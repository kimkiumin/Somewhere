# Roll Compass Independent Heading Sensor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace USB-simulated board orientation with calibrated LIS2MDL + QMI8658 heading so the physical board can rotate and tilt independently while its needle keeps pointing toward the iPhone-provided hidden route target.

**Architecture:** A 100 Hz sensor task reads aligned accelerometer, gyroscope, and magnetic vectors, applies persisted gyro/magnetometer calibration, and feeds the MIT-licensed xioTechnologies Fusion AHRS. Quality gates reduce sensor availability, calibration coverage, magnetic plausibility, and sample freshness into the existing Roll Compass OS model. USB simulation remains available as an explicit diagnostic override and the board remains fully safe when the LIS2MDL is absent.

**Tech Stack:** Arduino ESP32 core 3.3.11, SensorLib 0.4.1, Adafruit LIS2MDL 2.1.8, Adafruit Unified Sensor 1.1.15, Adafruit BusIO 1.17.4, xioTechnologies Fusion 1.3.2, ESP32 Preferences/NVS, FreeRTOS, C++17 host tests, existing LVGL 8.4.0 UI.

**Spec:** `docs/superpowers/specs/2026-08-26-roll-compass-independent-heading-os-design.md`

## Global Constraints

- Complete `docs/superpowers/plans/2026-08-26-roll-compass-circular-os-usb-v2.md` first.
- Reference magnetometer is an LIS2MDL breakout on `3V3`, `GND`, `SCL/GPIO7`, `SDA/GPIO15`, I2C address `0x1E`.
- Mount the LIS2MDL with its marked X axis toward display 3 o'clock, Y axis toward 12 o'clock, and component side facing the same outward direction as the display face.
- Keep the magnetometer away from the buzzer, battery, magnets, steel fasteners, and high-current wires; recalibrate after any mounting change.
- QMI8658 remains at I2C address `0x6B`; all existing display, touch, RTC, and expander devices must continue working.
- Never show a red guidance needle from gyroscope integration alone or from uncalibrated magnetic data.
- Sensor sampling target is 100 Hz; rendering target remains 40 FPS and runs independently.
- BLE v2, hidden-destination, action-guard, six-second stale, Wi-Fi-disabled, and foreground-iPhone constraints remain unchanged.
- Calibration persistence writes only a fully validated record and preserves the previous valid record when a new session fails or is interrupted.

## File structure

- `firmware/roll-compass-board/compass_sensor.{h,cpp}`: QMI8658/LIS2MDL initialization, aligned samples, and health.
- `firmware/roll-compass-board/compass_calibration.{h,cpp}`: host-testable gyro and magnetic calibration.
- `firmware/roll-compass-board/calibration_store.{h,cpp}`: versioned Preferences record with CRC32.
- `firmware/roll-compass-board/src/vendor/fusion/`: pinned Fusion 1.3.2 C sources and MIT license.
- `firmware/roll-compass-board/heading_fusion.{h,cpp}`: Fusion AHRS wrapper, field-quality debounce, and magnetic heading.
- `firmware/roll-compass-board/sensor_runtime.{h,cpp}`: 100 Hz FreeRTOS producer and thread-safe latest output.
- `firmware/roll-compass-board/board_config.h`: I2C pins, addresses, sample rates, axis maps, and quality thresholds.
- `firmware/roll-compass-board/roll-compass-board.ino`: selects real orientation unless diagnostic override is enabled.
- `firmware/roll-compass-board/tests/compass_sensor_test.cpp`: native calibration/fusion fixtures.
- `scripts/firmware/test-board-sensor.sh`: host sensor-core runner.

---

### Task 1: Pin sensor libraries and add an absence-safe hardware adapter

**Files:**
- Modify: `firmware/roll-compass-board/dependencies.lock`
- Modify: `scripts/firmware/setup-toolchain.sh`
- Modify: `firmware/roll-compass-board/board_config.h`
- Create: `firmware/roll-compass-board/src/vendor/fusion/`
- Create: `firmware/roll-compass-board/compass_sensor.h`
- Create: `firmware/roll-compass-board/compass_sensor.cpp`
- Modify: `firmware/roll-compass-board/roll-compass-board.ino`

**Interfaces:**
- Produces: `Vec3`, `SensorSample`, `SensorBeginResult`, and `CompassSensor`.
- Produces: `SensorBeginResult CompassSensor::begin(TwoWire &wire)`.
- Produces: `bool CompassSensor::read(SensorSample &sample, uint32_t nowMs)`.

- [ ] **Step 1: Add compile references to the absent adapter and verify failure**

Include `compass_sensor.h` in the sketch, create a global `CompassSensor`, and call `begin(Wire)` after the board initializes the shared I2C bus. Log `qmiReady` and `magnetometerReady` without blocking boot.

Run: `bun run firmware:compile`

Expected: compilation fails because the adapter does not exist.

- [ ] **Step 2: Pin exact direct sensor dependencies**

Append:

```text
SensorLib=0.4.1
Adafruit_LIS2MDL=2.1.8
Adafruit_Unified_Sensor=1.1.15
Adafruit_BusIO=1.17.4
Fusion=1.3.2
FusionCommit=015d68494274b479b5996bff2530ecbcfdc266f2
FusionTarSha256=1f6fe54815d975bd16b5e90939e59e22077e7d8c856a0e73eb60bc5f6dde897b
```

Install Unified Sensor and BusIO first, then install LIS2MDL with `--no-deps` so unused example-only display libraries are not added. Install SensorLib at its exact version. Download xioTechnologies Fusion tag `v1.3.2`, commit `015d68494274b479b5996bff2530ecbcfdc266f2`, verify tarball SHA-256 `1f6fe54815d975bd16b5e90939e59e22077e7d8c856a0e73eb60bc5f6dde897b`, and copy only `Fusion/*.c`, `Fusion/*.h`, and `LICENSE.md` into `firmware/roll-compass-board/src/vendor/fusion/`. Preserve the MIT license and add no Python package files.

- [ ] **Step 3: Define board constants and physical axes**

Add:

```cpp
constexpr uint8_t kSharedI2cSda = 15;
constexpr uint8_t kSharedI2cScl = 7;
constexpr uint8_t kQmi8658Address = 0x6B;
constexpr uint8_t kLis2mdlAddress = 0x1E;
constexpr float kSensorSampleHz = 100.0f;

struct AxisMap {
    uint8_t sourceIndex[3];
    int8_t sign[3];
};
```

Define the board coordinate frame as +X to 3 o'clock, +Y to 12 o'clock, +Z out through the display. Put QMI and LIS transforms in `board_config.h` and apply them exactly once in `CompassSensor::read`.

- [ ] **Step 4: Initialize and read both sensors without making the board unusable when LIS2MDL is absent**

Use the exact APIs:

```cpp
const bool qmiReady = qmi_.begin(Wire, QMI8658_L_SLAVE_ADDRESS, kSharedI2cSda, kSharedI2cScl);
qmi_.configAccelerometer(SensorQMI8658::ACC_RANGE_4G, SensorQMI8658::ACC_ODR_125Hz, SensorQMI8658::LPF_MODE_0);
qmi_.configGyroscope(SensorQMI8658::GYR_RANGE_256DPS, SensorQMI8658::GYR_ODR_112_1Hz, SensorQMI8658::LPF_MODE_0);
qmi_.enableAccelerometer();
qmi_.enableGyroscope();

const bool magnetometerReady = lis2mdl_.begin(kLis2mdlAddress, &Wire);
if (magnetometerReady) lis2mdl_.setDataRate(LIS2MDL_RATE_100_HZ);
```

`begin` returns both readiness flags. `read` succeeds only when fresh QMI data and one LIS event are available, converts LIS microteslas and QMI g/degrees-per-second into `SensorSample`, applies axis maps, and stamps `capturedAtMs`.

- [ ] **Step 5: Compile and verify missing-sensor behavior on the board**

Run:

```bash
bun run firmware:setup
bun run firmware:compile
bun run firmware:upload
```

Expected without LIS2MDL attached: the board boots, display/touch/BLE remain functional, serial reports QMI ready and LIS2MDL missing, and the OS shows `SensorMissing` unless USB simulation is explicitly enabled.

- [ ] **Step 6: Commit the sensor adapter**

```bash
git add firmware/roll-compass-board/dependencies.lock firmware/roll-compass-board/src/vendor/fusion scripts/firmware/setup-toolchain.sh firmware/roll-compass-board/board_config.h firmware/roll-compass-board/compass_sensor.h firmware/roll-compass-board/compass_sensor.cpp firmware/roll-compass-board/roll-compass-board.ino
git commit -m "feat(firmware): add absence-safe compass sensors"
```

### Task 2: Implement validated gyro/magnetometer calibration and persistence

**Files:**
- Create: `firmware/roll-compass-board/compass_calibration.h`
- Create: `firmware/roll-compass-board/compass_calibration.cpp`
- Create: `firmware/roll-compass-board/calibration_store.h`
- Create: `firmware/roll-compass-board/calibration_store.cpp`
- Create: `firmware/roll-compass-board/tests/compass_sensor_test.cpp`
- Create: `scripts/firmware/test-board-sensor.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Vec3` and `SensorSample` from Task 1.
- Produces: `CalibrationData`, `GyroBiasAccumulator`, and `MagCalibrationAccumulator`.
- Produces: `CalibrationResult MagCalibrationAccumulator::finish() const`.
- Produces: `bool CalibrationStore::load(CalibrationData &)`, `bool save(const CalibrationData &)`, and `void clear()`.

- [ ] **Step 1: Add failing calibration fixture tests**

Generate synthetic samples on a sphere with known offset `(12, -7, 4)` and scale `(1.25, 0.8, 1.1)`. Assert:

```cpp
assert(result.valid);
assertNear(result.data.magneticOffsetUt.x, 12.0f, 0.8f);
assertNear(result.data.magneticOffsetUt.y, -7.0f, 0.8f);
assertNear(result.data.magneticOffsetUt.z, 4.0f, 0.8f);
assert(result.data.referenceFieldUt >= 20.0f);
assert(result.data.referenceFieldUt <= 70.0f);
assert(result.data.coverageMask == 0xFF);
```

Also assert that one-plane samples, fewer than 600 samples, axis span below `24 µT`, residual coefficient of variation above `0.15`, and reference field outside `20–70 µT` are invalid. Add CRC corruption and interrupted-save tests around a fake byte store.

- [ ] **Step 2: Run the sensor host test and verify it fails**

Add `"firmware:test:sensor": "bash scripts/firmware/test-board-sensor.sh"` and run it.

Expected: compilation fails because calibration types do not exist.

- [ ] **Step 3: Implement coverage-based calibration**

Use these exact acceptance gates:

```cpp
constexpr uint16_t kMinimumMagSamples = 600;
constexpr float kMinimumAxisSpanUt = 24.0f;
constexpr float kMinimumReferenceFieldUt = 20.0f;
constexpr float kMaximumReferenceFieldUt = 70.0f;
constexpr float kMaximumResidualCv = 0.15f;
constexpr uint8_t kRequiredCoverageMask = 0xFF;
```

Track min/max per axis, all eight sign octants after provisional centering, and a deterministic 256-sample ring for residual scoring. Compute offset as `(max + min) / 2`, half-span per axis, average half-span, and diagonal scale as `average / halfSpan`. Apply calibration as `(raw - offset) * scale`.

Collect stationary gyro bias only when acceleration magnitude is `0.90–1.10 g` and gyro magnitude is below `3 dps`; require 200 accepted samples and store the mean bias.

- [ ] **Step 4: Persist one versioned record with CRC32**

Use namespace `rollCompass`, key `calibration`, schema version `1`, and a packed record containing version, `CalibrationData`, and CRC32 over all preceding bytes. Save only a valid result. Load only when byte length, schema, finite values, acceptance bounds, and CRC all pass. Keep the previous valid record until the new record has been fully validated and written.

- [ ] **Step 5: Run host tests and board compile**

Run:

```bash
bun run firmware:test:sensor
bun run firmware:compile
```

Expected: all synthetic calibration, rejection, gyro bias, and CRC cases pass.

- [ ] **Step 6: Commit calibration and persistence**

```bash
git add package.json firmware/roll-compass-board/compass_calibration.h firmware/roll-compass-board/compass_calibration.cpp firmware/roll-compass-board/calibration_store.h firmware/roll-compass-board/calibration_store.cpp firmware/roll-compass-board/tests/compass_sensor_test.cpp scripts/firmware/test-board-sensor.sh
git commit -m "feat(firmware): calibrate and persist compass sensors"
```

### Task 3: Fuse calibrated 9-axis samples and gate magnetic anomalies

**Files:**
- Create: `firmware/roll-compass-board/heading_fusion.h`
- Create: `firmware/roll-compass-board/heading_fusion.cpp`
- Modify: `firmware/roll-compass-board/tests/compass_sensor_test.cpp`
- Modify: `scripts/firmware/test-board-sensor.sh`

**Interfaces:**
- Consumes: calibrated `SensorSample`, `CalibrationData`, and Fusion 1.3.2.
- Produces: `HeadingQuality`, `HeadingOutput`, and `HeadingOutput HeadingFusion::update(const SensorSample &sample, const CalibrationData &calibration, uint32_t nowMs)`.
- Produces: magnetic heading normalized to `[0, 360)` in the board coordinate frame.

- [ ] **Step 1: Add failing synthetic orientation and anomaly tests**

Feed 100 Hz level fixtures for north/east/south/west until convergence and assert heading error below `3°`. Feed fixtures at `±25°` roll and pitch and assert tilt-compensated heading error below `5°`. Assert a field magnitude outside the calibrated band for less than 500 ms does not trip an anomaly, 500 ms does, and 2 seconds of healthy field clears it.

- [ ] **Step 2: Run the fusion tests and verify they fail**

Run: `bun run firmware:test:sensor`

Expected: compilation fails because `HeadingFusion` does not exist.

- [ ] **Step 3: Wrap Fusion AHRS with calibrated vectors and monotonic timing**

Initialize `FusionAhrs` with sample rate `100`, convention `FusionConventionNwu`, gain `0.5`, gyroscope range `256`, acceleration rejection `10°`, magnetic rejection `10°`, and rejection timeout `3 s`. Subtract gyro bias, apply magnetic offset/scale, transform all vectors into the common board frame, and call:

```cpp
FusionAhrsSetSamplePeriod(&ahrs_, deltaSeconds);
FusionAhrsUpdate(
    &ahrs_,
    FusionVector{{gyro.x, gyro.y, gyro.z}},
    FusionVector{{accel.x, accel.y, accel.z}},
    FusionVector{{magnetic.x, magnetic.y, magnetic.z}}
);
```

Convert `FusionAhrsGetQuaternion` with `FusionQuaternionToEuler`, then normalize yaw plus a single tested installation offset into `[0, 360)`. Reject a sample when any component is non-finite, timestamp does not advance, sample age exceeds 100 ms, acceleration magnitude is outside `0.75–1.25 g`, or calibrated magnetic magnitude is outside the quality band.

- [ ] **Step 4: Add debounced magnetic quality**

Use the calibration reference field and accept magnitudes inside both `15–100 µT` and `65–135%` of that reference. Enter `Anomaly` after 500 continuous unhealthy milliseconds and return to `Credible` after 2,000 continuous healthy milliseconds. Before the first converged 100 samples, return `WarmingUp` and never show guidance.

- [ ] **Step 5: Run host tests and board compile**

The sensor test runner must compile the vendored Fusion C sources along with the pure fusion/calibration sources and include `firmware/roll-compass-board/src/vendor/fusion`.

Run:

```bash
bun run firmware:test:sensor
bun run firmware:compile
```

Expected: synthetic cardinal, tilt, stale, and anomaly tests pass.

- [ ] **Step 6: Commit heading fusion**

```bash
git add firmware/roll-compass-board/heading_fusion.h firmware/roll-compass-board/heading_fusion.cpp firmware/roll-compass-board/tests/compass_sensor_test.cpp scripts/firmware/test-board-sensor.sh
git commit -m "feat(firmware): fuse calibrated independent heading"
```

### Task 4: Run sensors at 100 Hz and feed the existing OS safely

**Files:**
- Create: `firmware/roll-compass-board/sensor_runtime.h`
- Create: `firmware/roll-compass-board/sensor_runtime.cpp`
- Modify: `firmware/roll-compass-board/roll-compass-board.ino`
- Modify: `firmware/roll-compass-board/display_ui.cpp`
- Modify: `firmware/roll-compass-board/compass_diagnostics.cpp`

**Interfaces:**
- Consumes: `CompassSensor`, calibration/store, `HeadingFusion`, and `RuntimeInput`.
- Produces: `SensorRuntime::begin()`, `SensorRuntime::snapshot()`, `startCalibration()`, and `cancelCalibration()`.
- Produces: thread-safe `SensorRuntimeSnapshot` with health, calibration state/progress, magnetic heading, and sample timestamp.

- [ ] **Step 1: Add compile references and verify missing orchestration**

Instantiate `SensorRuntime` in the sketch and replace the production `boardMagneticHeadingDegrees` source with `sensorRuntime.snapshot()` when diagnostics are disabled.

Run: `bun run firmware:compile`

Expected: compilation fails because `SensorRuntime` does not exist.

- [ ] **Step 2: Implement a 100 Hz producer with a small critical section**

Create one FreeRTOS task pinned to core 0 with `vTaskDelayUntil` at 10 ms. The task reads sensors, updates calibration/fusion, and copies one plain `SensorRuntimeSnapshot` under a mutex. LVGL and BLE never call I2C. The UI loop only copies the latest snapshot and maps it to `SensorHealth`/`CalibrationHealth`.

- [ ] **Step 3: Connect calibration lifecycle and progress**

When no valid calibration exists and LIS2MDL is present, enter `Calibrating`. Compute progress as the minimum of sample completion, axis-span completion, and octant coverage completion. Persist and transition to `Ready` only after all validation gates pass. A long press on the centered calibration surface restarts collection while preserving the saved record until success.

- [ ] **Step 4: Preserve USB override semantics**

When `sim on` is active, the diagnostic state replaces heading, health, and calibration inputs but leaves the real sensor task running for logs. `sim off` atomically returns to the latest real snapshot. USB commands never save calibration and never emit BLE actions.

- [ ] **Step 5: Run complete verification and flash**

Run:

```bash
bun run firmware:test
bun run firmware:test:sensor
bun run firmware:assets
bun run firmware:compile
bun run firmware:upload
```

Expected without LIS2MDL: normal boot and `SensorMissing`. Expected with LIS2MDL: calibration state begins or a valid stored calibration loads; no I2C/display watchdog resets occur.

- [ ] **Step 6: Commit sensor runtime integration**

```bash
git add firmware/roll-compass-board/sensor_runtime.h firmware/roll-compass-board/sensor_runtime.cpp firmware/roll-compass-board/roll-compass-board.ino firmware/roll-compass-board/display_ui.cpp firmware/roll-compass-board/compass_diagnostics.cpp
git commit -m "feat(firmware): drive compass os from physical heading"
```

### Task 5: Calibrate the final mount and validate independent rotation with iPhone BLE

**Files:**
- Modify: `firmware/roll-compass-board/README.md`
- Modify: `docs/operations/physical-compass-ble.md`
- Create: `docs/operations/roll-compass-calibration-checklist.md`

**Interfaces:**
- Consumes: a physically mounted LIS2MDL and completed Tasks 1–4.
- Produces: reproducible wiring, calibration, cardinal-heading, BLE route, and recovery evidence.

- [ ] **Step 1: Verify wiring and the shared I2C bus**

Power off before wiring. Connect `3V3`, `GND`, `GPIO7/SCL`, and `GPIO15/SDA`; use the approved axis orientation. Power on and confirm serial discovery at `0x1E`, QMI at `0x6B`, and no loss of touch/display/RTC/expander devices.

- [ ] **Step 2: Complete final-mount calibration**

Move the assembled device through a slow three-dimensional figure-eight until progress reaches 100%. Reboot and confirm the saved record loads with the same reference field, axis spans, octant mask `0xFF`, residual score, and CRC-valid status.

- [ ] **Step 3: Validate four cardinal orientations outdoors**

In a low-interference location, place the board level at north/east/south/west against a trusted reference. Record board heading and error. Acceptance: each error is at most `8°`, no anomaly state appears, and returning to north after a full rotation is within `5°` of the first north reading.

- [ ] **Step 4: Validate tilt and magnetic recovery**

At one fixed heading, tilt the board to approximately `±25°` pitch and roll. Acceptance: heading remains within `10°`. Briefly approach a known magnetic interference source; acceptance: the red needle hides after the debounce, the anomaly copy appears, and credible guidance returns only after two healthy seconds away from the source.

- [ ] **Step 5: Validate real iPhone BLE independent rotation**

Run a V2 journey on the physical iPhone in the foreground. Keep the phone still and rotate the board through `0°`, `90°`, `180°`, and `270°`. Acceptance: the needle continues to point toward the same world-space route target, distance follows the phone, stale BLE hides direction after six seconds, reconnect requires a fresh v2 frame, and stop/continue/confirm/reveal intents remain sequence-guarded.

- [ ] **Step 6: Document evidence and commit the field-ready handoff**

Record date, firmware commit, board model, LIS2MDL module, mounting orientation, calibration metrics, cardinal errors, tilt errors, BLE reconnect result, and known enclosure limitations.

```bash
git add firmware/roll-compass-board/README.md docs/operations/physical-compass-ble.md docs/operations/roll-compass-calibration-checklist.md
git commit -m "docs: validate independent roll compass heading"
```
