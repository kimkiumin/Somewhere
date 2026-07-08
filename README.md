# Blind Compass Discovery

A mobile-first prototype project for a hidden-destination compass adventure UX.

The user does not know the destination. The app gives only minimal direction and distance cues. The user follows those cues and discovers the destination at the end.

## Core Concept

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

This is not a standard map app, restaurant ranking app, or place review service. The product value is off-screen discovery, safe uncertainty, and the emotional experience of following the unknown.

## Current Status

- Stage: v0.1 prototype setup
- Validation status: not yet user-tested
- Prototype type: mobile-first web prototype
- Data source: mock destination data only
- Navigation: simulated direction and distance only

## v0.1 Scope

### Include

- Start Adventure button
- Mock destination selection
- Hidden destination state
- Compass arrow or direction indicator
- Approximate distance
- Simulated movement
- Reveal button
- Give Up button
- Reroll button
- Arrival state
- Destination reveal screen
- Post-experience restart and reroll controls

### Exclude

- Real GPS
- Real map API
- User accounts
- Payment
- Recommendation algorithm
- Reviews, ratings, rankings, or search UI
- Reservation
- Social sharing
- Hardware connection

## Recommended Structure

```text
blind-compass-discovery/
  README.md
  AGENTS.md
  .gitignore

  docs/
    project_brief.md          # copy from existing 01_PROJECT_BRIEF.md
    core_ux.md                # copy from existing 02_CORE_UX.md
    prototype_spec.md         # copy from existing 10_PROTOTYPE_SPEC_FOR_CODEX.md
    prototype_notes.md
    repo_setup_guide.md
    codex_first_prompt.md
    ui_review_checklist.md

  data/
    mock_destinations.json

  prototype/
    index.html                # created by Codex
    style.css                 # created by Codex
    app.js                    # created by Codex
```

## How to Run v0.1

If Codex builds the prototype with plain HTML/CSS/JS, open this file in a browser:

```text
prototype/index.html
```

No server, API key, database, or login should be required for v0.1.

## Design Guardrails

- Keep the destination hidden until reveal.
- Do not add a map.
- Do not add reviews, ratings, rankings, or search UI.
- Do not optimize for shortest route.
- Use direction, approximate distance, and mood hints only.
- Reveal, Give Up, and Reroll must remain available as safety controls.
- Keep the interface minimal, calm, and low-screen.

## Main Hypotheses Tested

1. Does a hidden destination feel intriguing rather than uncomfortable?
2. Does compass-style direction feel meaningfully different from a map app?
3. Do Reveal, Give Up, and Reroll make the uncertainty feel safe enough?
4. Does the reveal moment feel like a reward?
5. Is this experience strong enough to justify later hardware exploration?
