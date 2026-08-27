# Roll the compass! Journey Integrity and Native Polish Design

Status: owner-approved direction, pending written-spec review

Date: 2026-08-21

Implementation branch: `codex/roll-compass-native-app`

Inspected baseline: `1d7781b045eeb663fb2c272c23002e9400b489c2`

## 1. Purpose and authority

This design closes three connected gaps in the native `Roll the compass!`
journey before further field demonstration:

1. the antique compass needle must rotate around its illustrated hub and take
   the shortest credible angular path;
2. destination reveal must follow the current Stop-first safety flow across the
   shared contract, server aggregate, projections, and iOS client;
3. a guarded replacement must actually exclude the previous selected venue,
   while preserving the product's evidence-first uniform selection promise.

It also includes the small visual and copy corrections exposed by the same
Simulator audit. The source priority is the repository `AGENTS.md`, the owner's
latest explicit direction, `BLUEPRINT.md` and `docs/blueprint/`, the current
native requirements, and then executable code and tests as implementation
evidence. Historical v0.1/v0.2 behavior does not override V2.

## 2. Evidence from the current build

The current branch is clean and synchronized with its remote at the inspected
baseline. A fresh iPhone 17 Pro Simulator run captured launch, guidance,
conditions, Stop, arrival, and feedback states under
`.local-artifacts/audit-2026-08-21/`.

The audit found:

- the antique shell, paper texture, warm palette, and dominant compass match the
  collaborator moodboard well;
- the needle's gold hub visibly orbits around the shell center instead of
  staying fixed;
- crossing normalized north, such as `359° → 1°`, can animate the long way;
- active journey projections still advertise direct `reveal` even though the
  current native requirement is Stop first;
- recovery records a receipt digest where the later flow needs the selected
  member digest, so it can claim exclusion without excluding the venue;
- Debug guidance can disclose the legacy `cafe` category although native
  discovery is restaurant-only;
- the Stop and arrival demo surfaces retain English labels and generic fallback
  reveal content that do not belong in the Korean product build;
- the reveal fallback image is announced as a destination photo even when no
  real photo exists.

The fresh baseline remains technically healthy: 181 app tests, 228 server
tests, 14 contract tests, and 47 native tests passed, with two documented native
skips. These passing tests describe the current behavior; this change will first
replace the assertions that encode the identified defects.

## 3. Decisions

### 3.1 Correct contract V1 in place

The repository and public release are still pre-production and externally
blocked. There is no deployed client population that requires simultaneous old
and new journey action semantics. The shared `contractVersion: 1` projection is
therefore corrected in place instead of adding a second contract version or a
temporary compatibility branch.

The HTTP reveal endpoint remains part of the API surface because it is valid in
paused, stopped, and completed safety states. The server aggregate, not merely
the iOS UI, enforces when the action is legal.

### 3.2 Keep selection evidence-first and uniformly random

The algorithm remains:

```text
canonical provider records
→ evidence and rights qualification
→ hard constraint and reviewed-route filtering
→ previous-member exclusion for an authorized replacement
→ immutable pool seal
→ unbiased uint32 rejection-sampling draw
→ selected-snapshot revalidation
→ one hidden destination or no_fit
```

There is no popularity, rating, review-count, sponsorship, or engagement score.
Feedback does not silently become a ranking weight. A previous destination is a
hard exclusion only when a valid recovery capability authorizes replacement.

### 3.3 Preserve a fixed illustrated pivot

The needle asset will remain separate from the shell. Its illustrated hub is
aligned with the center of a fixed square rotation container, and the container
rotates. The artwork is not redrawn and the shell does not move.

## 4. Compass geometry and motion

### 4.1 Measured asset geometry

Both source PNGs are 1254 × 1254. The needle's visible alpha bounds are
approximately `(210, 27)–(1192, 1126)`, and its gold hub is centered near
`(627.5, 718)`. The image canvas center is `(627, 627)`, leaving the illustrated
hub about 91 source pixels below the default SwiftUI rotation pivot.

At the current guidance size of 286 points and needle frame scale of 0.68, this
produces roughly a 14-point orbital error. SwiftUI's `rotationEffect` defaults
to a centered anchor, so the source artwork must be translated inside a centered
container before rotation.

### 4.2 Rendering structure

`SomewhereCompass` will render the needle through a small, testable geometry
policy:

- a fixed square container remains centered over `RollCompassShell`;
- the needle image uses an explicit source-to-display scale;
- a normalized hub offset moves the illustrated hub to the container center;
- rotation and pulse scale apply to the centered container;
- paused grayscale, opacity, and shadow remain visual modifiers only;
- the final scale is chosen from fresh same-viewport comparison so the red tip
  remains inside the intended bezel at all angles.

Geometry values are named constants with comments that identify the source
measurement. They are not scattered screen-specific magic numbers.

### 4.3 Shortest-angle animation

The view maintains an unwrapped animation target. For each credible bearing it
computes the signed shortest delta in `[-180°, 180°]` from the prior target and
adds that delta to the unwrapped target. The rendered angle may exceed 360°;
only display and accessibility copy use normalized degrees.

Examples:

| Previous target | New bearing | Animated target |
| --- | --- | --- |
| 20° | 80° | 80° |
| 359° | 1° | 361° |
| 1° | 359° | -1° |
| 170° | -170° | 190° |

The existing spring remains bounded and does not create a continuous spin in
pointing mode. Reduce Motion sets the corrected target immediately, disables
the repeating search/pulse effects, and preserves the directional value.
Searching may rotate continuously only when Reduce Motion is off. Paused mode
holds the last trustworthy target.

The app is portrait-only. Core Location's portrait default heading orientation
therefore remains correct; this change does not substitute movement course for
`CLHeading` in Release.

## 5. Reveal state contract

### 5.1 Projection actions

The authoritative action matrix becomes:

| Phase | Unrevealed actions relevant to this change | Reveal rule |
| --- | --- | --- |
| `ready` | `commit`, `stop` | direct reveal forbidden |
| `committed` | `poll`, `stop` | direct reveal forbidden |
| `following` | `stop`, `route-recover`, `arrival` | direct reveal forbidden |
| `route-recovery` | `stop`, `route-recover` | direct reveal forbidden |
| `near` | `stop`, `route-recover`, `arrival` | direct reveal forbidden |
| `paused` | `continue`, `route-recover`, `confirm-stop`, `reveal` | safety reveal allowed |
| `stopped` | `record-reason`, `skip-reason`, `reveal` | reveal allowed |
| `completed` | `reveal`, plus `recovery` when eligible | reveal allowed |
| `arrived` | no reveal action | arrival is already revealed automatically |

Active unrevealed variants omit `reveal`; their revealed variants remain valid
because a user may Reveal from the paused safety screen and then Continue the
same journey. Those revealed variants never advertise another Reveal action.
`arrived` has only the revealed variant.

### 5.2 Aggregate enforcement

The journey aggregate rejects a `reveal` command unless the phase is `paused`,
`stopped`, or `completed`. A direct call to the existing HTTP endpoint during an
active phase returns the standard illegal-transition conflict and leaves state,
sequence, and identity unchanged.

A credible arrival transition sets `phase: arrived` and `revealed: true` in one
server-authoritative state transition. The resulting projection includes the
identity without requiring a second reveal request.

External-map handoff remains a safety recovery choice. The aggregate accepts
the `external-map` recovery choice only while paused, after copy warns that it
reveals the destination. Active `following`, `near`, and `route-recovery`
requests may use recalibration, reroute, or cached-route choices, but an
`external-map` choice in those phases is an illegal transition. An accepted
paused handoff may set `revealed: true` as part of the recovery command.

### 5.3 Client behavior

The iOS decoder validates the corrected phase/action matrix. Active guidance
never renders or calls Reveal. Stop pauses local directional guidance
immediately; the paused view then offers Continue, confirmed Stop, route repair,
and safety Reveal according to the projection.

Debug fixture projections and UI tests use the same corrected action matrix, so
demo mode cannot mask a production contract mismatch.

## 6. Recovery and previous-destination exclusion

### 6.1 Canonical digest

The selected-member digest has one definition shared by preparation and
recovery matching:

```text
SHA-256(canonicalId + NUL + candidateId + NUL + snapshotVersion)
```

The digest helper lives with provider pool/member identity logic and is used by
journey composition instead of duplicating the string formula.

On confirmed Stop, the browser-session guard stores
`prepared.receipt.selectedMemberDigest` as `previous_candidate_digest`. It must
never substitute `receiptDigest`, `receiptId`, or an HMAC of either value.

### 6.2 Backward-compatible resolution

