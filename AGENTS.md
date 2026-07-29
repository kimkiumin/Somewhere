# AGENTS.md

## Project Goal

Build and operate the mobile-only V2 hidden-destination service defined by
`BLUEPRINT.md`, while preserving v0.1/v0.2 as historical regression evidence.

The user does not know the destination. The app gives only minimal direction and distance cues. The user follows those cues and discovers the destination at the end.

## V2 Authority and Version Boundary

For V2 product and backend work, resolve conflicting sources in this exact
order:

1. The project owner's latest explicit direction.
2. Root [`BLUEPRINT.md`](BLUEPRINT.md) and its linked
   [`docs/blueprint/`](docs/blueprint/) documents. These are the authoritative
   approved V2 product direction.
3. The current V2 mobile-service design for implementation details that do not
   conflict with the blueprint.
4. Executable V2 contracts, code, and tests as implementation evidence; they
   must not silently override items 1–3.
5. The v0.2 application and frozen v0.1 prototype as historical evidence only.

The historical v0.2 and v0.1 sections below do not create V2 requirements. In
particular, V2 has no active Reroll control: it uses immediate Stop pause,
explicit stop confirmation, and guarded new recommendation only after a journey
has ended. Preserve the older documents and tests as versioned evidence rather
than rewriting them to look like V2.

## Historical v0.2 Working Surface

- Treat `/prototype` as the frozen v0.1 reference. Preserve its 11 Node tests
  and do not import it at runtime.
- Build current work in `/app` with Bun, strict TypeScript, Vite, Biome,
  Vitest, and Playwright.
- Real GPS, iPhone `webkitCompassHeading`, visibility recovery, and screen Wake
  Lock are intentionally in v0.2. The older v0.1 “no real GPS” rules below
  apply only to `/prototype`.
- Keep browser APIs in `/app/src/platform`, pure math/state in
  `/app/src/domain`, orchestration in `/app/src/application`, and DOM/CSS in
  `/app/src/ui`.
- The production bundle always uses real browser adapters. Deterministic
  sensors are allowed only in the separately compiled test-harness mode.
- The first field area is the manually curated Seoul Forest bundle. Do not add
  a live or paid place API.
- No background or locked-screen navigation promise. If it becomes required,
  apply the native-pivot gate in `/app/qa/field/README.md`.
- Read `/docs/README.md` before using older product or implementation documents.
  Current `/app` behavior is governed by this file, the root README and DESIGN,
  current code/tests, and the field runbook.

## Core Flow

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

## Product Principle

This is not a standard map app.  
This is not a restaurant ranking app.  
This is an off-screen discovery experience.

The core value is not recommendation accuracy. The core value is hidden destination discovery, safe uncertainty, and screen-reduced exploration.

## Frozen v0.1 Guidance

The remaining source list, simulation rules, file structure, and prototype
documentation requirements in this file apply only to `/prototype`. They are
historical product context for `/app`, not current implementation constraints.
In particular, do not apply the v0.1 “no real GPS” or “simulate movement first”
rules to the v0.2 sensor application.

## Source Documents for v0.1 Work

Before implementation, read these files if they exist:

```text
docs/project_brief.md
docs/core_ux.md
docs/prototype_spec.md
docs/prototype_notes.md
```

If a required source document is missing, do not invent product strategy. Continue only with the explicit v0.1 scope in this file and document the missing source in `docs/prototype_notes.md`.

## Do

- Keep the UI minimal.
- Hide the destination name until reveal.
- Prioritize the core flow: start, follow, reveal, reroll, give up.
- Use mock destination data first.
- Simulate movement before adding real GPS.
- Add safety controls.
- Keep the prototype mobile-first.
- Make state transitions easy to understand.
- Use simple code before adding frameworks.
- Document every major change in `docs/prototype_notes.md`.
- Mark strategy assumptions as hypotheses, not facts.

## Do Not

- Do not add maps in v0.1.
- Do not add real GPS in v0.1.
- Do not add real APIs in v0.1.
- Do not show destination name, exact address, photos, reviews, or ratings before reveal.
- Do not add restaurant rankings, review cards, or place-search UI.
- Do not add login or account systems.
- Do not add payment, reservation, coupons, or commerce features.
- Do not add social/community features unless explicitly requested.
- Do not add complex recommendation algorithms yet.
- Do not turn this into a normal navigation app.
- Do not make hardware decisions in code; hardware remains a later hypothesis.

## Required Prototype States

The prototype must support these states:

1. `Idle` — before starting
2. `Selecting` — choosing a safe hidden destination
3. `Hidden destination ready` — selected but not revealed
4. `Following` — compass/distance guidance
5. `Near` — user is close
6. `Arrived` — arrival threshold reached
7. `Revealed` — destination shown
8. `Give up` — user exits safely
9. `Reroll` — user selects another hidden destination

## Required Controls

The user must always have access to:

- Reveal
- Give Up
- Reroll

These controls are safety and trust mechanisms, not secondary features.

## Preferred Stack

Start with plain HTML, CSS, and JavaScript unless otherwise instructed.

Use React/Vite only if the user explicitly asks for a framework or if the existing repo already uses it.

## Expected File Structure

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
- Not promotional

Example copy:

- “Follow the unknown.”
- “Your destination is hidden.”
- “You are getting closer.”
- “Reveal whenever you need.”
- “Arrived. Ready to discover?”

## Visual Direction

- Low-screen interface
- Compass-like visual system
- Analog-inspired but modern
- Warm neutral background
- Subtle typography
- Clear hierarchy
- No map-like visual clutter

Avoid:

- Full map backgrounds
- Turn-by-turn route lines
- Restaurant ranking UI
- Review cards
- Gamified neon aesthetics
- Overly playful treasure-hunt graphics in v0.1

## Simulation Rules for v0.1

- Load one destination from `data/mock_destinations.json`.
- Hide the destination `name` until reveal.
- Show only hint, approximate distance, estimated time, and safety status.
- Use a “Move closer” button to simulate walking.
- Each simulated step should decrease distance by approximately 60–140 meters.
- The compass arrow may rotate slightly with each step.
- Enter `Near` state below 120 meters.
- Enter `Arrived` state below 30 meters.
- Allow reveal at any time for safety.

## Acceptance Criteria

The prototype is acceptable when a reviewer can experience:

1. Starting an unknown destination adventure
2. Seeing that the destination is hidden
3. Following direction and distance cues
4. Getting closer through simulated movement
5. Reaching an arrival state
6. Revealing the destination
7. Giving up safely
8. Rerolling to another hidden destination

## Documentation Requirement

When implementation is complete, update `docs/prototype_notes.md` with:

- Implemented states
- Implemented controls
- Major UI decisions
- Known limitations
- What hypothesis the prototype currently tests
- Recommended next iteration

## Testing Notes

When adding a feature, document what hypothesis it tests.

Example:

```text
Feature: Reveal button
Hypothesis: users need control to feel safe while the destination is hidden.
```
