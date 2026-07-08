# Prototype Notes

Status: implemented / v0.1  
Last updated: 2026-07-08

This document records what the prototype currently implements, what it does not implement, and what UX hypotheses it is meant to test.

## 0. Repository Setup Notes

| Date | Change | Notes |
|---|---|---|
| 2026-07-08 | Moved the working repo setup into the intended desktop project folder. | `README.md`, `AGENTS.md`, `docs/`, `data/`, and `prototype/` now sit directly under the Git root at `Desktop/수업자료/2-1.5/Somewhere`. |
| 2026-07-08 | Copied required source documents into `docs/`. | `docs/project_brief.md`, `docs/core_ux.md`, and `docs/prototype_spec.md` now contain the original source content from `파일/`. |
| 2026-07-08 | Copied additional source references into `docs/`. | Assumptions, decisions, design principles, scenarios, research notes, prompt library, handoff notes, and combined source pack were copied from `파일/` for easier Codex access. |
| 2026-07-08 | Implemented the first mobile web prototype. | `prototype/index.html`, `prototype/style.css`, and `prototype/app.js` now support the hidden-destination compass flow. |

## 1. Prototype Goal

Build a simple mobile-first prototype for a hidden-destination compass adventure UX.

The goal is not to build a real navigation app. The goal is to test whether the following core flow feels understandable, safe, and intriguing:

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

## 2. Implemented States

| State | Implemented | Notes |
|---|---:|---|
| Idle | Yes | Opening state with `Start Adventure`, concept copy, and safety note. |
| Selecting | Yes | Short loading state while choosing a safe mock destination. |
| Hidden destination ready | Yes | Shows hint, approximate distance, estimated time, and safety status while hiding the destination name. |
| Following | Yes | Compass stage, approximate distance, status copy, and movement simulation. |
| Near | Yes | Triggered below 120m with closer status copy. |
| Arrived | Yes | Triggered at or below 30m with stronger reveal prompt. |
| Revealed | Yes | Shows destination name, category, description, and the original hint. |
| Give up | Yes | Neutral safe-exit state; user can reveal anyway, restart, or reroll. |
| Reroll | Yes | Selects a new hidden destination without revealing the previous one. |

## 3. Implemented Controls

| Control | Implemented | Purpose |
|---|---:|---|
| Start Adventure | Yes | Begin the hidden destination flow |
| Move closer | Yes | Simulate walking in v0.1 with 60-140m random steps |
| Reveal | Yes | Safety and user control; available before arrival |
| Give Up | Yes | Safe exit from the experience |
| Reroll | Yes | Select another hidden destination without failure framing |
| Start Again | Yes | Repeat the experience after reveal or give up |

## 4. Current UX Hypotheses

| ID | Hypothesis | Prototype Evidence to Observe |
|---|---|---|
| H1 | Hidden destination can feel intriguing rather than uncomfortable. | User understands why the destination is hidden and wants to continue. |
| H2 | Direction and distance cues feel meaningfully different from a map app. | User can proceed without needing a map. |
| H3 | Reveal/Give Up/Reroll reduce anxiety. | User feels in control despite uncertainty. |
| H4 | Arrival and reveal feel like a reward. | User perceives reveal as a payoff, not just information display. |
| H5 | The experience could justify later hardware exploration. | User can imagine value in a physical compass-like device. |

## 5. Design Decisions

Record decisions here as they are made.

