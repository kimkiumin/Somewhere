# Somewhere V2 Mobile Design System

## 1. Atmosphere & Identity

Somewhere feels like a quiet field instrument: calm, analog, slightly
mysterious, and safe. One route-qualified direction cue carries the experience.
When route or sensor confidence fails, the cue disappears instead of falling
back to a direct destination bearing.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--color-canvas` | `#f5f1e8` | `#101311` | App background |
| Surface/secondary | `--color-panel` | `#fffdf8` | `#171b18` | Primary panel |
| Surface/muted | `--color-muted` | `#e6ede3` | `#20271f` | Safe status, secondary bands |
| Surface/deep | `--color-deep` | `#17231c` | `#f5f1e8` | Compass stage and primary actions |
| Text/primary | `--color-text` | `#17231c` | `#f7f3ea` | Main copy |
| Text/secondary | `--color-text-muted` | `#5d665b` | `#aab3a7` | Hints, metadata |
| Text/inverse | `--color-text-inverse` | `#fffdf8` | `#17231c` | Text on dark surfaces |
| Border/default | `--color-border` | `#d8ddd2` | `#30382f` | Dividers and controls |
| Accent/primary | `--color-accent` | `#2d5b73` | `#8fbdd2` | Direction, focus, active cue |
| Accent/warm | `--color-warm` | `#8f5233` | `#d89a73` | Arrival and reveal cue |
| Status/safe | `--color-safe` | `#3f6b4a` | `#8cc99a` | Safety confirmation |
| Status/caution | `--color-caution` | `#805827` | `#e0b16b` | Stop, uncertainty |

### Rules

- The neutral field must not become a generic cream-only palette; deep green, compass blue, and warm reveal accents carry contrast.
- Destination identity colors are never used before reveal.
- Accent color appears only for interaction, direction, focus, or arrival feedback.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Display | `clamp(2.25rem, 8vw, 4.5rem)` | 650 | 1.02 | 0 | Product title, reveal title |
| H1 | `2rem` | 650 | 1.15 | 0 | Main state heading |
| H2 | `1.5rem` | 620 | 1.25 | 0 | Panel headings |
| H3 | `1.125rem` | 620 | 1.35 | 0 | Compact sections |
| Body/lg | `1.125rem` | 400 | 1.55 | 0 | Lead text |
| Body | `1rem` | 400 | 1.55 | 0 | Default text |
| Body/sm | `0.875rem` | 450 | 1.45 | 0 | Supporting text |
| Caption | `0.75rem` | 620 | 1.35 | 0 | Labels and status |

### Font Stack

- Primary: `SF Pro Display`, `SF Pro Text`, `Aptos`, `Helvetica Neue`, `Arial`, sans-serif
- Mono: `SFMono-Regular`, `Cascadia Mono`, `Consolas`, monospace

### Rules

- Letter spacing stays at 0 across the interface.
- Body text never drops below 14px.
- Display text is reserved for the opening and reveal moments only.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `4px` | Tight inline gaps |
| `--space-2` | `8px` | Button icon gap, compact labels |
| `--space-3` | `12px` | Control padding |
| `--space-4` | `16px` | Default gap |
| `--space-5` | `20px` | Comfortable inline groups |
| `--space-6` | `24px` | Panel padding |
| `--space-8` | `32px` | Major groups |
| `--space-10` | `40px` | Page rhythm |
| `--space-12` | `48px` | Large state breaks |

### Grid

- Max app width: 480px for the mobile-first instrument shell.
- Wide viewports keep one centered phone canvas; no tablet or desktop product
  layout is introduced.
- Acceptance widths are 320px, 390px, and 430px. A wider browser is a
  containment check, not a separate product breakpoint.

### Rules

- Controls and counters have stable dimensions to prevent state text from shifting the compass.
- The primary action area remains reachable near the lower half of the screen.
- Mobile frames include all four `env(safe-area-inset-*)` values.
- Interactive targets are at least 48px high; icon-only controls are not used in the journey.
- At 390×844 and 430×932, the compass, status, reveal, and Stop controls fit in
  the first viewport.

## 5. Components

### App Shell
- **Structure**: full-height `main` with a constrained inner `.app-frame`.
- **Variants**: journey, revealed, stopped.
- **Spacing**: `--space-4` to `--space-8`.
- **States**: default, loading, empty, error.
- **Accessibility**: one `h1`, live state summary, landmarks.
- **Motion**: state changes fade/translate using standard timing.

