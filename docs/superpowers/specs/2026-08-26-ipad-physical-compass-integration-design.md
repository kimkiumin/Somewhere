# iPad portrait and physical compass integration design

**Date:** 2026-08-26

**Status:** Approved by owner

**Supersedes:** The side-by-side iPad guidance and arrival composition, and the
BLE non-goal, in `2026-08-25-ipad-portrait-exhibition-design.md`. All unchanged
parts of that document remain in force.

## Outcome

Ship one Universal `Roll the compass!` build for a portrait-mounted iPad Pro
11-inch (2nd generation) and an iPhone 13, while retaining the existing V2
backend and journey state machine. The iPad must look like a proportionally
enlarged version of the collaborator-approved iPhone composition, not a small
phone card floating in a tablet canvas and not a dashboard.

The same app may act as the BLE central for the Waveshare
ESP32-S3-Touch-LCD-2.1 Rev 2.0 companion. Only one app host owns the board at a
time. For an iPad exhibition the iPad owns it; for an iPhone demonstration the
iPhone owns it.

## Product and visual authority

- The owner's latest directions, root `BLUEPRINT.md`, and linked V2 documents
  remain product authority.
- Keep the collaborator's supplied compass shell and red needle, warm paper,
  restrained cards, blackletter wordmark, hidden-destination disclosure, and
  existing interaction order.
- Keep the backend, route trust rules, recommendation algorithm, server
  contracts, Stop flow, reveal boundary, and persistence unchanged.
- Do not add a map-first surface, restaurant ranking, destination identity
  before reveal, or a second iPad-only app target.

## Responsive composition

Layout is selected from available space and Dynamic Type, never a device model
string. Compact iPhone behavior remains the accepted iPhone 13 baseline.

On a regular-width portrait iPad:

- Use a single dominant vertical rhythm and consume the canvas deliberately.
- Launch keeps wordmark/header, large compass, and primary controls in one
  viewport without scroll-position navigation.
- Conditions remain an explicit screen with Back. Controls fill the available
  portrait width and height; two narrow dashboard columns are not the goal.
- Following and Near use this order: direction card, large compass, remaining
  information, Stop. There is no adjacent information rail.
- Compass diameter is clamped to 58–64% of available width and remains inside
  the safe vertical budget. The needle stays within the dial.
- Arrival/reveal content uses approximately 80% of available width and a
  vertical reveal hierarchy. It is not split into two small columns.
- Stop remains visible and hittable without scrolling at default text size.
- Accessibility sizes may use the compact/scrollable fallback when required to
  prevent clipping. Scrolling is a fit fallback, never the screen-navigation
  mechanism.

## Disclosure and copy corrections

- Active guidance shows relative direction, remaining distance, and only the
  disclosure allowed by the current projection.
- Do not render an exact road name in active guidance. A future action may say
  `다음 동작: 우회전`, but not `테스트로에서 우회전`.
- Use `목적지 숨김`; remove stale `보물 숨김` wording.
- Error presentation must not cover the header, compass, or primary action.

## BLE ownership and app surface

BLE board control is opt-in and locally persisted. The app does not scan until
the user enables this device as the board host. Enabling one host is an
exhibition operating decision; automatic arbitration between iPad and iPhone
is explicitly out of scope.

Settings provides:

- a `보드 연결` control;
- state values for Off, Scanning, Connecting, Connected, Stale, Bluetooth
  unavailable, and Disconnected;
- a concise instruction that only one nearby iPad/iPhone should have board
  control enabled.

Active journey screens may show a quiet connection status, but a board problem
must never block the phone/tablet journey or crowd the compass.

## BLE wire hardening

The existing BLE v1 UUIDs and safe projection fields remain. Harden their
transport rules:

- Finish every in-flight logical frame before sending a replacement. Coalesce
  only the not-yet-started queued snapshot to the newest state.
- Define all 512-byte limits and display-string limits in UTF-8 bytes. Truncate
  only on Unicode scalar boundaries.
- Split both phone writes and board notifications into ATT-safe chunks.
- Start a new receive epoch on each connection. A board accepts only strictly
  increasing positive state sequence numbers within that epoch.
- Clear fresh-state/action authority on disconnect. A reconnect remains stale
  until a new complete state frame is accepted.
- Use local monotonic receive time for stale behavior. A phone wall-clock
  timestamp is diagnostic only.
- Reject unknown versions, actions, non-finite numbers, malformed UTF-8,
  invalid sequences, and oversized frames without changing the last safe
  display state.
- Keep board intents guarded by the latest advertised action set and route them
  through `JourneyStore`; they never call the server directly.
- Remove the unused `review` board action from v1 instead of carrying a no-op.

## Simulator and physical evidence

Release uses the real CoreBluetooth client. Debug/UI-test builds may inject a
deterministic board client for Off, Connecting, Connected, Stale, and event
states. This is labeled test behavior and cannot establish physical BLE proof.

Physical acceptance requires the actual board over USB/BLE:

1. compile without flash erase;
2. upload and capture serial boot;
3. connect from exactly one selected app host;
4. observe fresh following/near/paused/reveal-safe states;
5. trigger board Stop/Continue/Confirm Stop/Reveal intents and verify the app's
   guarded state transition;
6. disconnect/reconnect and verify no stale arrow or stale action remains.

If the board or target iPad/iPhone 13 is not connected, record that lane as
`BLOCKED` rather than claiming it passed.

## Firmware display

- Keep the round 480×480 compass as the dominant board composition.
- Never show the destination name or address.
- Use Korean labels for the known safe app taxonomy; do not replace Korean
  categories with a misleading English `CLUE` placeholder.
- Stay below 90% flash usage so the font/display change keeps practical
  headroom.
- QMI8658 remains diagnostic only because it is not a magnetometer. Direction
  continues to be computed by the iOS/iPadOS host.

## Acceptance criteria

1. iPad following is a full-canvas vertical composition matching the approved
   iPhone visual language, with a compass at 58–64% of width.
2. iPad arrival uses about 80% of width and conditions use the portrait canvas
   without scroll-position navigation.
3. iPhone 13 compact layout and V2 backend behavior remain unchanged.
4. No exact road name is visible during hidden active guidance; stale copy and
   header-covering errors are removed.
5. Board control is opt-in, reports honest state, and documents one active host.
6. Logical BLE frames cannot interleave; UTF-8, sequence, reconnect freshness,
   chunking, and guarded-event tests pass.
7. Firmware compiles below 90% flash and its automated parser/display checks
   pass.
8. Native unit/source gates and iPad/iPhone 13 UI/E2E matrices pass.
9. Physical BLE/device claims are made only with captured hardware evidence.

