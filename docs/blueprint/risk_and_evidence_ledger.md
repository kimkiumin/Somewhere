# Risk and Evidence Ledger

Status: approved blueprint evidence record with living gates

Last reviewed: 2026-07-22

## Evidence Labels

- `D`: direct user-approved product decision
- `S`: author-reported current survey summary
- `E`: cited external research or official documentation
- `H`: hypothesis requiring validation
- `G`: dependency or gate that can block a phase

## Evidence Summary

| Claim | Label | Evidence | Limitation | Product consequence |
|---|---|---|---|---|
| Place selection involves comparison and coordination burden | S | 17/21 reported a burdensome stage; burdens span comparison, coordination, finding, and final selection | small convenience sample | test one-place selection against normal search |
| Delegating the final choice is familiar behavior | S | 19/21 delegated a recent final choice | all 19 delegates chose an acquaintance, not an unknown algorithm | condition evidence and safety control are mandatory |
| Restaurants and cafes are the strongest initial category | S | 18/21 selected restaurant or cafe | young sample | analyze restaurant and cafe separately |
| Two-person use is a useful first test | S/H | 11/20 reported visiting as a pair | not proof that the product should be pair-only | prioritize, do not restrict |
| Partial concealment can support curiosity but uncertainty has costs | E | uncertainty research and curiosity literature | laboratory tasks differ from place selection | hide identity, show bounded practical information |
| Serendipity requires relevance as well as novelty | E | Chen et al. 2019 | e-commerce recommendation context | hard filters and merit gate before random selection |
| Nonvisual guidance can change environmental attention | E/H | S-BAN study | VR and specialized haptic device, not this product | physical interaction remains a test hypothesis, not proven benefit |
| Current public place APIs may not expose every needed field | E/G | dated Kakao, NAVER, and TMAP official-source matrix | terms, prices, and coverage change; authenticated rights and live completeness remain unmeasured | keep the pipeline provider-neutral and fail closed on missing critical evidence |
| Self-service walking routing is publicly documented but not yet field-proven | E/G | Kakao Map REST added a self-service walking endpoint on 2026-07-21; Kakao Mobility's separate affiliate endpoint remains partner-only | no bounded live call, field walk, or project-specific derived-data permission yet | use Kakao as the first bounded candidate; preserve TMAP and external-map fallbacks |
| iOS exposes location, heading, notifications, and BLE | E/H | Apple official documentation plus Windows replay and Web sensor lifecycle fixtures | simulated capability does not prove target-iPhone accuracy, native behavior, or background continuity | target-iPhone HTTPS capture and a bounded signed native spike remain gates |

The survey summary has not yet been independently recalculated from a de-identified response table, instrument, missing-data rules, and calculation record. The links below establish cited support and implementation leads, not continuing verification of provider coverage, legal permission, or field performance.

## Feasibility Validation Snapshot, 2026-07-22

| Gate | Evidence added | Decision boundary |
|---|---|---|
| full app | 16-domain implementation matrix, static client/backend review, 149 focused local checks, and dated platform/security/accessibility/operations sources | overall `conditional`; reusable pure cores exist, but no buildable vNext app, backend, signed device run, field evidence, or release path exists |
| provider access | official rights/cost/quota/field matrix and a ten-call-bounded redaction harness | `conditional`; zero live calls until the user places a Kakao REST key in ignored `.env.local` |
| recommendation | 18 synthetic cases; deterministic validation, deduplication, rejection-sampled uniform choice, and receipt replay | deterministic/manual path `feasible` on the frozen fixture; live LLM disabled because the adversarial fixture produced one unsupported raw claim in ten |
| navigation | 19 replay scenarios, 36 route/display checks, and 15 Web lifecycle/capture/export checks | route-relative math and confidence suppression `feasible` in replay; iPhone field, native, and background behavior remain unproven |
| BLE | 20-byte logical framing, exact schemas, redaction rules, resynchronization, and nine codec checks | logical protocol `feasible`; radio, Core Bluetooth, reconnection, pairing, and power remain bench/device gates |
| physical form | digital-display architecture and staged BOM under the KRW 200,000 ceiling | `conditional`; no purchase or H0/H1/H2 result exists, and a motorized needle is not the baseline |
| integration | restaurant and cafe synthetic sessions and six protocol checks | protocol `feasible` as a dry run only; no district, participant, provider, route, phone, or physical-device result exists |

The snapshot is indexed by `docs/feasibility/executive_status.md`; detailed claims remain limited to each artifact's recorded conditions.

## Cited Research and Scope Limits

