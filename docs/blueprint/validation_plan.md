# Validation Plan

Status: approved written blueprint (2026-07-21)

## Research Claims

The field study tests separate claims:

1. Somewhere reduces the time and comparison needed to settle on one destination.
2. Users act on that destination and begin moving.
3. Users can maintain the choice without preference-driven restart.
4. The compass guidance can deliver users to the destination with acceptable recovery behavior.
5. The qualified random pool produces destinations users consider worthwhile.
6. The physical product form is understandable and desirable enough to justify further hardware development.

No single score represents all six claims.

## Study Sequence

### Study A / Roadmap Phase 3: 5-8 Test Sessions

Purpose: find severe usability and technical defects.

- Use dyads for the core shared-selection sessions; additional individual physical-handling sessions do not redefine the product audience.
- Include the first restaurant and cafe scenarios.
- Observe constraint setup, commit, compass use, Stop, reveal, recovery, and arrival.
- Test the high-fidelity physical mockup separately and, where possible, alongside the iOS experience.
- Use think-aloud only in dedicated usability runs; do not use it in timed decision comparison.
- Record route, sensor, and provider failures with timestamps.
- Revise the product after recurring problems, not after every isolated preference.

Outputs:

- corrected state flow
- stable event taxonomy
- route-confidence thresholds
- provider feasibility findings
- physical form selection
- frozen Study B / Roadmap Phase 4 protocol and decision thresholds

### Study B / Roadmap Phase 4: 10-15 Dyads, 20-30 People

Purpose: compare Somewhere with normal map/search behavior.

Use a within-dyad, counterbalanced design with the dyad as the primary analysis unit:

- Each dyad completes one matched decision using its normal map/search method.
- Each dyad completes one matched decision using Somewhere.
- Half use Somewhere first; half use the baseline first.
- Match category, area, budget, time window, and pair composition across conditions.
- Use non-overlapping eligible venue pools or another frozen carryover control.
- Record prior familiarity with the area, venue, and product condition.
- Restaurant and cafe results are analyzed separately.
- Party size is recorded but not used as a permanent product restriction.

The study remains exploratory at this sample size. Report paired differences, distributions, confidence intervals where appropriate, and qualitative failure causes. Do not claim population-wide market validation.

The comparison tests the Somewhere bundle against normal search. It does not identify the isolated causal effect of hidden identity, random selection, the five-minute rule, the compass, or any other single component without a separate experiment.

## Operational Definitions

### Decision Started

The dyad begins the assigned place-selection task after the scenario and required constraints are understood.

### Destination Committed

The dyad explicitly accepts one destination and stops candidate comparison.

### Movement Started

The dyad begins physical travel after commitment. This is measured separately from destination commitment.

### Selection Maintained

The user does not reopen place comparison for preference reasons before arrival.

### Selection Reopened

The user stops because another destination is preferred or requests a new recommendation after simple change of mind.

### External Interruption

The journey stops for route failure, safety, closed venue, schedule change, or another cause that does not demonstrate renewed comparison. Analyze these separately.

The five-minute recovery window is a UX rule, not the measurement boundary. A preference-driven restart after five minutes still counts as selection reopened.

## Event Contract

Minimum versioned events:

```text
session_started
consent_updated
decision_started
constraints_confirmed
recommendation_requested
recommendation_ready
recommendation_no_fit
destination_committed
movement_started
destination_revealed
route_confidence_low
reroute_requested
external_map_opened
stop_requested
guidance_paused
stop_cancelled
stop_confirmed
stop_reason_recorded
stop_reason_skipped
recovery_requested
constraints_reopened
near_entered
arrival_detected
arrival_confirmed
feedback_eligible
feedback_prompted
place_reaction_recorded
```

Each event schema has a version. Product-improvement upload excludes exact origin and destination coordinates, venue ID, route geometry, raw location history, and stable cross-session identifiers. Study records use separately governed participant codes and are not silently joined to product analytics.

## Metrics

### Core Value

- time from decision start to commit
- number of candidate detail views in the baseline condition
- time from commit to movement
- movement-start rate
- selection-maintained rate
- selection-reopened rate

The primary Study B endpoint is the paired dyad-level difference in time from `decision_started` to `destination_committed`. The practical-difference threshold and decision rule are frozen after Study A and before Study B enrollment.

### Navigation Quality

- confirmed arrival rate
- false and missed arrival
- reroute count
- low-confidence duration
- external map handoff
- route/sensor/safety interruption

### Destination Quality

- dislike
- like
- love
- did not visit
- reaction response rate and delay

### Physical Product

- control comprehension
- display readability
- accidental stop
- successful stop confirmation
- one-handed handling
- carry comfort
- preference versus phone-only compass

## Feedback Timing

- Initial eligibility: 60 minutes after confirmed arrival.
- Notification allowed: one notification.
- Notification denied: prompt on next launch.
- One step only; no star rating and no free-text requirement.
- Adjust the delay only after examining response quality and `did not visit` causes.

## Analysis Rules

- Freeze the Study B metrics, practical-difference threshold, and decision rule after Study A and before Study B enrollment.
- Preserve all exclusions and reasons; do not silently remove failures.
- Analyze restaurant and cafe sessions separately before combining.
- Separate preference-driven restart from external interruption.
- Separate place quality from navigation quality and selection efficiency.
- Report missing feedback rather than treating it as neutral.
- Do not infer relationship improvement from the two-person scenario.
- Treat the dyad as the primary unit for paired inference; person-level reactions may be reported separately without pretending independence.
- Do not attribute a bundle-level difference to one component without a separate component study.

## Consent and Safety

- Location authorization is separate from minimized product-improvement upload consent.
- Improvement upload is off by default.
- First-use consent summarizes the versioned pilot data contract in [Recommendation and Data Architecture](recommendation_and_data.md); it remains editable in Settings.
- Exact origin and destination coordinates, venue ID, route geometry, raw location, and stable cross-session identifiers are prohibited from product-improvement upload.
- On-device history can be reset.
- If the documented deletion path is unavailable, improvement upload remains disabled.
- Participants can reveal the destination or stop at any time.
- Stop guidance before asking a reason.
- A moderator has an external map and direct destination access during supervised tests.
- Critical safety incidents stop the study and trigger review before resumption.

## Advancement Gates

Study B / Roadmap Phase 4 cannot start until:

- critical Stop and reveal paths work without moderator help
- provider terms and route access are documented
- sensor confidence failures produce a safe state
- no known critical privacy or safety defect remains
- the physical mockup can be understood and handled in realistic conditions
- metrics, exclusions, and thresholds are frozen

The physical-product claim also requires an embodied interaction test using BLE, a wired prototype, or Wizard-of-Oz control. A visual animation alone can validate layout and appearance but not live pointing, connection recovery, or the value of handling a physical compass.

BLE functionality is not a Study B requirement when a wired or Wizard-of-Oz setup can validly test the physical interaction and its limitations are reported.
