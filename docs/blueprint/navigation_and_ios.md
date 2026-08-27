# Navigation and iOS Architecture

Status: approved written blueprint (2026-07-21)

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

### Physical Orientation Contract

The iPhone heading cannot be treated as the heading of a separately held compass. Before BLE implementation, choose and test one architecture:

1. The phone sends absolute route bearing, north-reference metadata, timestamp, and confidence; the physical compass measures its own heading and computes the device-relative needle angle.
2. The physical compass sends its own heading to the phone; the phone returns a device-relative bearing with timestamp and confidence.

The contract must declare true versus magnetic north, coordinate units, update cadence, staleness threshold, message ordering, and behavior after reconnect. Bench and walking tests cover magnetic interference, stale messages, packet loss, reconnect, and end-to-end latency. A BLE demo using only the phone heading does not validate physical pointing.

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

The physical UI uses conventional cellular-antenna and Wi-Fi icons for network state and a conventional Bluetooth icon for the phone-to-compass link. When the route bearing cannot be trusted because of network, connection, or direction-calculation failure, the compass suppresses precise pointing and rotates slowly. A user pause or confirmed stop is visually distinct: the needle stays still or is hidden.

## Safety and Technical Recovery

- A safety concern includes traffic, harassment, a dark or inaccessible-feeling route, or any situation in which the user feels unsafe.
- A safety stop ends guidance and does not automatically resume the same venue or route, reroute, or open an external map.
- After a safety stop, only the user may choose to finish, reveal the destination, open an external map, or request a new recommendation.
- A route, sensor, network, or connection problem may offer recalibration, cached guidance, reroute, or a user-selected external map.
- Restored data does not point immediately: the engine recomputes route position and confidence first.

Direct destination bearing is not used as a silent substitute for a missing walking route. If offered as an emergency orientation cue, it is explicitly labeled and never represented as a safe path.

## Arrival

Arrival is not based on one raw distance sample. The initial implementation combines:

- route endpoint proximity
- horizontal accuracy
- repeated in-range samples or short dwell
- route-progress consistency

Exact thresholds are technical hypotheses calibrated in Study A's 5-8 test sessions. False arrival and missed arrival are logged separately.

## External Map Handoff

An external map is a safety fallback, not the primary interface.

- Tell the user that handoff can reveal the destination.
- Use the selected provider's supported link or SDK contract.
- Record handoff as route recovery, not preference-driven recommendation failure.
- Let the user return to Roll the compass! when technically possible.

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

## Cited Technical Basis

- Apple Core Location exposes location, heading, accuracy, region monitoring, and background-related controls through `CLLocationManager`: https://developer.apple.com/documentation/corelocation/cllocationmanager
- Apple documents invalid or disturbed headings through `headingAccuracy`: https://developer.apple.com/documentation/corelocation/clheading/headingaccuracy
- Notification permission is user-controlled and should be requested in context: https://developer.apple.com/documentation/UserNotifications/asking-permission-to-use-notifications
- Core Bluetooth provides the iOS BLE integration surface for the stretch prototype: https://developer.apple.com/documentation/corebluetooth

These APIs demonstrate platform capability, not field accuracy. Physical testing remains required.
