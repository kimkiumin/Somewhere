# iPad Portrait Exhibition Adaptation Design

**Date:** 2026-08-25

**Status:** Proposed for owner review

## Purpose

Extend the existing native `Roll the compass!` iPhone application into one
Universal iOS/iPadOS application that presents the collaborator-approved
compass concept convincingly on a portrait-mounted iPad. Preserve the current
backend, recommendation behavior, journey state machine, hidden-destination
rules, and iPhone experience.

The target exhibition hardware is described as an M1 iPad Pro. Apple names the
M1 11-inch model `iPad Pro (11-inch) (3rd generation)` and the M1 12.9-inch
model `iPad Pro (12.9-inch) (5th generation)`. The layout must support both so
the naming discrepancy does not block implementation. It must also remain
usable on the collaborator's iPhone 13.

## Authority and Scope

- The owner's latest directions and the approved V2 blueprint remain product
  authority.
- The collaborator's compass shell, needle, typography, visual mood, and
  interaction sequence remain the visual baseline.
- The backend, Worker, API contracts, recommendation algorithm, persistence,
  and disclosure rules do not change.
- This work changes the native app, native tests, iOS build configuration, and
  iOS operating documentation only.
- The existing physical-display and BLE documents remain future integration
  authority. This adaptation does not invent firmware or claim live BLE
  support.

## Chosen Approach

Use one Universal target with two responsive presentations:

1. **Compact presentation** for iPhone-sized windows, including iPhone 13.
2. **Portrait exhibition presentation** for regular-width iPad windows.

Layout decisions use the available window width, height, Dynamic Type, and
size class. They never branch on a model name. The app declares support for
both device families with `TARGETED_DEVICE_FAMILY = "1,2"`.

This approach preserves one state tree and one API client while allowing the
iPad to look intentionally composed rather than like a stretched or centered
iPhone screenshot.

## Orientation and Window Policy

- The exhibition baseline is portrait full screen.
- The iPhone remains portrait.
- The layout still responds safely if an iPad window becomes narrower. A
  regular-width presentation falls back to the compact presentation before
  content clips.
- Guided Access is the recommended exhibition lock. The app does not implement
  its own kiosk escape prevention.
- Safe areas are respected; no control depends on exact physical pixels.

## Shared Layout System

Add a small native layout policy that derives immutable metrics from the
available container:

- `compact`: width below 700 points or an accessibility Dynamic Type size.
- `exhibition`: width at least 700 points with non-accessibility Dynamic Type.
- Compact content maximum width: 520 points.
- Exhibition content maximum width: 1,080 points.
- Exhibition horizontal margin: 36 to 52 points, clamped by available width.
- Exhibition compass diameter: 410 to 520 points, clamped by available height.
- Minimum interactive target: 44 points.

The thresholds are layout policy, not device detection. The 11-inch M1
portrait canvas is approximately 834 by 1,194 points, while the iPhone 13 is
390 by 844 points; both remain first-class verification sizes.

## Screen Composition

### Launch

- Keep the collaborator's wordmark at top left and settings control at top
  right.
- Keep the supplied compass as the dominant center object.
- Tapping the compass starts the current journey using the current conditions.
- `탐색 조건` switches to a conditions surface; it does not move the user down
  a long page.
- The default iPad and iPhone launch surfaces fit without scrolling.

### Conditions

- Replace the current scroll-to-second-page interaction with an explicit local
  surface transition and working Back control.
- On iPad, arrange restaurant, party size, walking time, budget, location, and
  start controls in a balanced two-column grid.
- On iPhone, keep a single compact column. Scrolling is permitted only when the
  content or accessibility text cannot fit; scrolling is not the navigation
  mechanism.
- Dietary conditions and allergies remain in Settings.

### Following and Near

- Keep the same compass shell and animated needle.
- On iPad, place the compass in the dominant left/central field and place
  direction, remaining distance, allowed disclosure, and safety status in one
  restrained adjacent rail.
- Keep `멈춤` anchored and visible without scrolling.
- On iPhone 13, retain the existing single-column compact composition.
- The needle remains hidden for untrusted, paused, and recovery states.

### Ready, Finding, and Route Recovery

- Use the same compass continuity as the launch and guidance screens.
- On iPad, pair the instrument with the current phase or recovery actions in a
  two-region composition.
- Recovery choices remain explicit and the Stop action remains reachable.

### Arrival, Reveal, Stop, and Recovery

