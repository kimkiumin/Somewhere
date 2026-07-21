# UX State Model

Status: approved written blueprint (2026-07-21)

## Principles

- The user sees one destination, never a candidate set.
- Safety exits end guidance before any feedback question.
- Exact venue identity is hidden by default, not made impossible to access.
- Recovery from a failed recommendation is a new decision process, not Reroll.
- The active compass carries only direction plus a fixed three-row information display.

## Main State Flow

| State | Purpose | User-visible content | Exit |
|---|---|---|---|
| `S0 Onboarding` | Explain the service and request required permissions in context | product promise, data controls | continue |
| `S1 Constraints` | Capture non-negotiable conditions | category, maximum distance/time, budget, dietary/accessibility limits, disclosure setting | find one place |
| `S2 Finding` | Build and validate the candidate pool | calm progress state; no candidates | success or recoverable failure |
| `S3 One Place Ready` | Present one evidence-qualified hidden place | distance, representative menu, price band | commit or stop |
| `S4 Committed` | Mark explicit acceptance | short transition into guidance | following |
| `S5 Following` | Guide without a visible map | route-aware compass and three-row display | near, reveal, route recovery, or stop |
| `S6 Route Recovery` | Handle technical guidance failure | recalibration, reroute, cached route, or user-selected external map | following or stop |
| `S7 Near` | Indicate proximity | compass, remaining distance, near signal | arrived or recovery |
| `S8 Arrived` | Confirm arrival without demanding immediate rating | arrival confirmation | feedback pending |
| `S9 Feedback Pending` | Wait until the visit can be judged | no blocking UI | notification or next launch after 60 minutes |
| `S10 Place Reaction` | Collect one place-level response | dislike, like, love, did not visit | complete |

## Pre-Reveal Information

The maximum disclosure level is fixed even when the user changes settings.

### Minimal

- distance
- broad category in the menu row

### Standard

- distance
- one representative menu, with a second only when reliable data exists
- price band

Standard is the first-use default. The last selection is remembered on the device. The interface does not show a condition-pass badge because condition compliance is mandatory.

Always hidden by default:

- venue name
- exact address or map position
- photos
- reviews and ratings
- distinctive menu names or copy that trivially identifies the venue

Distinctive menu names are normalized to a supported broad dish category. If no faithful broad category can be derived from source data, the menu row falls back to the venue's broad category. The LLM may classify supported source text but may not invent a replacement menu. This disclosure rule applies consistently to the app, physical display, notifications, logs, study screenshots, and map-handoff warnings.

## Compass Display

```text
distance
representative menu 1 · representative menu 2
price band
```

- The row positions never change.
- The menu row moves continuously in one direction and loops without reversing.
- One menu remains the priority; a second menu is optional.
- Text speed, pixel density, Korean readability, and power impact are hardware-test variables.
- Continuous movement is the prototype baseline. Final hardware use remains conditional on legibility, walking safety, reduced-motion, display-technology, and power tests.

## Connection and Direction Status

- Use familiar cellular-antenna and Wi-Fi icons for network state.
- Use the familiar Bluetooth icon for the phone-to-compass connection.
- Keep these icons in a small status area separate from the three information rows.
- If network, device connection, or direction calculation is unavailable, suppress the directional claim and rotate the compass slowly without pointing to a bearing.
- When trustworthy data returns, recompute the route-relative direction before the needle points again.
- During a user-requested pause or confirmed stop, the needle stays still or is hidden. It does not use the error rotation.
- Do not invent a novel icon when a conventional platform symbol communicates the state.

## Destination Reveal

`목적지 확인` lives in a secondary menu and remains available at any time.

- It reveals venue name and address.
- Guidance continues after reveal.
- Reveal is not recorded as stop or failure.
- Opening an external map may reveal the destination and must be disclosed before handoff.

## Stop Flow

```text
Following
→ tap Stop
→ all directional guidance pauses immediately
→ warning: 정말 중단할까요?
→ choose Continue or Confirm stop
→ Continue resumes the same guidance session
→ Confirm stop ends guidance
→ stop reason appears with Skip
→ reason saved locally and, only with separate consent, included in minimized product-improvement upload
→ stopped
```

The same physical control may act as `Confirm stop` after the warning, but the confirmation interface must also make `Continue` understandable. The reason screen follows every confirmed stop, including a safety stop, and never blocks exit.

Initial stop reasons:

- safety concern
- route or sensor problem
- hard condition mismatch
- venue situation problem
- simple change of mind
- schedule changed

The taxonomy must remain short and mutually understandable. It is versioned so later analysis does not merge incompatible categories.

## Recommendation Recovery

There is no active Reroll control.

The five-minute rule applies only when the user requests a new recommendation after the journey has ended. It never delays pause, confirmed stop, reveal, external-map access, or another safety action.

If the user requests a new recommendation within five minutes of stop confirmation:

1. Reopen constraints.
2. Route the user based on the stop reason.
3. Require relevant condition review or reset.
4. Present a normal confirmation step.
5. Build a new qualified pool and select one destination.

Reason-specific behavior:

- Safety concern: keep guidance ended and never automatically resume the same place or route or open an external map. Offer only user-controlled choices: finish, reveal the destination, open an external map, or request a new recommendation.
- Route or sensor problem: offer recalibration, reroute, cached-route recovery, or a user-selected external map before replacing a still-valid destination.
- Condition/venue problem: change the relevant condition before a new recommendation.
- Simple change of mind: review all constraints before a new recommendation.
- Schedule change: finish the adventure.

After five minutes, a new start uses the normal start flow. Five minutes is an initial anti-impulse hypothesis, not proof of user intent.

The proposed button sequence or needle-alignment mini-game is not an MVP requirement. It remains a product-interaction experiment and must never gate safety stop or lack an accessible alternative.

## Feedback

The app asks only about the destination:

```text
이 장소는 어땠나요?
[싫어요] [좋아요] [매우 좋아요] [가지 않았어요]
```

- Initial delay: 60 minutes after arrival.
- If notifications are allowed: send one notification.
- If notifications are denied: show the same one-step prompt on next launch.
- Process quality is measured behaviorally, not with another question.
- The 60-minute delay is an initial value to revise using response quality.
