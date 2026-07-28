# Somewhere v0.2 Sensor Web App Design

Date: 2026-07-28

Status: implementation-ready design, application code not started

Baseline: `main` at `5b54eeb053c22d207e3882fe0d2665ee0557cb6a`

## 1. Decision

Keep `/prototype` as the frozen, dependency-free v0.1 reference and build a
separate `/app` with Vanilla TypeScript and Vite.

The first deliverable is not a PWA. It is an HTTPS sensor feasibility build
that proves live location, iPhone compass heading, visibility recovery, and
Screen Wake Lock on an iPhone 15 Pro Max. The hidden-destination journey is
implemented only after that gate passes. Manifest and service-worker packaging
come later.

This preserves the product's small, calm, plain-web character while adding the
typed boundaries and deterministic harness required for real sensors.

## 2. Product boundary

### Goal

Prove that one person can safely follow a hidden destination outdoors using a
screen-on, low-attention compass experience:

```text
Start
→ grant capabilities
→ receive a hidden destination
→ follow direction and distance
→ approach
→ arrive
→ reveal
```

Reveal, Give Up, and Reroll remain trust and safety controls throughout the
journey.

### First acceptance surface

- Primary device: iPhone 15 Pro Max.
- Primary browser: Safari, followed by Add-to-Home-Screen mode.
- Data: 5–10 manually inspected destinations in one defined field-test area.
- Environments: one open-sky walk and one urban/building-canyon walk.
- Development host: Ubuntu.
- Field origin: one stable GitHub Pages HTTPS URL.

### Explicit non-goals

- No map, route line, turn-by-turn directions, or shortest-path logic.
- No Google Places or other paid place provider.
- No accounts, backend, analytics, telemetry upload, payments, ratings, or
  social features.
- No locked-screen or background navigation promise.
- No public safety certification.
- No claim that client-side destination data is cryptographically hidden.
- No rewrite or runtime import of `/prototype`.

The arrow is a direction cue, not a route. Field testing is restricted to a
manually inspected area and the user must continue to follow streets,
crossings, and local rules.

## 3. Delivery phases and gates

### Phase 0: freeze the baseline

- Preserve `/prototype` behavior and its 11 Node tests.
- Keep its CommonJS/browser semantics unchanged.
- Do not add a root `"type": "module"`.
- Let `/app` verification invoke the prototype tests as an external regression
  surface; do not share runtime modules.

Exit gate: `node --test prototype/app.test.js` passes at the baseline.

### Phase 1: HTTPS sensor feasibility

Build the smallest Vanilla TypeScript/Vite screen that exposes:

- capability support and permission outcomes;
- location, accuracy, and timestamp;
- iOS compass heading and compass accuracy;
- document visibility transitions;
- Wake Lock acquire, release, and reacquire events;
- subscription/listener counts;
- an in-memory diagnostic trace with explicit JSON export and discard.

Do not add a destination flow, manifest, or service worker in this phase.

Run Safari-tab and Add-to-Home-Screen tests on the fixed Pages origin. A Home
Screen web app does not require a service worker on WebKit, so Wake Lock can be
tested before PWA caching is introduced.

Exit gate: two 15–20 minute traces, open sky and urban canyon, show usable
permission, fresh-signal, visibility-recovery, and screen-on behavior. If the
hard native-pivot criteria in section 15 are met, pause web journey work.

### Phase 2: field-testable journey

Add the typed journey domain, curated destinations, true-bearing normalization,
signal quality gates, hidden flow, Near/Arrived behavior, and persistent safety
controls.

Exit gate: deterministic tests pass and one real outdoor journey reaches a true
arrival without false arrival or stale guidance.

### Phase 3: PWA packaging

Add manifest, icons, standalone presentation, minimal app-shell precaching, and
an idle-only update prompt.

Exit gate: repeat the field acceptance in Safari and Home Screen modes.

### Phase 4: compatibility expansion

Measure Android and other devices through a capability matrix. Add or replace
platform adapters from evidence; do not generalize iPhone-specific fields into
the domain.

## 4. Repository and package shape