No database migration is needed because `selection_receipts` already stores
both `randomness_digest` and `selected_member_digest`.

When an authorized recovery create request is accepted, the server resolves the
guard value as follows:

1. look for a retained receipt whose `randomness_digest` equals the guard value;
2. if found, use that row's `selected_member_digest` to support guards written
   by the current buggy build;
3. otherwise compare the guard value with the canonical digest of every current
   provider candidate and accept it only when exactly one candidate matches;
4. if the resolved candidate is no longer in the newly qualified pool, treat it
   as already excluded; otherwise remove it before sealing;
5. if neither receipt resolution nor canonical-candidate matching succeeds,
   return public `no_fit` without selecting a destination.

This lookup reveals no venue identity to the client. Resolution and exclusion
occur only after recovery capability validation and before the replacement pool
is sealed.

### 6.3 Selection behavior

`buildJourneyPreparation` accepts an optional previous-member digest. It maps
qualified members to the canonical digest and removes the matching member before
pool sealing. Selection then uses the unchanged unbiased draw over the remaining
frozen pool.

If exclusion removes the only restaurant, the result is `no_fit`. The server
must not quietly return the same restaurant, weaken dietary/allergen gates,
cross into the legacy cafe category, or claim `previousDestinationExcluded`
when no exclusion occurred.

Recovery capability consumption remains replay-safe and transactionally
guarded by the existing session guard/version checks. A failed replacement does
not authorize an unguarded second draw.

## 7. Recommendation evidence boundary

The current native app sends restaurant-only requests. Dietary restrictions and
allergies come from persistent Settings; unknown food-safety evidence fails
closed. The exact native budget slider remains user-facing local state and maps
to the server's current `low`/`medium`/`high` compatibility band at the transport
boundary.

The current curated Seoul Forest fixture supports the evidence policies already
represented in its reviewed records. It does not justify invented opening-hour,
party-capacity, exact-price, accessibility, or cross-contamination claims.
Those fields may be added only with source-backed records, freshness rules, and
rights approval. Until then, the app must not display them as passed facts.

