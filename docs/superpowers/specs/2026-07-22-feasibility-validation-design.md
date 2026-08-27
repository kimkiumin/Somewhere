# Roll the compass! Feasibility Validation Design

Status: user-approved design, pending execution

Date: 2026-07-22

## 1. Purpose

Validate that Roll the compass! can progress from an approved product blueprint to a
credible restaurant-and-cafe recommendation service, an iPhone field-test app,
and a physical compass prototype without hiding unresolved provider, legal,
sensor, BLE, fabrication, or budget dependencies.

This work does not assume that nationwide live coverage, production hardware,
or App Store release is already feasible. It produces evidence that classifies
each dependency as `feasible`, `conditional`, `pilot-only`, or `not feasible`.

## 2. Approved Constraints

- The software architecture must be capable of nationwide use, but only regions
  with adequate lawful data and tested behavior may be activated.
- Initial field validation uses one or two commercial districts selected after
  provider coverage and physical accessibility are assessed. No city is fixed
  in advance.
- Restaurants and cafes remain the first categories and are evaluated
  separately.
- The required outcome is a supervised class or exhibition prototype and field
  test. A small TestFlight beta is a stretch outcome.
- The current development computer runs Windows. An iPhone is available. A Mac
  may be available for a short, uncertain period and is therefore a scheduled
  validation gate rather than a continuous dependency.
- The initial electronics and fabrication budget is approximately KRW 200,000.
  Additional spending requires evidence from the preceding gate.
- Soldering, ESP32/Arduino work, and 3D-printing assistance are available.
- Provider accounts and API credentials can be created when needed. Secrets
  remain local and never enter the repository or Browser GPT prompts.
- Manually verified place data may serve as a benchmark and pilot fallback. It
  must not be represented as a nationwide operating model.

## 3. Chosen Approach

Use an evidence ladder rather than a document-only audit or an immediate full
integration:

```text
official-source research
-> provider sample calls
-> normalized place-data audit
-> offline recommendation benchmark
-> route and sensor spikes
-> BLE and physical bench tests
-> supervised district field test
-> optional TestFlight gate
```

Each stage must leave reproducible artifacts and an explicit decision before
the next stage incurs meaningful cost or integration work.

## 4. Workstream A: Place And Walking-Route Providers

### Questions

- Which providers lawfully expose place discovery, coordinates, categories,
  hours, menu, price, accessibility, atmosphere evidence, and negative signals?
- Which providers expose pedestrian routes, route geometry, ETA, and rerouting
  under terms compatible with a supervised prototype and possible beta?
- What may be cached, normalized, displayed, logged, or retained?
- How do field coverage and freshness vary between candidate districts?

### Method

1. Build a dated matrix from official provider documentation, pricing, terms,
   and developer portals. Search results and third-party posts may identify a
   lead but cannot establish a conclusion.
2. Register test applications only after recording the relevant terms and
   expected cost. Keep credentials in ignored local environment files.
3. Execute bounded sample calls using the same query cases across providers.
4. Preserve redacted request metadata, status codes, response schemas, quotas,
   latency observations, and field-completeness statistics.
5. Score potential pilot districts for candidate density, required-field
   coverage, route availability, and practical access for field testing.

### Outputs

- provider capability, rights, price, and quota matrix
- route-provider comparison and fallback decision
- normalized field dictionary and provenance rules
- redacted sample-call fixtures and experiment log
- pilot-district selection record
- provider architecture decision record

### Exit Gate

- At least one lawful place-candidate path exists.
- At least one credible walking-route path exists, or a supervised pilot
  fallback is explicitly accepted.
- Missing fields stay `unknown`; no provider gap is silently inferred.
- Nationwide coverage is not claimed from one or two districts.

## 5. Workstream B: Restaurant And Cafe Recommendation

### Pipeline

```text
user hard constraints
-> provider candidate retrieval
-> canonical venue and branch resolution
-> deterministic hard filters
-> provenance and freshness qualification
-> rule-based or LLM-assisted merit gate
-> frozen qualified snapshot
-> uniform random selection
-> departure-time final validation
-> selection receipt
```

### Algorithm Boundaries

- Hard constraints include category, maximum distance or time, budget, opening
  feasibility at predicted arrival, dietary or medical restrictions, and
  required accessibility conditions.
- Unknown high-consequence information fails closed.
- Canonicalization and branch-aware deduplication occur before qualification so
  duplicate records cannot increase effective selection probability.
- The LLM may extract and classify source-linked evidence through a fixed schema.
  It may not invent a fact, relax a hard constraint, or alter the final random
  probability.
