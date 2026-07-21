# UX State Model

Status: approved design, pending written-spec review

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
| `S3 One Place Ready` | Present one acceptable hidden place | distance, representative menu, price band | commit or stop |
| `S4 Committed` | Mark explicit acceptance | short transition into guidance | following |
| `S5 Following` | Guide without a visible map | route-aware compass and three-row display | near, reveal, route recovery, or stop |
| `S6 Route Recovery` | Handle low-confidence guidance | recalibration, reroute, or external map fallback | following or stop |
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
- distinctive copy that trivially identifies the venue

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
- Continuous movement is an approved visual direction. Reduced walking-time gaze is not used as the deciding criterion for this row.

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
→ warning: 정말 중단할까요?
→ press the same control again to confirm
→ guidance ends immediately
→ stop reason appears
→ reason saved locally and, only with consent, anonymously uploaded
→ stopped
```

The second press confirms stop; it does not delay route termination after confirmation. The reason screen follows the stop and never blocks the safety action.

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

If the user requests a new recommendation within five minutes of stop confirmation:

1. Reopen constraints.
2. Route the user based on the stop reason.
3. Require relevant condition review or reset.
4. Present a normal confirmation step.
5. Build a new qualified pool and select one destination.

Reason-specific behavior:

- Route/safety problem: attempt route recovery or external map before replacing a valid destination.
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