```text
Somewhere/
├─ prototype/                         # frozen v0.1 reference
├─ data/                              # existing v0.1 fixtures
├─ app/
│  ├─ package.json
│  ├─ bun.lock
│  ├─ tsconfig.json
│  ├─ vite.config.ts
│  ├─ vitest.config.ts
│  ├─ playwright.config.ts
│  ├─ biome.json
│  ├─ index.html
│  ├─ src/
│  │  ├─ domain/
│  │  │  ├─ journey.ts
│  │  │  ├─ geo.ts
│  │  │  └─ signals.ts
│  │  ├─ application/
│  │  │  ├─ model.ts
│  │  │  ├─ ports.ts
│  │  │  └─ controller.ts
│  │  ├─ platform/
│  │  │  ├─ browser-location.ts
│  │  │  ├─ browser-heading.ts
│  │  │  ├─ browser-lifecycle.ts
│  │  │  └─ curated-destinations.ts
│  │  ├─ ui/
│  │  │  ├─ render.ts
│  │  │  ├─ compass.ts
│  │  │  ├─ diagnostics.ts
│  │  │  └─ styles.css
│  │  ├─ testkit/
│  │  │  ├─ fakes.ts
│  │  │  └─ scripted-walk.ts
│  │  ├─ data/
│  │  │  └─ curated-destinations.json
│  │  └─ main.ts
│  ├─ e2e/
│  └─ qa/field/
├─ .nvmrc                             # Node 24
└─ .github/workflows/app.yml
```

Start with these cohesive files. Split them only when measured complexity
demands it; do not pre-create generic event buses, command registries, stores,
or provider frameworks.

`/app` owns its ESM package and lockfile. Bun 1.3.14 is pinned locally and in
Actions, while Node 24 remains pinned for the frozen prototype regression and
browser tooling compatibility. Dependencies are installed with `bun ci`.

## 5. Dependency rules

### `domain`

- Pure types and functions.
- No DOM, `navigator`, storage, network, timers, or direct time reads.
- Owns distance, true bearing, angle normalization, signal policy evaluation,
  journey transitions, and arrival gates.

### `application`

- Owns the full model and command handling.
- Starts and stops capability subscriptions.
- Coordinates pause/resume and Wake Lock.
- Derives guidance from journey state plus signal health.
- Knows only ports, never browser globals.

### `platform`

- Is the only layer that accesses Web APIs and WebKit-specific fields.
- Runtime-validates unknown browser and JSON values.
- Normalizes browser errors into typed outcomes.
- Emits typed samples with their north reference intact.

### `ui`

- Renders semantic HTML from an application view model.
- Sends typed commands back to the controller.
- Does not calculate distance, bearing, arrival, or signal validity.
- Updates only the compass transform on the high-frequency path.

### `testkit`

- Implements the same ports as production adapters.
- Provides deterministic permissions, clocks, visibility changes, Wake Lock
  release events, locations, headings, and scripted walks.
- Is selected only in an e2e compile mode, never by a production runtime query
  parameter.

`main.ts` is the composition root. Production composition always selects real
browser adapters.

## 6. State model

Journey state and capability state are orthogonal.

```ts
type JourneyState =
  | { phase: "idle" }
  | { phase: "selecting" }
  | { phase: "hidden"; destinationId: string }
  | { phase: "following"; destinationId: string }
  | { phase: "near"; destinationId: string }
  | { phase: "arrived"; destinationId: string }
  | { phase: "revealed"; destinationId: string }
  | { phase: "give-up"; destinationId: string };

type SignalState<T> =
  | { status: "idle" }
  | { status: "requesting-permission" }
  | { status: "acquiring" }
  | { status: "live"; sample: T }
  | { status: "degraded"; sample?: T; reason: SignalProblem }
  | { status: "denied" }
  | { status: "unsupported" };
```

The application model holds independent location, heading, visibility, and
Wake Lock states. `GuidanceState` is derived from them:

```ts
type GuidanceState =
  | { status: "inactive" }
  | { status: "paused"; reasons: readonly GuidancePauseReason[] }
  | {
      status: "live";
      distanceM: number;
      targetBearingTrueDeg: number;
      deviceHeadingTrueDeg: number;
      relativeAngleDeg: number;
    };
```

Bad signals pause guidance without discarding the hidden destination or journey
progress. Reveal, Give Up, and Reroll remain available.

## 7. Capability ports and lifecycle

Keep contracts small. Representative shapes:

```ts
type Unsubscribe = () => void;

interface LocationSource {
  subscribe(
    onSample: (sample: LocationSample) => void,
    onFailure: (failure: LocationFailure) => void,
  ): Unsubscribe;
}

interface HeadingSource {
  requestPermissionFromUserGesture(): Promise<PermissionOutcome>;
  subscribe(
    onSample: (sample: HeadingSample) => void,
    onFailure: (failure: HeadingFailure) => void,
  ): Unsubscribe;
}

interface VisibilitySource {
  current(): "visible" | "hidden";
  subscribe(listener: (state: "visible" | "hidden") => void): Unsubscribe;
}

interface WakeLockSource {
  acquire(): Promise<WakeLockOutcome>;
  release(): Promise<void>;
  subscribeToRelease(listener: () => void): Unsubscribe;
}
```

