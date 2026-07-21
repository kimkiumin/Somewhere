# Web and iOS Sensor Spike Protocol

## Purpose and scope

This is a supervised, developer-only feasibility protocol for timestamped location and heading diagnostics. It contains no destination search, candidate identity, map, or product navigation surface. It tests whether browser and native platforms can supply enough raw evidence for later work; it does not validate route guidance, arrival, or background behavior.

## Setup record

Create one record per platform/build before each session:

| Field | Required value |
| --- | --- |
| Run ID and date/time | Local timestamp and observer initials |
| Device model | Exact phone model |
| OS and version | Exact OS version |
| Browser and version | Web run only; write `native` for iOS |
| App build | Git commit plus Xcode build number for iOS; Git commit for web |
| Secure-context URL | Exact `https://` URL for web; `n/a` for native |
| Permission state | Location and orientation state before and after the run |
| Environment | Open-sky/urban/interior note, weather, and known magnetic interference |

Use a secure `https://` URL for browser runs. A plain `http://` or local file URL is not evidence for the web capability gate.

## Required runs

Record raw timestamped readings throughout. Capture the output file or screenshots plus an observer log; do not substitute narrative summaries for the raw diagnostic evidence.

| Run | Procedure | Required record |
| --- | --- | --- |
| Stationary N/E/S/W | At one stationary open-sky point, hold the device facing north, east, south, then west for 30 seconds each. | At least 30 location samples and 30 heading samples per orientation, median heading, median location accuracy, and invalid/missing-heading count. |
| 50 m straight walk | Walk a measured straight 50 m segment at a normal pace. | Start/end timestamps, at least 30 samples, median horizontal accuracy, heading failures, and whether readings remain available while moving. |
| One 90-degree turn | Walk straight, make one observed 90-degree turn, and continue. | Heading readings before/after the turn, observed turn time, median measured change, failures, and time until three post-turn valid headings. |
| One route deviation | Mark a simple observer-known straight reference line without displaying it in the diagnostic, then deliberately walk at least 10 m away from it. | Timestamped position readings, the observer's measured deviation, sample count, median accuracy, and all heading failures. This is capture evidence only, not rerouting validation. |
| Screen lock/unlock | During a stationary or walking run, lock for 30 seconds and unlock. | Lock/unlock timestamps, first post-unlock location and heading times, recovery time, and missing/error readings. |
| Permission denied | Deny location and, where separately requested, orientation permission; restart the diagnostic. | Permission prompt/result, displayed error, absence of a crash, and confirmation that no unauthorized reading is represented as valid. |

## Per-run measurements

For every required run record sample count, median `horizontalAccuracy` in meters (or browser `accuracyM`), every heading failure/error, and recovery time in seconds. A heading failure includes a missing sample, `headingAccuracy < 0` on iOS, a denied/unsupported orientation capability, a browser orientation error, or a visibly implausible jump; retain the raw values and observer note rather than silently excluding it.

For cardinal runs, compute the circular median or report the raw heading series when the sample count is too small. For the 90-degree turn, report the median heading before and after the turn and the wrapped delta. Recovery time is the interval from unlock or permission restoration to the third consecutive valid location-and-heading pair; record `not recovered` when that never occurs within 60 seconds.

## Feasibility evidence threshold

A platform/run is recorded as a provisional feasibility pass only when:

1. The setup record is complete, including device, OS, browser/build, and secure URL where applicable.
2. Each non-denied run has the required sample count and preserves timestamped raw diagnostic evidence.
3. Cardinal runs show a median direction within 30 degrees of the observed orientation, and the 90-degree run shows a wrapped median change between 60 and 120 degrees.
4. The 50 m and route-deviation runs preserve locations with a recorded median accuracy; no fixed accuracy threshold is claimed until field evidence exists.
5. The lock/unlock run either recovers within 60 seconds with the defined three consecutive valid pairs or is recorded as a failure with its evidence.
6. Denied permissions produce a clear diagnostic error and do not crash or fabricate valid readings.

## Evidence limits and gate decisions

Browser results are feasibility evidence only. They cannot establish native iOS reliability, background behavior, route accuracy, accessibility of a walking path, magnetic robustness, or product navigation safety. Device orientation values may vary by browser, permission state, screen orientation, calibration, and hardware; raw browser heading is never proof of a production compass contract.

The iOS simulator can demonstrate project build and unit-test execution only. It does not satisfy the real-device location/heading gate. A real iPhone run is required for that gate, and the physical-compass orientation contract remains a separate gate.

Mark a run `PASS`, `FAIL`, or `BLOCKED` with its evidence path. `PASS` means only that this bounded diagnostic met the threshold above; it is not approval to ship navigation, enable background location, or claim an integrated route experience.