1. van Lieshout, de Lange, & Cools (2021), *Uncertainty increases curiosity, but decreases happiness*. DOI: https://doi.org/10.1038/s41598-021-93464-6
   - Supports treating uncertainty as a controlled ingredient rather than maximizing it.

2. Chen et al. (2019), *How Serendipity Improves User Satisfaction with Recommendations? A Large-Scale User Evaluation*. DOI: https://doi.org/10.1145/3308558.3313469
   - Identifies timeliness, relevance, unexpectedness, and novelty as components of perceived serendipity.

3. Liao, Sundar, & Walther (2022), *User Trust in Recommendation Systems*. DOI: https://doi.org/10.1145/3491102.3501936
   - Supports careful explanation of recommendation basis and responsibility, with limits from its movie-recommendation context.

4. Spiers, Young, & Kuchenbecker (2023), *The S-BAN*. DOI: https://doi.org/10.1145/3555046
   - Supports testing a physical directional interface, not claiming that this specific product will improve attention.

5. Kidd & Hayden (2015), *The psychology and neuroscience of curiosity*. DOI: https://doi.org/10.1016/j.neuron.2015.09.010
   - Supports an information-gap framing, not a product-specific outcome claim.

6. Aron et al. (2000), *Couples' shared participation in novel and arousing activities and experienced relationship quality*. DOI: https://doi.org/10.1037/0022-3514.78.2.273
   - Only a conditional supporting reason for first testing close pairs. It does not justify relationship-improvement claims.

## Cited Technical and Legal Sources

### Place and Route Providers

- Kakao AI Mate Local product description: https://www.kakaocorp.com/page/detail/11619
- Kakao Map API activation and 2026-07-21 change: https://developers.kakao.com/docs/ko/kakaomap/common
- Kakao Map REST place and walking fields: https://developers.kakao.com/docs/ko/kakaomap/rest-api
- Kakao quota and additional-quota pricing: https://developers.kakao.com/docs/ko/getting-started/quota
- Kakao operating policy: https://developers.kakao.com/terms/ko/site-policies
- Kakao legacy Local REST API fields and search behavior: https://developers.kakao.com/docs/ko/local/dev-guide
- Kakao Mobility partner walking directions: https://developers.kakaomobility.com/affiliate/walking/directions.html
- Naver Cloud Directions driving documentation: https://api.ncloud-docs.com/docs/en/ai-naver-mapsdirections-driving
- TMAP API product capabilities, including pedestrian routes: https://www.tmapmobility.com/service/corporate/api

These links do not establish that one provider satisfies the full product. A dated capability, licensing, quota, and storage matrix remains mandatory.

### iOS

- Core Location manager: https://developer.apple.com/documentation/corelocation/cllocationmanager
- Heading accuracy: https://developer.apple.com/documentation/corelocation/clheading/headingaccuracy
- Notification permission: https://developer.apple.com/documentation/UserNotifications/asking-permission-to-use-notifications
- Core Bluetooth: https://developer.apple.com/documentation/corebluetooth

### Privacy and Location

- Korean Personal Information Protection Act: https://law.go.kr/lsInfoP.do?lsId=011357
- Korean Location Information Act, Article 15 reference: https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0015&lsiSeq=277359&urlMode=lsScJoRltInfoR

The blueprint is not legal advice. A current legal and platform-policy review is a release gate.

## Critical Risks

