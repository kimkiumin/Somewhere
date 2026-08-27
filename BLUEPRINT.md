# Roll the compass! Full Development Blueprint

Status: approved written blueprint (2026-07-21)

Approved conversation date: 2026-07-21

Scope: product, UX, recommendation, navigation, iOS, physical product, validation, risk, and roadmap

## 1. Product Definition

> Roll the compass!는 사용자가 정한 최소 조건 안에서 갈 만한 장소 하나를 빠르게 확정해, 여러 후보를 비교하지 않고 출발하게 만드는 숨겨진 목적지 서비스다.

The product is not defined by a fixed party size. The first field validation prioritizes two close participants choosing a restaurant or cafe because the existing survey most clearly exposes coordination and selection burden in that context.

## 2. Core Promise

Roll the compass! is responsible for two outcomes:

1. Select one evidence-qualified destination quickly within non-negotiable constraints.
2. Move the user from comparison to departure without presenting a candidate list.

Arrival and destination satisfaction matter, but they are service-quality outcomes after the core promise. They must be measured separately so route failures, schedule changes, and destination quality do not get confused with selection speed.

## 3. End-to-End Flow

```text
Set minimum constraints
→ collect and validate live place data
→ resolve duplicate provider records into canonical venues
→ build a qualified destination pool
→ select one destination uniformly at random from the frozen retrieved pool
→ show distance, representative menu, and price band
→ explicit commit
→ route-aware compass guidance
→ arrive
→ request one place reaction after 60 minutes
```

The exact venue name, address, photos, reviews, and ratings remain hidden by default. A secondary `목적지 확인` safety action can reveal the name and address without ending guidance.

## 4. Product Form

The final project is a physical compass product supported by a companion service.

- Required final outcome: a high-fidelity, full-scale physical design mockup plus a working iOS field experience.
- Stretch outcome: a BLE functional prototype connected to the iPhone.
- The physical product must not be postponed until all software work is complete. Form, display, controls, and ergonomics develop in parallel with the recommendation and navigation system.

## 5. Architecture Summary

```text
Place provider adapters
→ normalized place candidates
→ canonical venue resolution and deduplication
→ deterministic hard filters
→ evidence enrichment
→ LLM merit interpretation
→ deterministic evidence gate
→ uniform random selection
→ final hard-condition validation
→ hidden destination session

Walking route provider
→ normalized route geometry
→ iOS guidance engine
→ absolute route bearing plus north reference
→ device-relative bearing computed from the physical device heading
→ compass UI
→ optional BLE display contract
```

Provider selection is deliberately open. Kakao, Naver, TMAP, and other lawful sources must be compared for place fields, walking routes, licensing, quotas, and storage restrictions before implementation is locked.

## 6. Success Model

The phrase `결정을 닫는다` is avoided in user-facing documentation. The measurable claim is:

> 사용자가 더 빨리 한 곳을 정하고, 다른 후보를 다시 찾지 않고 출발하게 한다.

Evaluation remains a funnel, not one blended score:

```text
recommendation ready
→ commit
→ movement started
→ selection maintained or reopened
→ arrived or externally interrupted
→ dislike / like / love / did not visit
```

## 7. Document Map

- [Product Contract](docs/blueprint/product_contract.md)
- [vNext App Sequence](docs/blueprint/app_sequence.md)
- [UX State Model](docs/blueprint/ux_state_model.md)
- [Recommendation and Data](docs/blueprint/recommendation_and_data.md)
- [Navigation and iOS](docs/blueprint/navigation_and_ios.md)
- [Physical Product](docs/blueprint/physical_product.md)
- [Validation Plan](docs/blueprint/validation_plan.md)
- [Risk and Evidence Ledger](docs/blueprint/risk_and_evidence_ledger.md)
- [Roadmap](docs/blueprint/roadmap.md)

## 8. Decision Status

This blueprint records the product direction approved by the user on 2026-07-21, not completed implementation. It intentionally separates:

- `Decision`: approved direction.
- `Evidence`: survey, external research, or official technical documentation.
- `Hypothesis`: must be tested with users or prototypes.
- `Gate`: unresolved dependency that blocks a later phase.

Before vNext implementation begins, the current v0.1 `AGENTS.md`, README, prototype requirements, and test contracts must be reconciled with this blueprint. Until that explicit reconciliation, the current prototype remains a v0.1 historical implementation rather than evidence that the blueprint is complete.

The survey figures in this blueprint are author-reported summaries from the current project materials. They have not yet been independently recalculated from a de-identified response table, instrument, missing-data rules, and calculation record. Linked research and technical sources are cited evidence, not a guarantee that a provider, law, or platform behavior remains unchanged; dated capability, rights, legal, and field checks remain phase gates.

Review provenance: Browser GPT provided a bounded second-model critique of the supplied blueprint packet, Codex reconciled that critique against the local files, and the user approved the resulting changes. Browser GPT did not independently inspect the repository, recompute the survey, or verify every cited source.

## 9. Non-Goals

- Candidate lists, rankings, swiping, and review-comparison UI.
- Unlimited or immediate reroll.
- A chat interface as the primary interaction.
- A visible map as the primary movement interface.
- LLM-generated place facts without source evidence.
- Mandatory account creation for the field-test version.
- Standalone cellular/GPS hardware as a required final deliverable.
- Payments, reservations, coupons, community, or social feeds.

## 10. Immediate Next Gate

The next work is not broad feature implementation. It is the feasibility and evidence package defined in the roadmap:

1. Reconcile project instructions and v0.1 contracts with this approved blueprint.
2. Compare place and walking-route providers.
3. Verify menu, price, hours, and route data rights.
4. Run web sensor and iOS Core Location spikes.
5. Begin full-scale physical form and display studies in parallel.
