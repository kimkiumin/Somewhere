# Navigation and iOS Architecture

Status: approved design, pending written-spec review

## Delivery Sequence

```text
existing web prototype
→ web GPS and heading spike
→ native iOS field-test app
→ optional BLE integration
```

The web spike tests browser sensor behavior and route mathematics. The field-test baseline is a native iOS app because location, heading, notifications, and later Bluetooth integration are product-critical. SwiftUI with Core Location, User Notifications, and Core Bluetooth is the default technical direction; an implementation ADR may revise it only after a bounded spike demonstrates a lower-risk alternative.

## Component Boundaries

### iOS Client

- constraint and disclosure settings
- permissions and consent UI
- compass rendering
- location and heading collection
- route progress and confidence state
- stop, reveal, route recovery, and place feedback
- local preference memory
- notification handling
- later BLE central role

### Backend

- provider adapters
- candidate normalization and enrichment
- LLM merit interpretation and rule validation
- random selection and audit receipt
- hidden destination session
- feedback eligibility and consented analytics

### Route Adapter

Common request:

```text
origin
destination
walking preferences supported by provider
```

Common response:

```text
route_id
provider
polyline or ordered vertices
total_distance
estimated_duration
route timestamp
provider confidence/status
```

## Guidance Engine

```text
current location
→ reject stale or low-accuracy samples
→ project onto current route corridor
→ select a forward look-ahead point
→ compute true bearing to that point
→ subtract device heading
→ smooth bounded angular changes
→ update compass arrow and remaining route distance
```

The arrow follows the walkable route, not a straight line through obstacles.

Heading and course are distinct:

- Heading describes where the device points.
- Course describes where the user moves and is only reliable after movement.

The guidance engine can blend them when speed and accuracy permit, but must expose confidence rather than pretending certainty.

## Confidence States

| Condition | Behavior |
|---|---|
| valid route, location, and heading | normal arrow |
| heading invalid or magnetically disturbed | pause precision cue and request recalibration |
| location accuracy poor | hold last trustworthy route progress and show low confidence |
| temporary route API outage | continue from cached route if user remains inside corridor |
| user leaves route corridor | request reroute |
| cached route and current location conflict | stop directional guidance |
| no trustworthy recovery | offer external map or Stop |

Direct destination bearing is not used as a silent substitute for a missing walking route. If offered as an emergency orientation cue, it is explicitly labeled and never represented as a safe path.

## Arrival

Arrival is not based on one raw distance sample. The initial implementation combines:

- route endpoint proximity
- horizontal accuracy
- repeated in-range samples or short dwell
- route-progress consistency

Exact thresholds are technical hypotheses calibrated in the first 5-8 participant test. False arrival and missed arrival are logged separately.

## External Map Handoff

An external map is a safety fallback, not the primary interface.

- Tell the user that handoff can reveal the destination.
- Use the selected provider's supported link or SDK contract.
- Record handoff as route recovery, not preference-driven recommendation failure.
- Let the user return to Somewhere when technically possible.

## Notifications

The app asks for notification permission in context, before the first delayed place-feedback request rather than bundling it with unrelated consent.

- Initial feedback eligibility: 60 minutes after arrival.
- Authorized: one notification.
- Denied: show feedback on next app launch.
- The delay remains a versioned experiment parameter.

## Development Diagnostics

The production experience has no visible map. A developer-only diagnostic view may show:

- route geometry
- raw and filtered location
- heading and course
- accuracy radius
- selected look-ahead point
- route corridor and deviation

This view must never ship as a candidate-browsing or user navigation surface.

## Verified Technical Basis

- Apple Core Location exposes location, heading, accuracy, region monitoring, and background-related controls through `CLLocationManager`: https://developer.apple.com/documentation/corelocation/cllocationmanager
- Apple documents invalid or disturbed headings through `headingAccuracy`: https://developer.apple.com/documentation/corelocation/clheading/headingaccuracy
- Notification permission is user-controlled and should be requested in context: https://developer.apple.com/documentation/UserNotifications/asking-permission-to-use-notifications
- Core Bluetooth provides the iOS BLE integration surface for the stretch prototype: https://developer.apple.com/documentation/corebluetooth

These APIs demonstrate platform capability, not field accuracy. Physical testing remains required.