- On iPad, place revealed destination content and next actions side by side
  where the state permits it.
- Do not reveal any additional destination field compared with the existing
  projection.
- Stop confirmation, reveal reason, feedback, and external-map warning use a
  bounded centered sheet instead of stretching edge to edge.
- Long reason lists and profile option lists may scroll inside their bounded
  content region.

### Error and Empty States

- No-fit, expired, and connection-error surfaces use a centered maximum-width
  composition on iPad.
- Error overlays must remain readable and dismissible at both target sizes.

## Exhibition Sensor Behavior

All M1 iPad Pro models provide a digital compass, but only Wi-Fi + Cellular
models provide GPS/GNSS. Therefore:

- Release behavior continues to use real Core Location and heading.
- A Cellular iPad can be field-tested with real GPS after signing and device
  installation.
- A Wi-Fi-only exhibition iPad uses the existing Debug-only route and heading
  replay. Test controls and simulated values never enter Release builds.
- The app must show an honest unavailable or permission state instead of
  pretending that Wi-Fi positioning is production-grade GPS.

## Physical Compass Boundary

The iPad remains responsible for destination identity, route, location,
recommendation, and future BLE-central duties. The physical device remains a
minimal direction/status display. The iPad layout may reserve a small status
location for future device connectivity, but this work does not add a fake
connection control or change the BLE contract.

## Accessibility and Motion

- Preserve all current accessibility identifiers so existing E2E tests remain
  meaningful.
- Add identifiers only for new layout containers or exhibition-only evidence.
- Preserve VoiceOver wording, minimum target sizes, Reduce Motion behavior,
  contrast, and hidden-destination privacy.
- Accessibility Dynamic Type may use the compact/scrollable fallback even on
  iPad; fitting every control into one screen must not cause clipping.

## Verification Matrix

### Simulator

- iPad Pro (11-inch) (3rd generation), portrait, iOS 26.5.
- iPad Pro (12.9-inch) (5th generation), portrait, iOS 26.5.
- iPad Pro 11-inch (M4), portrait, iOS 26.5 as a nearby-width regression.
- iPhone 13, portrait, iOS 26.5.
- Existing iPhone 15 Pro Max lane remains intact.

For each primary device, verify launch, conditions, ready, following, near,
route recovery, paused, stop confirmation, stopped, completed, arrived,
reveal, feedback, no-fit, settings, and error presentation.

### Automated checks

- Unit-test the layout classification and metric clamps.
- Run all native unit tests on iPad and iPhone destinations.
- Run native UI journey tests on the M1 11-inch iPad and iPhone 13.
- Run virtual field E2E with deterministic Simulator location and heading.
- Capture named screenshots for each primary state on the M1 11-inch iPad.
- Assert that primary controls are present and hittable without scrolling at
  the default content size.
- Re-run the existing app, server, contract, and Worker E2E suites as unchanged
  regression evidence.

### Physical devices

- Install the signed Debug build on the owner's iPad after it is connected and
  paired with the Mac.
- Record the model identifier to resolve 11-inch versus 12.9-inch and Wi-Fi
  versus Cellular.
- Verify portrait presentation, taps, relaunch, location permission, heading,
  screen idle behavior, and a complete demonstration journey.
- Install the same Universal build on the collaborator's connected iPhone 13
  using an Apple signing setup that includes that device.
- The real iPhone 13 installation is not considered complete until the device
  is physically connected or otherwise registered for the selected signing
  team.

## Acceptance Criteria

1. The same build installs on the target iPad and iPhone 13.
2. The collaborator's compass and mood remain visually dominant.
3. Launch and active guidance fit in one portrait screen at default text size.
4. Conditions use explicit screen navigation rather than scroll position.
5. Stop is always visible during active guidance.
6. The compass needle never leaves the dial and is hidden when guidance is not
   trustworthy.
7. No backend or journey-contract behavior changes.
8. Existing iPhone tests and new iPad tests pass.
9. Wi-Fi-only iPad limitations are represented honestly.
10. The final screenshot set shows every primary iPad state for collaborator
    review.

## Explicit Non-goals

- No backend refactor or endpoint change.
- No recommendation-algorithm change.
- No iPad-only fork or duplicated app target.
- No map-first interface.
- No replacement of collaborator artwork.
- No ESP32 firmware or unverified BLE claim.
- No App Store, TestFlight, or external-device installation claim before the
  required signing and physical-device checks occur.