The Start button handler calls the application Start command directly. The
controller initiates the orientation permission request, geolocation watch, and
Wake Lock request synchronously from that user-activation call stack before
awaiting results. Permission prompts are never launched from page load, a timer,
or a detached effect.

Every subscription returns an idempotent cleanup function. The controller owns
exactly one active subscription per source and exposes counts in diagnostics.

When the document becomes hidden:

1. pause guidance;
2. invalidate the last heading;
3. stop or suspend sensor subscriptions;
4. release Wake Lock;
5. retain the journey and safety controls.

When it becomes visible:

1. reacquire Wake Lock if the journey is active;
2. restart sources;
3. remain paused until both fresh location and heading samples pass policy;
4. only then restore the arrow.

## 8. Heading and north-reference correctness

The iPhone adapter prefers:

- `webkitCompassHeading` for heading;
- `webkitCompassAccuracy` for measured accuracy;
- `-1` accuracy as unusable/un-calibrated.

It must not convert `alpha` into a real-world heading on iOS. Geolocation
`coords.heading` is movement course relative to true north, not device-facing
direction, so it may be a diagnostic cross-check while walking but not the
stationary compass source.

```ts
type NorthReference = "magnetic" | "true" | "relative";

type HeadingSample = {
  degrees: number;
  reference: "magnetic" | "true";
  accuracyDeg: number | null;
  capturedAtMs: number;
};

type Declination = {
  degreesEast: number;
  model: "WMM2025";
  calculatedAt: string;
  center: Coordinates;
  validRadiusM: number;
};
```

Coordinate-derived destination bearings are true-north referenced. The domain
may compute a relative angle only after a `DeclinationProvider` has converted a
magnetic device heading to true north:

```text
true heading = magnetic heading + declination
```

East declination is positive and west declination negative. The first field
area stores one manually calculated NOAA WMM2025 value with provenance and a
validity radius. Outside that area, with missing metadata, or after its declared
review date, guidance pauses rather than guessing.

Do not add a WMM library in the first milestone. Reconsider an embedded model
when the curated area expands beyond a city-scale test.

## 9. Location and arrival policy

Initial values are field-test hypotheses, centralized in one policy object and
recorded in every diagnostic export:

```ts
const initialPolicy = {
  locationMaxAgeMs: 10_000,
  maxGuidanceAccuracyM: 50,
  nearEnterM: 120,
  nearExitM: 150,
  arrivedM: 30,
  maxArrivalAccuracyM: 25,
  arrivalSamplesRequired: 3,
  arrivalWindowMs: 12_000,
  maxMeasuredHeadingAccuracyDeg: 25,
} as const;
```

Rules:

- Reject non-finite coordinates, timestamps, accuracy, distance, and headings.
- Pause guidance for an old or insufficiently accurate location.
- Enter Near at or below 120 m; leave it only at or above 150 m.
- Treat an arrival as a candidate only at or below 30 m with accuracy at or
  below 25 m.
- Require three qualifying samples within 12 seconds.
- Latch Arrived permanently for that journey.
- Never arrive from a single sample or a single GPS jump.
- Preserve raw samples in the explicit diagnostic export so thresholds can be
  tuned from evidence.

Heading silence alone is not a stale timer because a stationary device may emit
no significant-change event. Invalidate heading on hidden/resume, adapter
restart, permission change, non-finite data, iOS accuracy `-1`, measured
accuracy above policy, or absence of a fresh post-resume sample.

## 10. Destination data

Use one runtime-validated, versioned bundle:

```json
{
  "schemaVersion": 1,
  "fieldArea": {
    "id": "first-field-area",
    "center": { "latitude": 0, "longitude": 0 },
    "validRadiusM": 3000,
    "startZoneNote": "Manually inspected personal-test area",
    "declination": {
      "degreesEast": 0,
      "model": "WMM2025",
      "calculatedAt": "YYYY-MM-DD",
      "reviewAfter": "YYYY-MM-DD",
      "source": "NOAA NCEI"
    }
  },
  "destinations": []
}
```

Each destination contains a stable ID, coordinates, pre-reveal hint, approximate
distance/time inputs, reveal-only name/category/description, and a manual
curation note. The runtime validator rejects the entire bundle on malformed
coordinates, duplicate IDs, missing reveal fields, or an invalid field-area
relationship.

`safe` means manually inspected for this personal field test only. It must not
appear as an automated route or public-safety judgment.

## 11. Rendering and low-screen UX

Use two update paths:

```text
low frequency
commands + permissions + failures + journey phase
→ application snapshot
→ semantic screen render

high frequency
latest normalized relative angle
→ requestAnimationFrame
→ compass needle CSS transform only
```

Do not replace the full DOM on every heading event. Circular interpolation must
take the shortest angular path across 359°/0°. Visual smoothing never changes
domain bearing or arrival calculations.

The screen keeps a quiet field-instrument identity from `DESIGN.md`: cream
canvas, deep green compass, restrained blue, orange only for arrival/reveal.

Acceptance constraints:

- At 430×932 and 390×844 portrait viewports, including safe-area insets, the
  compass, essential guidance, Reveal, and Give Up are reachable without
  scrolling.
- Reroll remains available but may sit below the two safety controls.
- No map-like background, route line, rating card, or development-state badge
  appears in the consumer journey.
- Text alternatives communicate direction/distance; live announcements are
  throttled.
- Reduced-motion users get direct angle updates without decorative motion.
- Focus remains stable across low-frequency renders.

## 12. Diagnostics and privacy

The trace is memory-only by default. Export requires a deliberate user action
and produces versioned JSON containing:

- schema version and policy values;
- source commit/build SHA;
- exact iOS/Safari version and browser mode;
- user agent and detected capabilities;
- user-labelled environment;
- session timestamps;
- permission, visibility, Wake Lock, and subscription events;
- location samples and failures;
- raw and normalized heading samples and failures;
- guidance pause/resume and journey transitions;
- manual test markers.

Heading trace storage is capped at 5 Hz. The live compass may still consume the
latest sample on each animation frame.

The export surface warns that exact coordinates are sensitive and offers
Download and Discard. There is no automatic upload, analytics event, service
worker cache entry, or background persistence for traces in the first
milestone.

## 13. Automated harness

### Commands

From `/app`:

```text
bun run dev             Ubuntu desktop development
bun run typecheck       strict tsc --noEmit
bun run lint            Biome 2 recommended + type-aware rules
bun run test:unit       Vitest in Node
bun run test:e2e        Playwright deterministic browser flows
bun run test:prototype  frozen v0.1 Node regression
bun run build           production Vite build
bun run verify          all gates in a fixed order
```

Vite transpilation is not type checking, so `typecheck` is a separate required
gate. The one-time Ubuntu browser setup is:

```text
bunx playwright install --with-deps chromium webkit
```

Biome 2 recommended project/type domains and `noFloatingPromises` are part of
verification. Strict TypeScript plus explicit exhaustive `assertNever` checks
protect discriminated state handling. Biome's type inference is intentionally
paired with `tsc`; neither gate substitutes for the other.

### TypeScript baseline

Use strict mode plus:

```json
{
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "useUnknownInCatchVariables": true,
  "noFallthroughCasesInSwitch": true
}
```

No `any`, ignored TypeScript errors, or unchecked JSON/browser values.

### Unit and integration scenarios

- Haversine distance and true bearing.
- 0°/360° normalization and shortest angular delta.
- magnetic-to-true conversion with east/west declination.
- field-area validity.
- Near hysteresis and latched Arrived.
- accuracy, age, and multi-sample arrival gates.
- destination identity remains hidden before reveal.
- permission denied, unsupported, unavailable, and malformed samples.
- heading accuracy `-1`.
- hidden → visible requires fresh samples.
- Wake Lock released → reacquired.
- duplicate Start/resume does not duplicate subscriptions.
- Reroll excludes the current destination deterministically.

### Playwright scenarios

- Full hidden → following → near → arrived → reveal journey.
- Give Up and Reroll from active and paused states.
- Location and heading denial.
- poor/stale location pauses guidance.
- hidden/visible recovery.
- Wake Lock release event.
- 359° → 1° visual rotation.
- GPS jump cannot arrive.
- first-viewport safety controls at 430×932 and 390×844.
- keyboard/focus and reduced-motion smoke checks.

Playwright uses Chromium and WebKit projects. Its WebKit result is a regression
signal, not proof of iOS Safari hardware behavior.

Do not add a coverage percentage gate initially. Scenario coverage and the
real-device gate are the meaningful safety evidence.

## 14. CI, HTTPS deployment, and PWA updates

Use one staged GitHub Actions workflow:

1. Checkout.
2. Set up Bun 1.3.14 with cache keyed by `app/bun.lock`, and Node 24 for the
   frozen prototype regression.
3. `bun ci` in `/app`.
4. Install Playwright Chromium and WebKit with their Ubuntu dependencies.
5. `bun run verify`.
6. Upload the verified production `app/dist` artifact.
7. On `main` only, deploy that artifact to GitHub Pages with Pages write and
   OIDC permissions scoped to the deploy job.