- `insufficient_evidence` is not a pass.
- A no-fit result is valid. It must not trigger unsupported constraint relaxation.
- Uniformity is claimed only for the versioned provider-retrieved qualified
  snapshot, not all real-world venues.

### Compared Implementations

1. Deterministic rule-based baseline using only normalized source fields.
2. LLM-assisted merit interpretation using the same frozen evidence.

Research must identify maintained, license-compatible references for constraint
filtering, entity resolution, geospatial candidate retrieval, serendipity,
source-grounded structured LLM output, and reproducible random sampling. General
collaborative-filtering libraries are references only when their assumptions
match this product; popularity ranking is not the default architecture.

### Benchmark

Create a frozen, de-identified labeled dataset containing ordinary cases,
duplicates, stale records, unsupported claims, branch ambiguity, no-fit cases,
and adversarial high-consequence cases.

Measure:

- high-consequence constraint violations
- unsupported user-visible claims
- duplicate-induced probability distortion
- human versus model merit-gate agreement
- evidence coverage and freshness
- no-fit rate by category and district
- cost and latency per evaluated candidate
- deterministic reproducibility of the selection receipt

High-consequence violations and unsupported displayed claims have a required
target of zero in the frozen release benchmark.

### Exit Gate

- The deterministic baseline works end to end.
- The LLM path passes the frozen benchmark or is removed from the pilot.
- A versioned selection receipt explains retrieval, canonicalization,
  qualification, random selection, and final validation without revealing the
  hidden destination in the user interface.

## 6. Workstream C: Route, iPhone, And Navigation

### Responsibility Split

The iPhone retains the destination identity, exact coordinates, route, GPS,
provider communication, notifications, and BLE central role. The physical
device receives only the minimum guidance and display state required for the
experience.

### Windows-First Work

- route geometry and progress mathematics
- next-action or route-segment bearing calculation
- confidence and recovery state machine
- location and heading log replay
- stale, inaccurate, out-of-order, and off-route fixtures
- Web sensor capability spike on the available iPhone
- iOS source, interface contracts, and test protocol prepared before Mac access

### Mac Gate

Use the limited Mac window for tasks that cannot be validated honestly on
Windows:

- Xcode project generation and signing
- SwiftUI and Core Location compilation
- real iPhone location and heading updates
- permission, foreground, background, and interruption behavior
- native BLE central connection and reconnection
- TestFlight preparation only after supervised field behavior passes

The native baseline remains SwiftUI, Core Location, User Notifications, and Core
Bluetooth unless a bounded spike demonstrates a lower-risk alternative.

### Navigation Safety

- A route-relative bearing, not a direct destination bearing, drives guidance.
- Arrival combines horizontal accuracy, dwell or repeated samples, and route
  progress; no single GPS sample is authoritative.
- Bench tests, route replay, repeated real-device trials, and supervised Study A
  observations establish conservative thresholds. Study A alone does not
  authorize unsupervised use.
- Untrustworthy route or sensor data suppresses precise pointing.
- External-map handoff remains user-selected and may reveal the destination.

## 7. Workstream D: BLE And Physical Compass

### Architecture

The iPhone sends an absolute route-bearing state. A separately held compass must
measure its own orientation and compute the device-relative indicator angle.
Using only the phone heading is invalid unless the phone and compass are
physically constrained to a tested common orientation.

The protocol declares its north reference, units, sequence ordering, timestamp,
staleness rules, reconnect behavior, and confidence semantics.

### Logical Messages

1. Navigation state: protocol version, ephemeral session identifier, sequence,
   timestamp, north reference, target bearing, distance, and confidence state.
2. Display state: one prioritized menu, optional second menu, price band, text
   encoding, loop behavior, and content version.
3. Control state: start, pause, confirmed stop, arrival, reveal-state handling,
   error, resynchronization, and acknowledgement.

Long UTF-8 menu content requires explicit framing, length, ordering, integrity,
and acknowledgement behavior. Destination name, address, destination coordinates,
and route geometry do not enter the physical-device payload.

### Indicator Options

- circular display with a digital needle
- servo or stepper-driven physical needle
- LED or haptic directional fallback

A physical motorized needle is preferred only if magnetic interference, latency,
power, acoustic, safety, and calibration tests pass. Motor interference with the
device magnetometer is a first-class risk. A digital needle or separated sensor
architecture is the fallback, not a concealed failure.

### Staged Prototype

- H0: wired or Wizard-of-Oz embodied interaction and full-scale form test
- H1: BLE display and status transfer using development boards
- H2: closed-loop device-correct directional control
- H3: refined enclosure and exhibition integration

