# Risk and Evidence Ledger

Status: approved blueprint evidence record with living gates

Last reviewed: 2026-07-21

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
| Current public place APIs may not expose every needed field | E/G | official provider docs | terms and coverage change | capability and rights matrix before implementation |
| Walking routing may require partnership | E/G | Kakao Mobility walking API is partner-only | other providers may differ | provider-neutral route adapter and fallback plan |
| iOS exposes location, heading, notifications, and BLE | E | Apple official documentation | capability does not prove field accuracy | native spike and field calibration required |

The survey summary has not yet been independently recalculated from a de-identified response table, instrument, missing-data rules, and calculation record. The links below establish cited support and implementation leads, not continuing verification of provider coverage, legal permission, or field performance.

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
- Kakao Local REST API fields and search behavior: https://developers.kakao.com/docs/ko/local/dev-guide
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
| route access is unavailable or contractually unsuitable | no in-app compass route | provider/legal review | alternative provider, limited test area, external map fallback | before supervised field test |
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

- Provider capability, licensing, quota, and storage matrix.
- Legally usable evidence source for menu, price, hours, atmosphere, and critical negative signals.
- Walking-route provider and commercial/research access.
- Exact iOS location/background authorization strategy.
- User, legal, and technical approval of the proposed pilot analytics parameters and deletion path.
- Physical display technology and realistic power behavior.
- Frozen Study B / Phase 4 endpoint, practical-difference threshold, and decision rule after Study A / Phase 3.
- Budget, schedule, fabrication method, and available hardware skills.
