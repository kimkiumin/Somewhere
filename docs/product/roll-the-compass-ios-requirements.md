# Roll the compass! native iOS requirements

Status: owner-directed implementation requirements, 2026-08-20

This document translates the project owner's current product direction and
visual references into an implementation contract for the native iPhone/iPad app.
It does not make signing, TestFlight, field-study, provider-rights, legal, or
public-release claims. A newer explicit owner decision takes precedence; in all
other conflicts follow the authority order in [`../README.md`](../README.md).

## Product definition

`Roll the compass!` is the public product name. `Somewhere` remains the internal
repository, Xcode target, bundle/API namespace, and historical project name.

The app selects one evidence-qualified destination and helps the user reach it
without presenting a candidate list or a consumer map. The core experience is
safe uncertainty: the user sees only the minimum useful route-relative cue,
remaining distance, and approved broad disclosure until the journey ends.

```text
Launch → Conditions → Find one place → Follow → Near → Arrive → Reveal → Reaction
                                  ↘ Stop / Recovery safety paths
```

## Visual-reference interpretation

The owner-provided 2026-08-19 guidance mockup is a visual hierarchy reference,
not a literal-copy or data-authority document. Implement it as follows:

- Keep one dominant antique compass with an independently rotating needle.
- Place the next meaningful route-relative direction and its approximate
  distance above the compass when space permits.
- Keep total remaining route distance visually stronger than secondary
  disclosure.
- Secondary rows may show only a server-approved broad representative dish or
  category and price band.
- Keep `멈춤` immediately reachable and visually distinct.
- Use Korean product copy for the Korean build. English labels in a mockup are
  not copy requirements.
- Do not copy a mouse cursor, prototype controls, debug recovery buttons, or
  other capture artifacts into the shipping app.

The cue is not conventional turn-by-turn navigation. It is derived from the
reviewed walking route and a forward look-ahead point. Exact road names, route
lines, maps, and destination identity remain absent from active guidance.

## Screen contract

### Launch

- The first viewport contains the `Roll the compass!` wordmark, settings access,
  the primary compass action, and a visible `Conditions` path.
- Starting from the compass is the primary action.
- Redundant explanations, restore/debug controls, and destination content are
  not shown.
- The launch composition must fit the target portrait iPhone/iPad viewport
  without requiring a scroll to understand how to start.

### Conditions and profile

- Provide a clear back action.
- The current native discovery category is restaurants only. Keep the legacy
  cafe contract readable for historical evidence, but do not expose cafe
  selection in the native product.
- Support party size, maximum walking time, budget, and disclosure level in the
  journey conditions screen.
- Budget is a continuous, accessible slider with a final `상관없음` stop. The
  native exact stop is translated to the server's current coarse budget band at
  the transport boundary.
- Dietary preferences and allergies are persistent profile settings, reachable
  from the launch settings menu rather than repeated in every journey form.
  Starting a journey copies the saved profile into the request without making
  the user configure it again.
- The app may remember local preferences, but must not add account/login scope.
- One start action performs selection and commit; there is no candidate list.
- No-fit handling identifies which conditions should be reviewed without
  revealing rejected venues.

### Finding and ready

- Reuse the compass visual language while the server qualifies and selects one
  place.
- Do not expose provider payloads, pool members, venue identity, or route data.
- Avoid an extra confirmation screen when the one-tap start has already
  expressed intent.

### Following and near

- The compass needle is route-aware and updates dynamically from credible
  location and heading samples.
- Show approximate next-cue distance, total remaining distance, approved broad
  representative dish/category, and price band in stable positions.
- Suppress precise pointing when location, heading, route freshness, or corridor
  confidence is insufficient. Never manufacture a straight destination bearing
  as a safe walking route.
- Keep the main guidance surface usable in one viewport on the target portrait
  iPhone/iPad; avoid a scrolling dashboard during a walk.
- Do not show venue name, exact address, photos, ratings, reviews, a map, or a
  route polyline.
- There is no direct active-guidance Reveal button in the current owner-directed
  flow. The user first pauses through `멈춤`; safety reveal and external-map
  choices remain available through the paused/stopped path.

### Stop, reveal, and recovery

- Tapping `멈춤` pauses directional guidance immediately before any network
  response.
- Ask for explicit confirmation and provide a clear continue/resume path.
- A confirmed stop ends guidance and then offers a short optional reason with
  Skip.
- Technical route/sensor recovery is distinct from preference-driven replacement.
- A guarded new recommendation is available only after the current journey has
  ended and the user reviews the relevant conditions.
- External-map handoff warns that it reveals the destination before opening the
  provider.

### Arrival and reaction

- Arrival requires route endpoint proximity, acceptable accuracy, credible
  progress, and repeated samples/dwell; one raw GPS point is insufficient.
- A credible arrival reveals the destination automatically.
- Reveal content may include the approved name, address, descriptive fallback,
  and server-provided detail fields.
- Place reaction is delayed and remains one small, non-blocking question.

## Sensor and lifecycle requirements

- Release builds use Core Location location and `CLHeading`; movement course is
  not a production substitute for device heading.
- Simulator course-derived heading and physical-route replay are Debug-only.
- The app is foreground-only. Backgrounding stops precise guidance and returning
  requires fresh location and heading samples.
- Direction updates must use bounded angular motion and honor Reduce Motion.
- High-frequency sensor changes must not rebuild unrelated screen content when
  the visible guidance result is unchanged.

## Accessibility and platform behavior

- Interactive targets are at least 44 pt and expose stable accessibility labels
  and identifiers.
- Dynamic Type must not hide Stop or make the journey impossible to exit.
- Reduce Motion disables continuous searching/pulse movement while preserving
  the directional value.
- The warm visual surface uses an intentional light appearance until a tested
  dark palette exists; white-on-white text is not acceptable.
- Native back navigation is present where a reversible local screen transition
  exists. It must not silently undo an active server journey.

## Shipping and debug boundary

Shipping code must not include a visible map, destination list, manual movement
buttons, state restore panel, test coordinates, raw route diagnostics, or
prototype control panel. Deterministic states, course-derived simulator heading,
and physical route replay remain behind Debug launch arguments and `#if DEBUG`.

The checked-in bundle ID and API origin are non-production examples. Apple
credentials, signing files, private evidence, participant identity, and raw
field traces never enter Git.

## Acceptance checks

A review build is acceptable when it demonstrates:

1. first-use onboarding and profile setup;
2. one-tap hidden destination start;
3. dynamic route-relative direction and distance without identity leakage;
4. low-confidence suppression, off-route recovery, and immediate Stop;
5. guarded reveal/external-map behavior;
6. multi-sample arrival with automatic reveal;
7. delayed place reaction;
8. accessibility labels, Reduce Motion behavior, and target-viewport containment;
9. deterministic Simulator coverage and a real local Worker journey;
10. unchanged Release boundaries for test-only sensor replay.

## External work that remains blocked

- owner-approved production bundle identifier and canonical HTTPS origin;
- Apple development/distribution signing and TestFlight;
- exact physical-iPhone field scenarios and authority receipts;
- provider usage rights and independent Korean legal review;
- Cloudflare production authority, domain, and secrets;
- Study A/Study B and physical-product evidence.

These are external gates, not reasons to weaken or remove the implemented native
source and tests.