| Risk | Impact | Detection | Mitigation or fallback | Phase gate |
|---|---|---|---|---|
| menu, price, hours, or constraints cannot be verified | invalid recommendation | provider capability spike | lawful enrichment; limited-region manually verified pilot data; otherwise fail closed | before live recommendation |
| route access is unavailable or contractually unsuitable | no in-app compass route | bounded live call, project-specific rights review, and moderator pre-walk | alternative provider, limited test area, external map fallback | before supervised field test |
| LLM fabricates or overstates merit | unsafe or low-quality pool | source-linked evaluation set | structured output, deterministic evidence gate, no unsupported fact | before live recommendation |
| duplicate venue records distort the random pool | unequal effective probability | canonicalization fixtures and snapshot audit | versioned entity resolution, branch-aware deduplication, ordered-set digest | before live recommendation |
| retrieved pool is mistaken for all real-world venues | overstated randomness claim | copy and receipt review | limit uniformity claim to the frozen provider-retrieved qualified snapshot | before public claims |
| high-consequence condition is unknown or stale | medical or accessibility harm | source/freshness audit and adversarial benchmark | fail closed, no-fit, or supervised manually verified pilot | before live recommendation |
| GPS or heading is unstable | misleading arrow | device logs and route replay | confidence state, smoothing, reroute, stop guidance | before unsupervised test |
| phone heading is used for a separately held compass | systematically wrong physical pointing | bench and walking orientation tests | device heading or absolute-bearing contract; stale-message and interference handling | before BLE field test |
| destination concealment causes anxiety | abandonment or distrust | reveal and stop behavior, interview | secondary reveal, bounded information, neutral stop | Study A / Phase 3 |
| route geometry exposes the endpoint to a technical user | secrecy claim is overstated | client data-flow inspection | describe concealment as UI-level; evaluate segmented route delivery only if needed | before public claims |
| recovery friction feels punitive | dark-pattern criticism | stop usability observation | immediate pause, skippable reason after confirmed stop, friction only on new recommendation | Study A / Phase 3 |
| five-minute rule is ineffective or frustrating | repeated reroll or resentment | recovery timing distribution | revise timer after frozen experiment | after Study A / Phase 3 |
| physical display is unreadable | product-form failure | full-scale outdoor mock test | revise window, type, motion, or display technology | before final mockup |
| physical product adds no value over phone | weak product-design justification | comparative handling and preference study | revise interaction role; document negative result honestly | before BLE stretch |
| selection time does not improve | core value unsupported | counterbalanced Study B comparison | revise inputs and commit flow or reconsider thesis | after Study B / Phase 4 |
| destination reactions are poor | merit gate failure | place reaction distribution | revise evidence and merit policy, not compass UI by default | after field test |
| minimized analytics can still be reidentified | privacy harm | field-level data-flow and join review | explicit consent, short identifier lifetime, coarse timing/context, exclusions, retention and deletion limits | before analytics upload |
| distinctive menu text reveals the venue | concealment failure | cross-channel leakage cases | source-supported broad category fallback across app, hardware, logs, notifications, and study media | before field test |
| unauthenticated or guessable journey session reveals a hidden destination or precise route | privacy, safety, and provider abuse | service threat model, authorization tests, session-enumeration tests, log review | opaque expiring journey token, server-side provider keys, strict disclosure schema, rate limits, tested expiry/deletion | before provider-backed client integration |
| OS lifecycle or permission changes resume stale guidance | unsafe direction after interruption | process/background/permission fault injection and signed-device tests | persisted versioned reducer, revalidate all freshness/permission dependencies, remain non-pointing until ready | before supervised field test |
| compass interaction excludes assistive-technology or reduced-motion users | inaccessible safety controls and guidance | VoiceOver, Dynamic Type, contrast, reduced-motion, target-size, and one-handed device audit | accessible nonvisual alternatives, semantic status, immediate Stop, no identity leakage through labels | before supervised field test |

## Superseded v0.1 Decisions

The current implementation remains valid as v0.1 history, but these product decisions are superseded for vNext after written approval:

| v0.1 | Approved blueprint |
|---|---|
| always-visible Reroll | Stop, immediate reason, and guarded recovery |
| mock-only destination selection | live provider research and qualified random pool |
| general hidden-adventure framing | fast one-place selection plus hidden following |
| process and place questions | one delayed place reaction; process measured behaviorally |
| hardware as later optional hypothesis | physical high-fidelity mockup is a required final outcome |
| gaze reduction as broad priority | low-map product form remains; continuous menu motion is the prototype baseline and final hardware use depends on safety, legibility, reduced-motion, display, and power tests |

## Open Gates

- P0 app vertical: provider rights/sample, frozen field-level data/legal design, backend/session API plus threat model, and provider-backed deterministic no-fit evidence.
- Buildable foreground-first vNext iOS target with native reducer, persistence, permissions, route/network adapters, accessibility, privacy manifest, and layered tests.
- Bounded Kakao place/walking calls and project-specific permission for request-scoped normalization, derived audit data, and attribution.
- Legally usable evidence source for menu, price, hours, atmosphere, and critical negative signals.
- Target-iPhone HTTPS route/sensor capture and moderator pre-walk.
- Exact native iOS location/background authorization strategy and signed Core Bluetooth run; a Mac and provisioned iPhone remain external gates.
- User, legal, and technical approval of the proposed pilot analytics parameters and deletion path.
- H0 full-scale outdoor mock evidence, then user-approved H1 checkout and measured display/BLE/power behavior.
- Frozen Study B / Phase 4 endpoint, practical-difference threshold, and decision rule after Study A / Phase 3.
- Exact district qualification and supervised participant approval; fixture district names are not selections.
