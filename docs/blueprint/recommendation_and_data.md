# Recommendation and Data Architecture

Status: approved design, pending written-spec review

## Objective

Create a pool in which every destination is acceptable, then choose one uniformly at random. The system does not rank venues for the user and does not ask the LLM to invent place facts.

## Pipeline

```text
user location + hard constraints
→ provider search adapters
→ normalized candidates
→ deterministic hard filters
→ evidence enrichment
→ LLM merit interpretation
→ deterministic evidence gate
→ qualified pool
→ uniform random selection
→ final hard-condition validation
→ hidden destination session
```

## Provider Boundary

Every place source implements a common adapter instead of leaking vendor fields into product logic.

Minimum normalized candidate fields:

```text
provider
provider_place_id
name
coordinates
category
address
distance_from_origin
source_timestamp
source_url
```

Optional evidence fields:

```text
opening_hours
representative_menus
price_band
dietary_evidence
accessibility_evidence
atmosphere_evidence
merit_evidence
negative_signals
```

An absent optional field is unknown, not false. A user constraint that depends on an unknown field cannot be declared satisfied.

Provider selection remains a gate. Kakao, Naver, TMAP, and lawful alternatives must be compared on:

- restaurant and cafe coverage
- menu, price, hours, and accessibility fields
- walking-route coverage
- freshness and provenance
- quotas and cost
- caching and storage restrictions
- commercial and research-use terms
- partnership requirements

## Hard Filters

Hard filters are deterministic and cannot be relaxed by the LLM:

- category
- maximum travel distance or time
- budget
- opening status when required
- dietary restrictions
- accessibility constraints
- route feasibility
- explicit safety exclusions

The final selected destination passes the same filters again using the latest available facts. If it fails, it is removed and selection repeats from the remaining qualified pool.

## Merit Gate

A candidate qualifies only when:

1. No critical weakness is supported by current evidence.
2. At least one clear reason to visit exists in taste, representative menu, atmosphere, or distinctiveness.
3. Evidence provenance and timestamp meet the configured policy.

The LLM returns structured interpretation, not a free-form recommendation:

```json
{
  "candidate_id": "provider:place-id",
  "merits": [
    {
      "type": "menu|taste|atmosphere|distinctiveness",
      "claim": "short normalized claim",
      "evidence_ids": ["source-id"],
      "confidence": "high|medium|low"
    }
  ],
  "critical_weaknesses": [],
  "unknowns": [],
  "verdict": "pass|fail|insufficient_evidence"
}
```

Deterministic validation rejects:

- claims without evidence IDs
- evidence older than the configured policy
- contradictions in required facts
- malformed output
- low-confidence support for a required condition
- any LLM-supplied menu, price, hours, or address not present in source data

`insufficient_evidence` is not converted to pass.

## Random Selection

- Every qualified candidate has equal selection probability.
- There is no internal top-one rank after the merit gate.
- One qualified candidate is valid and is selected directly.
- Zero qualified candidates returns a no-fit state and asks for condition changes.
- Hard conditions and the merit gate are never silently lowered to increase pool size.
- Recently failed or explicitly disliked venues can be locally excluded under a versioned rule.

The server records an auditable selection receipt:

```text
request_id
provider query versions
rule version
model and prompt version
evidence policy version
qualified pool size
selected pool position
final validation result
```

The user never receives the pool or its ranking because neither is part of the experience.

## Hidden Destination Boundary

Before reveal, the client receives:

- opaque destination session token
- safe display menu data
- price band
- route-derived distance
- guidance data needed for the current route

The exact name and address remain server-side until reveal or an external-map safety handoff. No client architecture can guarantee secrecy against a fully compromised device, so the goal is product-level concealment and minimal exposure, not cryptographic DRM.

A reliable field app may cache route geometry that makes the endpoint coordinate technically inferable even while the venue name and address remain hidden in the UI. The MVP must state this limitation honestly. If later research requires stronger technical concealment, the server can deliver route segments or short-lived next-waypoint guidance, but that approach must be evaluated against offline continuity, latency, and safety before adoption.

## Feedback and Learning

Device-local behavior can remember:

- disclosure preference
- recent explicit dislikes
- repeated stop-reason patterns
- recent destinations to avoid accidental repetition

This behavior is disclosed and can be reset in Settings. It does not require a separate product-improvement opt-in when it remains entirely on device, subject to later legal review.

Anonymous product-improvement upload:

- asked once on first launch
- off by default
- editable in Settings
- not required to use the product
- exact movement path excluded
- data minimized to versioned events and coarse context

Consent is separate from location authorization.

No event changes the live model immediately. Consented aggregate feedback is reviewed offline, tested against a frozen evaluation set, versioned, and only then used to change rules, prompts, or evidence thresholds.

## Failure Behavior

| Failure | User behavior | System behavior |
|---|---|---|
| place provider unavailable | calm retry/no-fit state | retry bounded times, then fail closed |
| evidence provider unavailable | no recommendation from unsupported facts | use only complete candidates or fail closed |
| LLM timeout or malformed output | no invented fallback | retry once with same evidence, then fail closed |
| zero qualified candidates | condition-change prompt | preserve hard constraints until user edits them |
| final validation failure | no exposure | remove candidate and reselect |
| conflicting source facts | no unsupported guarantee | mark unknown or exclude candidate |
