# Study B protocol v1 — counterbalanced comparative field validation

Status: method frozen; enrollment `BLOCK` until Study A authorizes and freezes the practical
difference threshold in `analysis-contract-v1.json`, provider/legal gates pass, and realistic
physical handling evidence exists.

## Claim boundary

Study B compares the complete Somewhere experience with each dyad's normal map/search behavior.
It does not isolate the causal effect of hidden identity, random selection, the recovery window,
the compass, or any other component. The sample is exploratory and cannot establish
population-wide market validation or relationship improvement.

## Design

- Enroll 10–15 dyads (20–30 people) after the analysis contract is frozen.
- Use the dyad—not either person—as the primary paired analysis unit.
- Each dyad performs one baseline and one Somewhere condition.
- Counterbalance order overall and within each category; order counts may differ by at most one.
- Match category, area code, budget band, time window, and pair-composition code across the two
  conditions.
- Use distinct, pre-frozen eligible-pool digests for the two conditions and record the order in
  which those pools were used.
- Record prior familiarity separately for each condition.
- Preserve every dyad and every missing or failed outcome. Do not silently exclude failures.

## Frozen endpoint and decision rule

The endpoint is the dyad-level paired difference:

```text
baseline selection time − Somewhere selection time
```

A positive value favors Somewhere. The separately authorized practical threshold must be a
positive whole number of seconds and must be committed before `enrollmentOpenedAt`. For each of
the restaurant and cafe strata, the deterministic analyzer reports the mean, median, range,
paired values, and a two-sided 95% Student-t interval.

The frozen rule is:

- `SUPPORT`: mean difference is at least the practical threshold and the interval excludes zero.
- `REVISE`: mean difference is positive but does not meet both support conditions.
- `REJECT`: mean difference is zero or negative.

Restaurant and cafe decisions remain separately visible. The analyzer intentionally emits no
single `overallDecision`; its overall field is descriptive only.

## Distinct outcomes

Preference-driven `selectionReopenedForPreference`, `externalInterruption`, and Somewhere
`recommendationOutcome=no-fit` are mutually distinct classifications. External interruptions
include route failure, sensor failure, safety, closed venue, schedule change, or another external
cause. They must not be counted as renewed preference comparison or recommendation failure.

For each stratum report:

- paired selection-time difference and practical decision
- baseline versus Somewhere comparison count
- movement start
- selection reopened for preference
- confirmed arrival
- external interruption
- Somewhere no-fit count
- destination reaction (`dislike`, `like`, `love`, `did-not-visit`, or `missing`)

## Data boundary

Use de-identified dyad codes and categorical constraint codes. Governed data forbids participant
names, contact details, addresses, venue/place/destination IDs, raw coordinates, route geometry,
and free-form venue identity. The schema is strict; the analyzer recursively rejects prohibited
keys.

## Advancement and execution

Before replacing the checked-in blocked contract, Study A must approve the exact threshold and
freeze time. Provider rights, legal review, native field evidence, embodied physical handling,
and critical safety/privacy gates must also permit enrollment.

```bash
bun research/study-b/analyze-study-b.mjs \
  --dataset /private/study-b/dataset.json \
  --contract research/study-b/analysis-contract-v1.json \
  --output /private/study-b/result.json
```

The dataset binds the SHA-256 of the frozen contract's canonical JSON. Exit codes are `0=PASS`,
`1=FAIL`, and `2=BLOCK`. The checked-in contract remains `BLOCKED_PENDING_STUDY_A`; this is a
truthful release gate, not an unfinished default silently treated as success.
