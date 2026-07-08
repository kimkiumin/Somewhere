# AGENTS.md for Codex

생성일: 2026-07-07  
상태: v0.1

이 문서는 Codex 프로젝트의 `AGENTS.md`로 복사해서 사용할 수 있다.

---

# AGENTS.md

## Project Goal

Build and refine a mobile-first prototype for a hidden-destination compass adventure experience.

The user does not know the destination.
The app gives only minimal direction and distance cues.
The user follows the cues and discovers the destination at the end.

## Core Flow

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

## Product Principle

This is not a standard map app.  
This is not a restaurant ranking app.  
This is an off-screen discovery experience.

## Do

- Keep the UI minimal.
- Hide the destination name until reveal.
- Prioritize the core flow: start, follow, reveal, reroll, give up.
- Use mock destination data first.
- Simulate movement before adding real GPS.
- Add safety controls.
- Document every major change in `docs/decision_log.md` or `docs/prototype_notes.md`.
- Keep the prototype mobile-first.
- Make state transitions easy to understand.
- Use simple code before adding frameworks.

## Do Not

- Do not add maps in v0.1.
- Do not add real APIs in v0.1.
- Do not show full destination details too early.
- Do not add restaurant ratings, reviews, or ranking UI.
- Do not add login/account systems.
- Do not add complex recommendation algorithms yet.
- Do not make product strategy decisions without marking them as hypotheses.
- Do not turn this into a normal navigation app.

## Required Prototype States

- Idle
- Selecting
- Hidden destination ready
- Following
- Near
- Arrived
- Revealed
- Give up
- Reroll

## Acceptance Criteria

The prototype must allow a reviewer to experience:

1. Starting an unknown destination adventure
2. Seeing that the destination is hidden
3. Following direction/distance cues
4. Getting closer through simulated movement
5. Revealing the destination
6. Giving up safely
7. Rerolling to another hidden destination

## Preferred Stack

Start with plain HTML, CSS, and JavaScript unless otherwise instructed.

## File Structure

```text
prototype/
  index.html
  style.css
  app.js
data/
  mock_destinations.json
docs/
  prototype_notes.md
```

## UX Copy Tone

- Minimal
- Calm
- Slightly mysterious
- Safe
- Not too game-like

Example copy:
- “Follow the unknown.”
- “Your destination is hidden.”
- “You are getting closer.”
- “Reveal whenever you need.”
- “Arrived. Ready to discover?”

## Testing Notes

When adding features, document what hypothesis the feature tests.

Example:
- Feature: reveal button
- Hypothesis: users need control to feel safe while the destination is hidden.

