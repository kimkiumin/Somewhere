# Recommendation and Data Architecture

Status: approved written blueprint (2026-07-21)

## Objective

Create a frozen pool of provider-retrieved venues that pass the current evidence policy, then choose one uniformly at random from that pool. The system does not claim coverage of every real-world venue, rank venues for the user, or ask the LLM to invent place facts.

## Pipeline

```text
user location + hard constraints
→ provider search adapters
→ normalized candidates
→ canonical venue resolution and deduplication
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
provider_query_version
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

Before filtering, records that refer to the same physical venue or branch are resolved into one canonical entity. Deduplication uses provider IDs where available and a versioned combination of normalized branch name, address, coordinates, and source provenance otherwise. The same chain or brand at different branches remains separate. Uncertain matches remain separate or are excluded; they are never silently merged.

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

Straight-line distance is only a coarse search prefilter. Final distance and travel-time limits use a valid walking route. Opening status is evaluated at the predicted arrival time plus a versioned entry buffer, not only at request time.

The final selected destination passes the same filters again using the latest available facts. Revalidation is also required after a material delay, user-location change, route change, provider-status change, or source-freshness expiry. If a candidate fails, it is removed and selection repeats from the remaining frozen qualified pool or returns no fit.

High-consequence allergies, medical diets, and accessibility requirements fail closed. Until a reliable source, freshness policy, and verification method exist for a required condition, the system must return no fit, use a supervised manually verified pilot, or reveal the necessary venue information before commitment. It must not imply that an unknown condition passed.

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

## LLM Qualification Benchmark

Before any live recommendation, freeze a human-adjudicated evaluation set containing at least:

- duplicate and uncertain canonical entities
- stale opening hours and close-before-arrival cases
- conflicting provider facts and unsupported merit claims
- distinctive-menu leakage
- malformed model output
- walking-route failures
- valid pass, valid fail, and insufficient-evidence examples

Track unsupported-claim rate, critical-condition false-pass rate, critical-weakness miss rate, insufficient-evidence handling, deterministic-validator rejection rate, adjudicator disagreement, and results by provider and field. Freeze the model, prompt, evidence policy, validator, threshold, and fallback before live use. Failure to meet the frozen gate sends the pilot to a deterministic or manually verified recommendation path rather than weakening the gate.

## Random Selection

- Every canonical candidate in the frozen provider-retrieved qualified snapshot has equal selection probability.
- The claim is limited to that retrieved snapshot; it is not a claim of uniform sampling from every real-world venue.
- There is no internal top-one rank after the merit gate.
- One qualified candidate is valid and is selected directly.
- Zero qualified candidates returns a no-fit state and asks for condition changes.
- Hard conditions and the merit gate are never silently lowered to increase pool size.
- Recently failed or explicitly disliked venues can be locally excluded under a versioned rule.

The server records an auditable selection receipt:

```text
request_id
provider, query, pagination, and coverage versions
snapshot timestamp
canonicalization version
rule version
model and prompt version
evidence policy version
qualified pool size
ordered qualified-set digest
RNG algorithm and version
draw value or nonce
selected index
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

Representative menu text follows one cross-channel disclosure policy. A distinctive item is normalized to a source-supported broad dish category or replaced by the broad venue category. The app, physical compass, notifications, logs, study screenshots, and handoff warnings must not leak more destination identity than the selected disclosure level.

A reliable field app may cache route geometry that makes the endpoint coordinate technically inferable even while the venue name and address remain hidden in the UI. The MVP must state this limitation honestly. If later research requires stronger technical concealment, the server can deliver route segments or short-lived next-waypoint guidance, but that approach must be evaluated against offline continuity, latency, and safety before adoption.

## Feedback and Learning

Device-local behavior can remember:

- disclosure preference
- recent explicit dislikes
- repeated stop-reason patterns
- recent destinations to avoid accidental repetition

This behavior is disclosed and can be reset in Settings. It does not require a separate product-improvement opt-in when it remains entirely on device, subject to later legal review.

Minimized, consented product-improvement upload:

- asked once on first launch
- off by default
- editable in Settings
- not required to use the product
- exact origin and destination coordinates, venue ID, route geometry, raw location history, and stable cross-session identifiers are excluded

Proposed initial pilot data parameters (`H/G`, not an approved legal conclusion), subject to user confirmation plus legal and platform-policy review before activation:

| Area | Initial rule |
|---|---|
| event fields | event name/schema version, app build, OS major version, consent-policy version, journey-scoped ID, elapsed-time bucket, category, coarse distance/time/budget bands, route-confidence state, stop reason or place reaction when applicable |
| identifier lifetime | random ID scoped to one journey and its delayed feedback, never reused, client link expires after seven days |
| timing precision | elapsed time rounded to five seconds; calendar time uploaded at day precision only |
| coarse context | no context below category and configured bands; no venue, route, origin, or destination identity |
| retention | event-level rows deleted after 90 days; non-linkable aggregate counts retained for at most one year |
| access | project owner and named research analyst only; access is logged |
| deletion | Settings clears local history immediately and uses a device-held deletion token to request matching server-row deletion within 30 days |
| prohibited joins | no joining to contacts, advertising IDs, accounts, third-party profiles, precise location, or another journey |

If the deletion path or any required safeguard cannot be implemented, product-improvement upload remains disabled.

Consent is separate from location authorization.

On-device learning remains on the device unless a separate upload purpose and consent are introduced. Local memory is not silently folded into product-improvement data.

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