BLE completion is a stretch outcome. Failure at H2 must not compromise the
required high-fidelity physical mockup or the validity limits reported for H0/H1.

### Bench Tests

- bearing accuracy and end-to-end latency
- packet loss, duplication, reordering, staleness, and reconnection
- magnetic interference and recalibration
- Korean UTF-8 fragmentation, reconstruction, truncation, and looping
- battery runtime, current draw, heat, and actuator noise
- network and phone-link status behavior
- destination-data leakage inspection
- one-handed handling, accidental Stop, and recovery comprehension

## 8. Integration And Field Validation

Select one or two districts only after Workstream A. Run supervised journeys
before any external beta.

An integrated journey must demonstrate:

- valid constraints and qualified hidden selection
- route-aware direction with confidence state
- safe reveal, Stop, and technical recovery
- arrival evidence
- delayed one-step destination reaction
- physical display readability and handling
- complete logs without prohibited uploaded location or destination identifiers

Restaurant and cafe results remain separate. A failure must be assigned to
selection efficiency, provider evidence, destination quality, navigation,
physical interaction, or external interruption rather than collapsed into one
success score.

## 9. Evidence And Decision Rules

Each tested dependency receives one status:

- `feasible`: demonstrated under the stated conditions
- `conditional`: credible only after named requirements pass
- `pilot-only`: adequate for supervised limited-region testing, not nationwide
- `not feasible`: no lawful, technical, budget, or schedule path was shown

Every conclusion records source date, test environment, artifacts, limitations,
cost, owner, and next decision. Browser GPT may challenge critical gate reports
through the connected allowlisted GitHub source, but Codex performs local checks
and owns the final recommendation. Waiting uses the repository's low-token
long-wait policy.

## 10. Budget And Purchase Gates

The first electronics and fabrication budget is KRW 200,000. Do not buy a final
display, actuator, custom board, or refined enclosure before the preceding bench
gate identifies a credible architecture. Every proposed purchase records price,
purpose, reusable value, failure consequence, and cheaper fallback. Additional
spending requires a short evidence-based approval request.

## 11. Security, Privacy, And Repository Rules

- No API key, token, private account detail, or exact participant route is
  committed or sent to Browser GPT.
- Redacted fixtures replace live identifiers where a test can remain valid.
- Exact origin and destination coordinates, route geometry, venue identity, and
  stable cross-session identifiers are excluded from product-improvement upload.
- Provider attribution, retention, deletion, and derived-data rules are treated
  as launch gates, not documentation trivia.
- Scraping is not used as an unreviewed substitute for provider rights.

## 12. Planned Artifact Structure

```text
docs/feasibility/
  executive_status.md
  provider_matrix.md
  provider_rights_and_costs.md
  recommendation_references.md
  algorithm_benchmark.md
  navigation_validation.md
  ble_protocol.md
  hardware_architecture.md
  bom_and_purchase_gates.md
  pilot_district_decision.md
  integrated_test_report.md
research/feasibility/
  source_register.md
  redacted_fixtures/
  experiment_logs/
```

`executive_status.md` is the user-facing index. It summarizes what works, what
failed, cost, confidence, blockers, and the next decision without requiring the
user to read raw logs.

## 13. Stop And Escalation Conditions

Pause the relevant workstream and request a user decision when:

- a provider requires a contract, payment, or permission beyond self-service
  registration;
- an action would expose a secret or accept legal terms for the user;
- a purchase would exceed the KRW 200,000 baseline;
- Mac access becomes necessary for the next claim and remains unavailable;
- no lawful place-data or route path exists;
- a safety-relevant benchmark fails after a documented correction attempt;
- the physical direction architecture cannot tolerate magnetic interference
  within the available form and budget.

Other negative results are recorded and handled through the declared fallback;
they do not justify silently broadening scope.

## 14. Completion Criteria

The validation goal is complete when:

1. provider and route feasibility are evidenced with dated official sources and
   bounded live tests;
2. a deterministic recommendation baseline and LLM benchmark decision exist;
3. nationwide architecture and regional activation rules are explicit;
4. the iPhone/Mac validation gate has a tested result or an honest external
   blocker record;
5. BLE protocol and physical orientation architecture have bench evidence;
6. the KRW 200,000 prototype path and fallbacks are documented;
7. a supervised integrated-test plan or result exists;
8. every claim is classified as feasible, conditional, pilot-only, or not
   feasible; and
9. the executive status report presents the decisions in a form the user can
   review without reading all underlying artifacts.
