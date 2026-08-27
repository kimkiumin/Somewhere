# Product Contract

Status: approved written blueprint (2026-07-21)

Owner: Roll the compass! project

## Problem

People do not struggle with place selection only because information is missing. Candidate comparison, companion coordination, and responsibility for the final choice can keep the decision open even after many acceptable places have been found.

Existing map and recommendation products commonly return multiple candidates and leave the final comparison to the user. Roll the compass! tests a different promise: choose one evidence-qualified place within agreed constraints and move directly to departure.

## Solution

> 조건을 충족하는 장소 하나를 확정하고, 정확한 장소는 잠시 숨긴 채, 비교 없이 이동을 시작하게 한다.

The product does not claim to find the objectively best place. It creates a frozen pool of provider-retrieved venues that pass the current evidence policy, then selects one uniformly at random from that pool. Qualification means that the recorded evidence passed a versioned policy; it is not a guarantee of future quality, availability, or personal satisfaction.

## Target Context

- Product audience: not limited by party size.
- First validation unit: one dyad of two close participants making one shared decision.
- First categories: restaurants and cafes, analyzed separately.
- Expansion hypotheses: solo users and small groups.

Two-person use is a research priority, not a permanent product restriction. Shared confirmation by both participants is a study hypothesis, not a permanent product rule.

## User Inputs

Only non-negotiable constraints belong in the baseline flow:

- restaurant or cafe
- maximum walking distance or time
- budget band
- dietary restrictions
- accessibility requirements
- other high-cost failure conditions validated in research

Opening status and route feasibility are system checks, not badges the user must interpret. The interface does not display a generic `all conditions passed` message because passing is a prerequisite for recommendation.

## Core Value and Service Quality

| Layer | Question | Primary measures |
|---|---|---|
| Selection efficiency | Did Roll the compass! help the user choose one place faster? | time to commit, number of candidates inspected |
| Action transition | Did the user act on the choice? | departure rate, time from commit to movement |
| Selection maintenance | Did the user reopen comparison? | preference-driven stop and recommendation restart |
| Navigation reliability | Could the user reach the destination? | arrival, route recovery, technical or safety interruption |
| Destination quality | Was the visited place worthwhile? | dislike, like, love, did not visit |

The project must not claim arrival as the unique product advantage. Arrival can fail for route, sensor, opening-hours, schedule, or environmental reasons. Those causes remain separate from the selection claim.

## Initial Survey Evidence

The current survey is directional evidence, not market proof. The figures below are author-reported summaries from the project materials; an independently auditable raw or de-identified response table, questionnaire, missing-data rules, and calculation record are not yet included:

- 21 responses; 20 respondents were 18-29 and one was 30-39.
- 13/21 reported appointments, dates, or gatherings as the main place-decision context.
- 11/20 reported visiting as a pair.
- 18/21 chose a restaurant or cafe.
- 13/21 experienced place-search fatigue in the prior 30 days.
- 17/21 identified a burdensome stage in finding, comparing, coordinating, or selecting.
- 19/21 had delegated the final choice in the prior 30 days.
- 19/19 delegation targets were acquaintances, so trust in an unknown system remains unproven.

The sample is small, young, and convenience-based. It narrows the first test but cannot establish population prevalence.

## Approved Product Rules

- Return exactly one destination at a time.
- Never display a comparison list before commit.
- Reveal only bounded information before arrival.
- Keep a secondary destination reveal for safety and trust.
- Remove immediate Reroll from the active experience.
- Pause all directional guidance immediately when the user first presses Stop.
- Offer `Continue` and `Confirm stop`; continuing resumes the same session and confirming ends it.
- Show the stop-reason step after every confirmed stop, with a visible Skip action that never blocks exit.
- Apply recovery friction to a new recommendation, not to the safety stop itself.
- Apply the five-minute rule only to a new recommendation after an ended journey; never delay pause, stop, reveal, or another safety action.
- Treat a safety concern differently from a route or sensor failure: do not automatically resume, reroute, or open a map after a safety stop.
- Treat the physical compass as the final product form, not optional decoration.

## Non-Goals

- Winning a ranking-accuracy competition against map platforms.
- Full map browsing or turn-by-turn route UI.
- Detailed taste questionnaires in the baseline flow.
- Reviews, ratings, or popularity lists in the user interface.
- An always-on conversational recommendation agent.
- Unlimited reroll, candidate browsing, or swipe discovery.
- Claims that two-person use improves relationships.