Future provider integration may use a rights-approved Nearby Search for
candidate retrieval and explicitly billed field masks for source data, but it
does not replace the server's qualification policy or become a ranking layer.
Relevant primary references are Google's [Nearby Search
documentation](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
and [Place data field
reference](https://developers.google.com/maps/documentation/places/web-service/data-fields).
Live or paid provider work remains externally blocked.

## 8. Native visual and copy polish

The existing editable SwiftUI design system and supplied compass assets remain
the source of truth. This change does not replace the UI with a screenshot,
canvas, map, or generated mockup.

Within the audited states:

- keep the launch and guidance layout inside one target viewport;
- retain the dominant antique compass and stable hierarchy for next cue,
  remaining distance, broad category, price, and `멈춤`;
- force restaurant-only Debug disclosure where a category is needed;
- replace `SAFETY PAUSE`, `ARRIVED`, and `DESTINATION FOUND` with `안전 일시정지`,
  `도착`, and `목적지 발견` through the existing style/copy boundaries;
- remove the `ROLL THE COMPASS / FOUND` overlay from the fallback artwork;
- use the reviewed Seoul Forest fixture identity in Debug arrival/reveal states
  instead of `Test destination` or another generic demo identity;
- treat an ornamental fallback illustration as decorative and do not announce
  it as a real destination photo;
- keep all controls at least 44 points, preserve Dynamic Type exit paths, and
  retain stable accessibility identifiers.

No candidate list, map, rating, review card, direct active Reveal, visible debug
control, or cafe selector is added.

## 9. Error and privacy behavior

- A rejected active Reveal is a normal conflict response with no identity leak.
- An unresolved legacy recovery digest fails closed; logs use opaque digests and
  stable error codes, never venue names or raw user location.
- An empty post-exclusion pool returns `no_fit` and prompts condition review.
- Route/provider revalidation failures continue removing failed members and
  drawing from the remaining frozen pool until selection or `no_fit`.
- Poor location or heading confidence suppresses precise pointing; it never
  falls back to a straight destination bearing.
- Exact live location and raw heading traces remain device-local by default.

## 10. Implementation boundaries

Expected change areas are:

- `ios/Somewhere/UI/SomewhereCompass.swift` and focused native motion/geometry
  tests;
- native projection, store, Debug fixtures, arrival/reveal accessibility, and UI
  tests under `ios/Somewhere/` and `ios/SomewhereTests`/`SomewhereUITests`;
- `contracts/src/journey.ts`, contract examples, endpoint evidence, and contract
  tests;
- server aggregate, projection, composition, lifecycle mutation/create,
  selection identity helper, persistence lookup, and focused regression tests;
- current requirements/handoff evidence only where behavior or reproduction
  instructions materially change.

The generated `ios/Somewhere.xcodeproj` is regenerated from `ios/project.yml`
only if project membership changes. Unrelated refactors, provider onboarding,
production deployment, signing, TestFlight, and physical-device claims are out
of scope.

## 11. Test-first verification plan

Implementation starts with failing tests for each defect.

### 11.1 Native unit and contract tests

- hub-offset geometry places the measured artwork hub at container center;
- shortest-angle targets cover north crossings and ±180° boundaries;
- Reduce Motion disables continuous effects while preserving bearing;
- the iOS projection decoder accepts only the corrected phase/action matrix;
- active states cannot request Reveal; paused/stopped/completed states can;
- arrived projections are revealed and contain identity;
- fallback reveal artwork is accessibility-hidden when no photo exists;
- native restaurant-only preferences and budget mapping remain unchanged.

### 11.2 Server and shared contract tests

- shared schemas reject direct Reveal actions in unrevealed active variants and
  reject an unrevealed `arrived` projection;
- aggregate rejects Reveal in ready/committed/following/route-recovery/near;
- paused/stopped/completed reveal succeeds and arrival auto-reveals;
- confirmed Stop persists the selected-member digest;
- legacy receipt-digest guards resolve through `selection_receipts`;
- current member-digest guards resolve directly;
- recovery excludes the prior member before pool sealing;
- one-member restaurant recovery returns `no_fit`;
- a multi-member deterministic pool never selects the excluded member and stays
  uniform over the remaining members;
- unresolved digest, expired capability, replay, and concurrent guard changes
  fail closed;
- response claims about previous-destination exclusion match actual behavior.

### 11.3 Integrated and visual evidence

- run app, server, and contract unit suites plus typecheck, lint, blueprint,
  native-source, release-authority, and audit gates;
- regenerate and build the Xcode project, then run native unit/UI tests on the
  iPhone 17 Pro Simulator;
- run local Worker-backed virtual field E2E with deterministic GPS/heading;
- exercise launch → conditions → one-place start → guidance → Stop/pause →
  safety reveal, and launch → guidance → arrival auto-reveal → reaction;
- capture launch, guidance at multiple bearings, paused, no-fit recovery,
  arrival, and feedback at the same 368 × 800 viewport;
- compare the supplied moodboard/reference and fresh app captures side by side,
  checking hub stability, tip clearance, hierarchy, cropping, copy, contrast,
  and one-screen containment;
- inspect a north-crossing recording or frame sequence to prove the needle takes
  the short path and does not orbit.

Passing unit tests alone are insufficient for the illustrated pivot. Visual
comparison and motion evidence are required before completion is claimed.

## 12. Completion criteria

This design is complete when:

1. the compass hub remains visually fixed and the needle moves naturally across
   north while honoring Reduce Motion;
2. active guidance cannot reveal through UI, contract, or a direct API call;
3. Stop pauses immediately and the paused/stopped safety reveal remains usable;
4. arrival reveals automatically in the same authoritative transition;
5. guarded replacement excludes the actual previous member or returns
   `no_fit` without a false claim;
6. uniform evidence-qualified selection and food-safety fail-closed behavior
   remain intact;
7. Korean demo copy and fallback accessibility match the product state;
8. all proportionate automated, Worker-backed, Simulator, and visual checks
   pass with artifacts recorded;
9. documentation explains the decisions and remaining external gates for the
   collaborator and their coding agent;
10. the resulting commits are pushed to
    `origin/codex/roll-compass-native-app` with a clean synchronized worktree.

## 13. External gates that remain

This work does not claim completion of:

- Apple development/distribution signing, TestFlight, or another collaborator's
  device provisioning;
- physical walking accuracy and magnetic-interference validation;
- production Cloudflare domain, authority, and secrets;
- live provider rights, quota, pricing, and field-mask approval;
- independent Korean privacy, food-information, and provider-terms review;
- Study A/Study B or Linux-only release authority on the current Mac.

These gates remain explicit rather than being replaced with mock claims or
weakened filters.