The stable first field URL is:

```text
https://kimkiumin.github.io/Somewhere/
```

Vite uses `base: "/Somewhere/"`. Pull requests run verification but do not get
field-test preview origins, avoiding permission history split across URLs.

In Phase 3, `vite-plugin-pwa` uses `generateSW`:

- precache HTML, JS, CSS, icons, and bundled destination data only;
- no runtime API or diagnostic caching;
- no automatic reload;
- if an update arrives during a journey, defer the prompt until idle;
- activate only after the user accepts the idle-state prompt.

PWA packaging is not a sensor-capability proof.

## 15. Real-device QA and native pivot

Record the exact build SHA, iOS/Safari version, browser mode, field area, weather
context, start/end time, and exported trace for every run.

Run both Safari and Home Screen modes, including:

- Start-triggered permission grant and denial;
- first location and heading acquisition;
- compass accuracy and a deliberate 359°/0° rotation;
- open-sky and urban-canyon accuracy;
- temporary app switch and return;
- Wake Lock release and reacquisition;
- poor-signal pause and retry;
- Reveal, Give Up, and Reroll;
- listener/subscription counts;
- a real arrival and a non-arrival control segment.

Hard rules:

- Never show the arrow after resume until fresh valid location and heading
  samples exist.
- Never produce a false Arrived.
- Arrived occurs at most once and stays latched.
- Safety controls remain reachable throughout the walk.

Investigate Capacitor/native before further web investment when two controlled
runs, after one focused recovery or calibration fix, still show any of:

- Start cannot reliably initiate required permissions.
- Fresh location or device-facing heading does not recover after visibility
  return.
- Wake Lock cannot sustain the agreed screen-on walk.
- Heading remains frozen, inverted, or materially unusable.
- The product requirement changes to locked-screen or background guidance.

Capacitor is an adapter/container option, not a guarantee. Native plugins,
sensor behavior, and a macOS/Xcode build-and-sign path require their own design
and acceptance.

## 16. Deferred decisions

These are deliberately deferred, not missing:

- A live places provider: revisit only after the curated flow proves value.
- Embedded WMM calculation: revisit when multiple field areas make a stored
  declination impractical.
- React or another UI framework: revisit when component, routing, or team scale
  creates a demonstrated need.
- Native packaging: evidence-triggered by section 15.
- Background guidance, accounts, telemetry, maps, and public launch safety:
  outside v0.2.

## 17. Implementation order

1. Add `/app` package/toolchain and make frozen prototype tests part of
   verification.
2. Implement typed capability ports, browser adapters, diagnostics, and the
   Phase 1 screen.
3. Deploy the verified sensor build to the stable Pages origin.
4. Run and review the two Phase 1 iPhone traces.
5. If the feasibility gate passes, port v0.1 journey behavior into typed domain
   tests and add the curated field-area data.
6. Implement the journey controller and low/high-frequency UI paths.
7. Run deterministic browser QA and the real outdoor journey gate.
8. Add PWA packaging and repeat field acceptance.

Each phase stops at its gate. A green desktop build never substitutes for the
required iPhone observation.

## 18. Sources of truth

- Repository product sources: `README.md`, `AGENTS.md`, `DESIGN.md`,
  `docs/project_brief.md`, `docs/core_ux.md`,
  `docs/design_principles.md`, `docs/prototype_spec.md`, and
  `docs/prototype_notes.md`.
- Device Orientation and Motion:
  <https://www.w3.org/TR/orientation-event/>
- Geolocation:
  <https://www.w3.org/TR/geolocation/>
- Screen Wake Lock:
  <https://www.w3.org/TR/screen-wake-lock/>
- Apple `DeviceOrientationEvent`:
  <https://developer.apple.com/documentation/webkitjs/deviceorientationevent>
- WebKit Safari 18.4 features:
  <https://webkit.org/blog/16574/webkit-features-in-safari-18-4/>
- NOAA magnetic declination:
  <https://www.ncei.noaa.gov/products/magnetic-declination>
- NOAA World Magnetic Model:
  <https://www.ncei.noaa.gov/products/world-magnetic-model>
- Vite static deployment:
  <https://vite.dev/guide/static-deploy.html>
- GitHub Pages HTTPS:
  <https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https>
- Vitest:
  <https://vitest.dev/>
- Playwright browsers:
  <https://playwright.dev/docs/browsers>
- Vite PWA:
  <https://vite-pwa-org.netlify.app/>
- Capacitor:
  <https://capacitorjs.com/docs>
- Xcode requirements:
  <https://developer.apple.com/xcode/system-requirements/>