### Compass Stage
- **Structure**: circular dial, rotating arrow, distance readout, status line.
- **Variants**: following, near, arrived.
- **Spacing**: fixed square aspect ratio.
- **States**: default, active, arrived.
- **Accessibility**: text distance and status duplicate visual direction.
- **Motion**: arrow rotates with `transform` only.

### Control Button
- **Structure**: semantic `button` with optional inline SVG icon.
- **Variants**: primary, secondary, quiet, caution.
- **Spacing**: `--space-3` vertical and `--space-4` horizontal.
- **States**: default, hover, active, focus, disabled.
- **Accessibility**: visible labels, focus ring, disabled semantics.
- **Motion**: active press scales to 0.98.

### Hidden Destination Panel
- **Structure**: label, hint, approximate distance, time, safety.
- **Variants**: hidden, near, arrived.
- **Spacing**: `--space-5` and `--space-6`.
- **States**: default, updating, arrived.
- **Accessibility**: no hidden destination name appears before reveal.
- **Motion**: subtle opacity update on distance change.

### Signal Status
- **Structure**: short status label, one plain-language explanation, optional Retry action.
- **Variants**: acquiring, paused, denied, unsupported, recovered.
- **States**: the direction arrow is absent whenever guidance is not live.
- **Accessibility**: status text is the source of truth; color never carries the state alone.
- **Copy**: names the next safe action without exposing developer-state vocabulary.

### Safety Controls
- **Structure**: `목적지 확인` and immediate `Stop` remain available during
  guidance.
- **Variants**: reveal uses secondary emphasis; Stop uses quiet caution.
- **States**: neither depends on sensor quality. Reveal does not end guidance.
- **Recovery**: Stop removes direction immediately. Continue or explicit stop
  confirmation follows the V2 lifecycle; there is no active Reroll.

### Diagnostics Drawer
- **Boundary**: available only in the separately compiled field-diagnostics
  build; absent from production and test-harness assets.
- **Structure**: capability table, subscription counts, trace controls,
  environment label.
- **Privacy**: warns that exported coordinates are sensitive; traces are memory-only until Download.
- **States**: Download, Discard, and Close are explicit text controls.

### Implementation Reference
- The executable UI and visual-evidence scenarios are the implementation
  reference. There is no separate production showcase route.
- Production, test-harness, and field-diagnostics boundaries are verified as
  distinct builds.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease-out | Button press |
| Standard | 220ms | ease-in-out | State copy update |
| Emphasis | 420ms | cubic-bezier(0.16, 1, 0.3, 1) | Reveal and arrival |

### Rules

- Only `transform` and `opacity` are animated.
- Respect `prefers-reduced-motion`.
- Motion must communicate state change, not decoration.
- Compass angles cross north by the shortest path; reduced-motion mode applies the target angle immediately.
- Low-frequency state changes may re-render a screen. High-frequency heading changes update only the compass needle transform.

## 7. Depth & Surface

### Strategy

Mixed, with border-led panels and one dark tonal compass stage.

| Level | Value | Usage |
|-------|-------|-------|
| Border/default | `1px solid var(--color-border)` | Panels, controls |
| Shadow/subtle | `0 16px 48px rgba(23, 35, 28, 0.08)` | Main shell only |
| Tonal/deep | `var(--color-deep)` | Compass stage |

Depth stays quiet. No floating decorative shapes, no map-like backgrounds, and no nested card stacks.

## 8. V2 State Contract

| Product state | Compass | Accent | Essential controls |
|---|---|---|---|
| Idle | Quiet instrument preview | Deep green | Start adventure |
| Acquiring | Dial present, arrow absent | Muted blue | Stop |
| Hidden ready | Destination identity absent | Deep green | Commit, reveal, Stop |
| Following | Route-qualified arrow and distance | Compass blue | Reveal, Stop |
| Paused | Arrow absent, reason visible | Caution | Continue, confirm stop |
| Near | Live route-qualified arrow | Compass blue | Reveal, Stop |
| Arrived | Arrow no longer required | Warm orange | Reveal |
| Revealed | Destination identity visible | Warm orange | Start again |
| Stopped | Neutral safe exit | Muted green | Guarded new recommendation |

Developer phase labels, raw permission enums, and mock-data badges never appear in the consumer journey. Raw values live only in the explicitly opened diagnostics drawer.
