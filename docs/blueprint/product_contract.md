# Product Contract

Status: approved design, pending written-spec review

Owner: Somewhere project

## Problem

People do not struggle with place selection only because information is missing. Candidate comparison, companion coordination, and responsibility for the final choice can keep the decision open even after many acceptable places have been found.

Existing map and recommendation products commonly return multiple candidates and leave the final comparison to the user. Somewhere tests a different promise: choose one acceptable place within agreed constraints and move directly to departure.

## Solution

> 조건을 충족하는 장소 하나를 확정하고, 정확한 장소는 잠시 숨긴 채, 비교 없이 이동을 시작하게 한다.

The product does not claim to find the objectively best place. It creates a qualified pool in which every destination is acceptable, then selects one uniformly at random.

## Target Context

- Product audience: not limited by party size.
- First validation context: two close participants.
- First categories: restaurants and cafes, analyzed separately.
- Expansion hypotheses: solo users and small groups.

Two-person use is a research priority, not a permanent product restriction.

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
| Selection efficiency | Did Somewhere help the user choose one place faster? | time to commit, number of candidates inspected |
| Action transition | Did the user act on the choice? | departure rate, time from commit to movement |
| Selection maintenance | Did the user reopen comparison? | preference-driven stop and recommendation restart |
| Navigation reliability | Could the user reach the destination? | arrival, route recovery, technical or safety interruption |
| Destination quality | Was the visited place worthwhile? | dislike, like, love, did not visit |

The project must not claim arrival as the unique product advantage. Arrival can fail for route, sensor, opening-hours, schedule, or environmental reasons. Those causes remain separate from the selection claim.

## Initial Survey Evidence

The current survey is directional evidence, not market proof:

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
- Stop guidance immediately when a stop is confirmed.
- Ask the stop reason immediately after guidance stops.
- Apply recovery friction to a new recommendation, not to the safety stop itself.
- Treat the physical compass as the final product form, not optional decoration.

## Non-Goals

- Winning a ranking-accuracy competition against map platforms.
- Full map browsing or turn-by-turn route UI.
- Detailed taste questionnaires in the baseline flow.
- Reviews, ratings, or popularity lists in the user interface.
- An always-on conversational recommendation agent.
- Unlimited reroll, candidate browsing, or swipe discovery.
- Claims that two-person use improves relationships.
