# Validation Plan

Status: approved design, pending written-spec review

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

### Phase 1: 5-8 Participants

Purpose: find severe usability and technical defects.

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
- frozen Phase 2 protocol and success thresholds

### Phase 2: 20-30 Participants

Purpose: compare Somewhere with normal map/search behavior.

Use a within-participant, counterbalanced design:

- Each participant completes one matched decision using their normal map/search method.
- Each participant completes one matched decision using Somewhere.
- Half use Somewhere first; half use the baseline first.
- Restaurant and cafe results are analyzed separately.
- Party size is recorded but not used as a permanent product restriction.

The study remains exploratory at this sample size. Report paired differences, distributions, confidence intervals where appropriate, and qualitative failure causes. Do not claim population-wide market validation.

## Operational Definitions

### Selection Started

The user confirms one destination and begins movement.

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
stop_confirmed
stop_reason_recorded
recovery_requested
constraints_reopened
near_entered
arrival_detected
arrival_confirmed
feedback_eligible
feedback_prompted
place_reaction_recorded
```

Each event schema has a version. Consented analytics exclude exact route geometry and raw location history.

## Metrics

### Core Value

- time from decision start to commit
- number of candidate detail views in the baseline condition
- time from commit to movement
- movement-start rate
- selection-maintained rate
- selection-reopened rate

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

- Freeze the Phase 2 metrics and thresholds after Phase 1 and before Phase 2 enrollment.
- Preserve all exclusions and reasons; do not silently remove failures.
- Analyze restaurant and cafe sessions separately before combining.
- Separate preference-driven restart from external interruption.
- Separate place quality from navigation quality and selection efficiency.
- Report missing feedback rather than treating it as neutral.
- Do not infer relationship improvement from the two-person scenario.

## Consent and Safety

- Location authorization is separate from anonymous improvement-data consent.
- Improvement upload is off by default.
- On-device history can be reset.
- Participants can reveal the destination or stop at any time.
- Stop guidance before asking a reason.
- A moderator has an external map and direct destination access during supervised tests.
- Critical safety incidents stop the study and trigger review before resumption.

## Advancement Gates

Phase 2 cannot start until:

- critical Stop and reveal paths work without moderator help
- provider terms and route access are documented
- sensor confidence failures produce a safe state
- no known critical privacy or safety defect remains
- the physical mockup can be understood and handled in realistic conditions
- metrics, exclusions, and thresholds are frozen

BLE functionality is not a Phase 2 requirement unless the stretch track is ready and separately validated.