| Date | Decision | Reason | Risk |
|---|---|---|---|
| 2026-07-07 | Use simulated movement in v0.1. | Validate UX flow before GPS/API complexity. | Does not test real walking behavior. |
| 2026-07-07 | Do not show maps in v0.1. | Preserve off-screen discovery and avoid normal navigation app behavior. | Some users may not understand how to proceed. |
| 2026-07-08 | Add `DESIGN.md` before UI implementation. | Keep the visual system traceable: calm field-instrument feel, warm neutral canvas, deep compass stage, and restrained controls. | Design may need refinement after observing users. |
| 2026-07-08 | Keep the destination name out of public state until reveal. | Protect the hidden-destination premise and make Reveal a trust control. | The fallback mock data still exists in code so the file can open without a local server. |
| 2026-07-08 | Use plain HTML, CSS, and JavaScript with no framework. | Match v0.1 constraints and keep the prototype easy to review. | Larger future iterations may need stronger structure. |
| 2026-07-08 | Keep v0.1 rating-free. | The user's implementation prompt and `AGENTS.md` prohibit ratings/reviews/rankings; earlier source wording about post-experience rating is treated as a later hypothesis. | The prototype does not yet test post-experience reflection. |
| 2026-07-08 | Ensure Reroll excludes the current destination. | Reroll should feel like a genuine fresh hidden destination, not a repeat of the same one. | With very small datasets, reroll depends on at least two safe destinations. |
| 2026-07-08 | Escape rendered mock fields and add render-level regression tests. | The prototype uses `innerHTML`, so mock destination copy must be treated as untrusted input. | Longer term, DOM node creation would reduce escaping burden. |
| 2026-07-08 | Show estimated time in the hidden information panel. | The v0.1 spec asks for approximate distance, hint, estimated time, and safety status before reveal. | Estimated time is still static mock data, not recalculated from movement. |
| 2026-07-08 | Remove forbidden-scope terms from visible idle copy. | The interface should feel like the experience itself, not a list of excluded product features. | The technical exclusions remain documented in source docs. |
| 2026-07-08 | Split prototype code and styles by responsibility. | Keep each source file small enough to review: `state.js`, `components.js`, `screens.js`, `controller.js`, and split CSS modules sit behind `app.js` and `style.css` entrypoints. | More files to load in the browser, acceptable for v0.1 static prototype. |
| 2026-07-08 | Normalize malformed distance and time values. | Mock data is still an input boundary; non-numeric, empty, boolean, null, or negative values should render as `Unknown`, not `0 m` or `0 min`. | Does not validate full destination schema yet. |
| 2026-07-08 | Preserve `Near` as a visible movement state. | A simulated step that would jump from `Following` straight to `Arrived` now pauses at 31m first, so reviewers can experience both required states. | This is a prototype pacing rule, not a real walking model. |
| 2026-07-08 | Keep malformed distance unknown after movement. | If mock distance is invalid, `Move closer` keeps the distance `Unknown` instead of inventing `0 m` and an arrival. | A future data parser should reject malformed destinations before selection. |

## 6. Known Limitations

- No real GPS.
- No real destination API.
- No route safety logic.
- No hardware connection.
- No actual user testing yet.
- Mock destinations may not reflect real-world recommendation quality.
- The app tries to load `data/mock_destinations.json`; if direct file loading blocks `fetch`, it uses a mirrored fallback copy of the same mock data.
- Compass heading is simulated and does not use a device orientation sensor.
- No post-experience rating or reaction capture is implemented in v0.1 because ratings/reviews are out of scope for this prototype.
- Destination secrecy is UI-level only in v0.1; the browser still receives mock destination data because this is a static prototype without a backend.

## 7. Review Checklist

Before treating the prototype as complete, check:

- [x] Destination name is hidden until reveal.
- [x] No map is shown.
- [x] No review, rating, ranking, or search UI is shown.
- [x] Direction/distance cues are the main interface.
- [x] Reveal is always available.
- [x] Give Up is neutral and non-shaming.
- [x] Reroll does not feel like failure.
- [x] Arrival/reveal has a clear payoff.
- [x] Mobile layout works at phone width.
- [x] The prototype can be opened without API keys or accounts.

## 8. Next Iteration Ideas

Do not implement these until v0.1 is reviewed.

- Real phone orientation sensor
- Real GPS
- Vibration feedback
- Figma visual refinement
- Physical device mock comparison
- User testing script
- App vs hardware comparison test
