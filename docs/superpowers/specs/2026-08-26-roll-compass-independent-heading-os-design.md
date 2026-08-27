# Roll Compass independent-heading OS design

## Outcome

Turn the Waveshare ESP32-S3-Touch-LCD-2.1 companion into a circular instrument
that keeps its needle pointed toward the hidden target when the user rotates or
tilts the board. The iPhone remains authoritative for location, route progress,
destination bearing, journey state, and all server mutations. The board becomes
authoritative only for its own physical orientation.

The visible result is a coherent "Roll Compass OS" rather than a square mobile
layout placed behind round glass: a full-bleed antique dial, an exactly centered
needle, restrained state transitions, and controls that remain inside the
circular touch area.

This design extends the existing BLE prototype. It does not make the board a
phone-free GPS navigator, does not add Wi-Fi to the journey path, and never
sends or renders destination identity before reveal.

## Product and hardware boundaries

- The iPhone owns GPS, trusted-route validation, the absolute target bearing,
  distance, confidence, disclosure, actions, and destination identity.
- The board owns its magnetic heading, tilt correction, needle animation,
  local calibration state, and circular presentation.
- BLE is the journey transport. USB remains the flashing, logging, and
  deterministic diagnostic transport.
- Wi-Fi stays disabled for the journey path.
- The board's onboard QMI8658 supplies acceleration and angular velocity only.
  It cannot establish absolute yaw because it has no magnetometer.
- A 3-axis LIS2MDL breakout is the reference external magnetometer. It shares
  the board's exposed I2C bus at address `0x1E`, which does not conflict with
  the board's occupied addresses (`0x15`, `0x20`, `0x51`, `0x6B`, `0x7E`).
- The reference wiring is `3V3`, `GND`, `SCL/GPIO7`, and `SDA/GPIO15`.
- The magnetometer must be fixed in the final enclosure away from the buzzer,
  battery, magnets, steel fasteners, and high-current wiring. Calibration is
  invalidated when its mounting orientation or surrounding hardware changes.

Primary hardware references:

- [Waveshare board documentation](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1)
- [Waveshare occupied I2C addresses](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1/FAQ)
- [ST LIS2MDL product specification](https://www.st.com/en/mems-and-sensors/lis2mdl.html)
- [Adafruit LIS2MDL Arduino wiring and library](https://learn.adafruit.com/adafruit-lis2mdl-triple-axis-magnetometer/arduino)
- [ST tilt-compensated eCompass guidance](https://www.st.com/resource/en/design_tip/dm00269987-computing-tilt-measurement-and-tiltcompensated-ecompass-stmicroelectronics.pdf)

## Runtime topology

```text
iPhone Core Location + trusted route
        │
        ├── target true bearing, magnetic declination, distance,
        │   journey phase, confidence, and guarded actions
        │                         BLE state v2
        ▼
ESP32-S3 compass runtime
        ├── LIS2MDL magnetic vector
        ├── QMI8658 acceleration + angular velocity
        ├── calibration + tilt-compensated heading fusion
        ├── target-relative angle
        └── Roll Compass OS state + spring-driven needle
                                  │
                                  └── guarded touch intent → iPhone
```

"Independent" means the board may rotate independently of the phone while the
needle stays correct. The phone is still required to provide the hidden route
target and distance.

## Firmware boundaries

The firmware is split into units with narrow responsibilities:

- `compass_sensor`: initializes the LIS2MDL and QMI8658, aligns their axes, and
  emits timestamped raw samples. It reports `missing`, `warmingUp`, `ready`, or
  `fault`; it does not know about BLE or LVGL.
- `compass_calibration`: stores and applies gyro bias, magnetometer hard-iron
  offset, and per-axis soft-iron scale. It computes coverage and quality and
  owns the guided figure-eight calibration session.
- `heading_fusion`: consumes calibrated samples and emits normalized magnetic
  heading plus a quality result. It uses acceleration for tilt compensation and
  the gyroscope for responsive short-term motion; magnetometer observations
  remove yaw drift.
- `compass_runtime`: pure state reduction. It combines connection freshness,
  journey state, target bearing, sensor health, calibration health, and time to
  produce one render model and an optional target-relative needle angle.
- `compass_diagnostics`: accepts USB-only diagnostic commands and feeds the
  same runtime interfaces with deterministic BLE and heading samples.
- `display_ui`: renders the current model and forwards only guarded touch
  intents. It does not parse wire frames or read sensors.
- `physical_compass_wire`: strictly parses BLE contract v2 and rejects older or
  malformed journey state rather than displaying an incorrect direction.

The Arduino/FreeRTOS plus LVGL stack remains the device platform. "Roll Compass
OS" is the product-level state shell and theme, not a Linux-style operating
system replacement.

## Direction model and BLE contract v2

BLE service and characteristic UUIDs remain unchanged. State and event frames
remain newline-delimited compact JSON with a 512-byte maximum. The contract
version changes from `1` to `2` because the meaning of direction changes from a
phone-relative arrow to a north-referenced target.

State example:

```json
{"v":2,"type":"state","seq":15,"phase":"following","d":420,"tb":315,"md":-8.2,"c":"credible","m":["한식 국물 요리"],"p":"medium","a":["stop"],"r":false,"ts":1787659200000}
```

New direction fields:

- `tb`: true-north target bearing in `[0, 360)`. This is the forward route
  lookahead bearing, not the destination identity and not the phone-relative
  UI arrow.
- `md`: signed magnetic declination in `[-180, 180]`, positive east. The iPhone
  derives it from the same valid Core Location heading sample as
  `trueHeading - magneticHeading` using shortest-angle normalization.

`tb` and `md` are present together only when route guidance is credible. The
board computes:

```text
boardTrueHeading = normalize(boardMagneticHeading + magneticDeclination)
needleAngle = shortestDelta(boardTrueHeading, targetTrueBearing)
```

The iPhone's existing on-screen arrow remains device-relative. To avoid mixing
the two models, `GuidanceReading` gains the unsmoothed north-referenced route
target bearing while retaining the existing smoothed `arrowDegrees` for the
iPhone UI. `HeadingSample` records declination whenever Core Location supplies
both valid true and magnetic headings.

Contract v1 journey state is not rendered as guidance by v2 firmware. A version
mismatch produces a calm update-required state; it never falls back to the old
relative arrow because that arrow becomes wrong when the board turns.

## Heading quality and calibration

The first hardware implementation uses a tilt-compensated magnetic heading
with gyroscope-assisted smoothing:

1. At boot, collect a stationary gyro-bias window while showing a short
   instrument-warmup state.
2. Apply the saved magnetometer offset and per-axis scale before fusion.
3. Use the accelerometer gravity vector to compensate pitch and roll.
4. Integrate gyroscope yaw between magnetometer observations for responsive
   movement.
5. Correct accumulated yaw toward the calibrated magnetic observation.
6. Suppress guidance when sample age, sensor health, calibration coverage, or
   magnetic-field plausibility falls outside the accepted range.

The calibration flow asks the user to move the device through multiple
orientations with an animated orbit. It reports progress from sample coverage,
not elapsed time. Calibration data is persisted only after minimum coverage and
residual-quality checks pass. Failed or interrupted calibration keeps the last
known valid calibration.

The needle is hidden when heading quality is not credible. The screen explains
one recovery action: connect the sensor, move away from magnetic interference,
or recalibrate. The firmware does not invent a heading from the gyroscope alone.

## Roll Compass OS states

The runtime chooses exactly one state:

- `boot`: parchment face fades in and the brass ghost needle performs one
  restrained sweep while the display and sensors initialize.
- `pairing`: slow brass breathing ring and centered "아이폰을 기다리는 중".
- `sensorMissing`: magnetometer mark with "방향 센서를 연결해 주세요"; BLE may
  remain connected, but no red guidance needle appears.
- `calibrating`: orbit animation and calibration progress around the rim.
- `ready`: connected and calibrated, waiting for a credible journey target.
- `guiding`: red needle, remaining distance, and one contextual stop action.
- `near`: warmer gold pulse and reduced copy; direction remains primary.
- `paused`: the compass quiets and an explicit centered continue/end choice
  replaces guidance.
- `arrived`: the needle settles into a brass seal and the board offers a reveal
  intent without showing destination identity.
- `stale`: dimmed dial and "아이폰에서 방향을 확인하는 중"; actions are disabled.
- `magneticAnomaly`: the last needle fades out and the OS asks the user to move
  away from interference or recalibrate.
- `updateRequired`: BLE contract mismatch; no journey data is rendered.

Connection, route, and sensor states are orthogonal inputs, but only this
single reduced state reaches the display. This prevents contradictory overlays
such as "connected" and "waiting" appearing together.

## Circular visual system

The display is a physical circle centered at `(240, 240)` with radius `240`.
The implementation uses two zones:

- A full-bleed art zone may extend to radius `240` and be clipped by the glass.
- Every essential label, indicator, and touch target must fit within radius
  `214`, including its rectangular corners.

Layout invariants:

- The static shell is optically and mathematically centered at `(240, 240)`.
- The rotating needle's hub is exactly `(240, 240)`.
- The asset generator crops the needle to its alpha bounds, adds a small
  transform margin, and emits pivot metadata; the UI never rotates a 520×520
  transparent canvas.
- The antique dial fills the display. No rectangular phone cards, corner pills,
  four-button rows, or controls below the visible circular edge remain.
- The `Roll the compass` wordmark is centered near 12 o'clock inside a maximum
  210-pixel width.
- Journey status is subordinate to the dial and occupies the upper inner arc.
- Remaining distance is centered near 6 o'clock.
- The normal journey has one centered lower soft key. The paused confirmation
  state may replace the dial content with two vertically arranged choices,
  both inside the radius-214 interaction zone.

The theme reuses the checked-in product direction: warm ivory, parchment,
ink, oxblood red, aged brass, and sage success. The Unifraktur wordmark is
converted to a small LVGL font subset from the checked-in licensed TTF. Korean
device copy uses a generated subset containing only the phrases present in the
state system so flash use remains bounded.

The neutral boot/calibration needle is brass. Oxblood is reserved for credible
journey direction. Animation is expressive but instrument-like: spring settling
for heading changes, a slow breathing connection ring, a short arrival seal,
and no constant particle field.

## Rendering and performance

- LVGL runs at a target of 40 frames per second for motion, with sensor sampling
  decoupled from render timing.
- Needle motion follows the shortest angular path using a fixed-step damped
  spring. It may overshoot subtly but must settle without oscillating.
- Image transform antialiasing is enabled for the tight needle sprite.
- The RGB panel uses two full RGB565 framebuffers in PSRAM with LVGL direct mode
  when the board preset and memory checks succeed. Two 480×480 RGB565 buffers
  require approximately 900 KiB, within the board's 8 MB PSRAM budget.
- Initialization falls back to the existing partial draw-buffer mode only if
  framebuffer allocation fails, and records the fallback over serial.
- Static shell art and font subsets are generated reproducibly from checked-in
  source assets.

## Touch behavior

Touch events remain intents. The board never changes server state directly.

- `guiding` and `near`: show one `stop` action when advertised by the phone.
- `paused`: show `continue` and `confirm-stop` only when advertised.
- `arrived`: show `reveal` only when advertised. The reveal happens on the
  iPhone; the board transitions to a neutral found state without identity.
- Other states: no journey action is active.

Every emitted event includes the latest accepted sequence. The iPhone repeats
its existing projection and sequence guards before performing any action.

## USB diagnostics without the magnetometer

The first implementation can be developed and visually checked before the
LIS2MDL arrives. A line-oriented USB diagnostic adapter feeds the same runtime
used by BLE and the real sensor:

```text
state guiding
target 315
heading 0
heading 90
sweep cw
state near
state calibrating
state sensor-missing
state anomaly
```

`target` changes the phone-provided absolute target. `heading` changes the
simulated board orientation. A correct implementation visibly keeps the target
fixed in world space as simulated board heading changes. `sweep` continuously
rotates the simulated board to expose pivot, clipping, tearing, and spring
problems.

Diagnostics cannot emit server mutations or bypass the BLE action guards. A
real sensor sample automatically takes precedence over simulated orientation
unless explicit diagnostic mode is enabled at boot.

## Failure and recovery

- LIS2MDL absent or I2C fault: show `sensorMissing`; keep BLE connected and
  accept safe journey state, but hide the needle.
- Calibration invalid: enter `calibrating`; never use raw uncalibrated heading
  as credible guidance.
- Magnetic anomaly: hide the needle after a short quality debounce and show one
  recovery instruction. Recover only after a stable healthy window.
- BLE stale for six seconds: enter `stale`, hide the needle, and disable touch
  actions.
- BLE reconnect: require one fresh accepted v2 snapshot before guidance returns.
- Invalid payload: preserve the last accepted data until it becomes stale.
- Contract mismatch: enter `updateRequired` immediately.
- Display double-buffer allocation failure: log it and use the existing safe
  rendering fallback.
- Reboot during calibration: retain the previously validated calibration and
  restart a new calibration session without persisting partial values.

## Validation

### Pure and host-side checks

- BLE v2 encoding/decoding, number bounds, version mismatch, and frame limits.
- Bearing normalization and shortest-angle behavior across north.
- Declination derivation for wraparound cases such as true `1°`, magnetic
  `359°`.
- Tilt-compensation vectors for level and tilted fixtures.
- Runtime state-reduction precedence for stale, missing sensor, anomaly,
  calibration, paused, and arrived states.
- Spring convergence and maximum overshoot bounds.
- Circular containment assertions for every essential and interactive object.

### Board checks over USB

- Render `0°`, `90°`, `180°`, and `270°` with the hub at `(240, 240)`.
- Run continuous clockwise and counter-clockwise sweeps for at least one minute
  without visible tearing, clipping, resets, or heap loss.
- Exercise every OS state and touch target from serial diagnostics.
- Verify stale-state suppression by stopping state input for more than six
  seconds.

### Hardware checks after LIS2MDL installation

- Confirm I2C discovery at `0x1E` with all onboard peripherals still working.
- Calibrate in the final physical mounting and reboot to verify persistence.
- Compare board heading at four cardinal orientations against a trusted
  reference in a low-interference outdoor location.
- Hold the phone still while rotating and tilting the board; the needle must
  continue pointing toward the same target within the accepted calibrated
  heading tolerance.
- Walk a real V2 route with the iPhone unlocked and foregrounded; verify BLE
  reconnect, near, pause, arrival, and reveal-intent behavior.

## Delivery order

1. Introduce pure direction/runtime models and BLE v2 tests on iOS and firmware.
2. Replace the board UI with the circular OS theme and tight-pivot needle.
3. Add USB diagnostic state and orientation injection; validate and flash the
   connected board without requiring the LIS2MDL.
4. Enable double-framebuffer rendering and tune motion on the physical screen.
5. Add LIS2MDL/QMI8658 sampling, calibration, fusion, persistence, and quality
   gates behind the same runtime interface.
6. Wire the sensor in the final physical mount, calibrate, and complete the
   independent-rotation field check with a real iPhone.

