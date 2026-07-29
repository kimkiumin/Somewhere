# Somewhere

A mobile-first hidden-destination compass experience.

The user does not know the destination. The app gives only minimal direction
and distance cues. The user follows those cues and discovers the destination at
the end.

## Core Concept

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

This is not a standard map app, restaurant ranking app, or place review
service. The product value is off-screen discovery, safe uncertainty, and the
emotional experience of following the unknown.

## Current Status

- Stage: v0.2 field-testable sensor PWA
- Live URL: <https://kimkiumin.github.io/Somewhere/>
- Primary device gate: iPhone 15 Pro Max, Safari and Home Screen
- Data source: seven manually curated Seoul Forest destinations
- Navigation: live GPS and device-facing compass direction; no map or route
- Validation status: deterministic browser harness complete; physical field
  gate remains device-only

The frozen dependency-free v0.1 simulation remains in `/prototype`. The current
application lives in `/app`. See [`docs/README.md`](docs/README.md) for the
current-versus-archived documentation authority order.

## v0.2 Scope

### Include

- Start Adventure with user-gesture sensor permission
- Runtime-validated curated destination selection
- Hidden destination state
- Live compass direction and GPS distance
- Signal accuracy, stale-data, visibility, and Wake Lock recovery
- Near hysteresis and three-sample latched arrival
- Reveal, Give Up, and Reroll safety controls
- Arrival and destination reveal states
- Memory-only field diagnostics with explicit Download and Discard
- Installable offline app shell with idle-only update approval

### Exclude

- Maps, route lines, and turn-by-turn navigation
- Live or paid place APIs
- User accounts, payments, reservations, or commerce
- Recommendation algorithms
- Reviews, ratings, rankings, or search UI
- Social sharing
- Locked-screen or background navigation
- Public safety certification

## Repository Structure

```text
Somewhere/
  README.md
  AGENTS.md
  DESIGN.md
  data/                         # frozen v0.1 mock data
  docs/README.md                # documentation authority index
  docs/                         # current plan history and v0.1 sources
  prototype/                    # frozen v0.1 simulation and 11 Node tests
  app/                          # v0.2 Bun/Vite/TypeScript sensor PWA
    src/domain/                 # pure geo, signal, arrival, journey logic
    src/application/            # controller, journey, diagnostics, updates
    src/platform/               # browser/WebKit and curated-data adapters
    src/testkit/                # compile-time-only deterministic harness
    e2e/                        # Chromium/WebKit scenarios
    qa/field/                   # iPhone runbook and evidence schema
  .github/workflows/app.yml     # verify and Pages deployment
```

## Ubuntu Development

Requirements are Bun 1.3.14 and Node 24. From `/app`:

```bash
bun ci
bunx playwright install --with-deps chromium webkit
bun run dev
bun run verify
```

`bun run verify` preserves the 11 frozen v0.1 regressions, then runs Biome,
strict TypeScript, 38 Vitest checks, a production build, and deterministic
Chromium/WebKit flows. No API key, account, database, or paid place provider is
required.

The production bundle always selects real browser adapters. The scripted sensor
harness exists only in the separate `test-harness` build mode and is audited
out of `/app/dist`.

## Physical Field Gate

Follow [`app/qa/field/README.md`](app/qa/field/README.md). A Linux WebKit run is
not evidence of iPhone hardware quality. Somewhere intentionally makes no
locked-screen or background-navigation promise.

## Design Guardrails

- Keep the destination hidden until reveal or explicit Give Up.
- Do not add a map, route line, review, rating, ranking, or search UI.
- Do not optimize for the shortest route.
- Use direction, approximate distance, and mood hints only.
- Reveal, Give Up, and Reroll remain available as safety controls.
- Remove the direction arrow whenever signals are not trustworthy.
- Keep the interface minimal, calm, and low-screen.

## Main Hypotheses Tested

1. Does a hidden destination feel intriguing rather than uncomfortable?
2. Does compass-style direction feel meaningfully different from a map app?
3. Do Reveal, Give Up, and Reroll make uncertainty feel safe enough?
4. Does the arrival and reveal moment feel like a reward?
5. Are screen-on Safari sensor quality and recovery strong enough to continue
   on the web before considering Capacitor/native?
