# Historical v0.1 Specification for Codex

> This file preserves the original v0.1 implementation brief. For vNext work, `BLUEPRINT.md` and `docs/blueprint/*.md` take priority.

생성일: 2026-07-07  
상태: v0.1

이 문서는 Codex가 1차 모바일 웹 프로토타입을 만들기 위한 명세다.

## 1. Prototype Goal

Build a simple mobile-first prototype for a hidden-destination compass adventure UX.

The goal is not to build a real navigation app.  
The goal is to test whether the core flow feels understandable, safe, and intriguing:

```text
Start → Hidden Destination → Follow Direction → Approach → Reveal
```

## 2. Core UX Hypothesis

The user does not know the destination.  
The app gives only minimal direction and distance cues.  
The user follows the cues and discovers the destination at the end.

## 3. Scope

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

### Exclude for v0.1

- Real GPS
- Real map API
- User account
- Payment
- Recommendation algorithm
- Reviews, ratings, rankings, or search UI
- Reservation
- Social sharing
- Hardware connection

## 4. Recommended Tech

Use the simplest possible stack first.

Option A:
- HTML
- CSS
- JavaScript

Option B:
- React/Vite

Prefer Option A unless the project already uses React.

## 5. Folder Structure

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

## 6. Mock Destination Data

Create mock data like this:

```json
[
  {
    "id": "d001",
    "name": "Small Independent Bookstore",
    "category": "shop",
    "mood": "quiet discovery",
    "initialDistanceM": 720,
    "estimatedMinutes": 12,
    "safetyLevel": "safe",
    "hint": "A quiet place with paper and light"
  },
  {
    "id": "d002",
    "name": "Alley Cafe",
    "category": "cafe",
    "mood": "casual",
    "initialDistanceM": 480,
    "estimatedMinutes": 8,
    "safetyLevel": "safe",
    "hint": "A small warm pause nearby"
  },
  {
    "id": "d003",
    "name": "Tiny Local Gallery",
    "category": "culture",
    "mood": "curious",
    "initialDistanceM": 950,
    "estimatedMinutes": 16,
    "safetyLevel": "safe",
    "hint": "Something quiet to look at"
  }
]
```

## 7. Screen States

### S0. Idle

Elements:
- Product title
- One-line concept
- Start Adventure button
- Small safety note

Copy example:
- “Follow the unknown.”
- “Your destination will stay hidden until you arrive.”

### S1. Selecting

Elements:
- Loading animation
- “Choosing a safe nearby discovery…”

Duration:
- 1–2 seconds

### S2. Hidden Destination Ready

Elements:
- Destination hidden card
- Hint
- Approximate distance
- Estimated time
- Start following button

Do not show:
- Destination name
- Exact address
- Photo
- Review
- Rating

### S3. Following

Elements:
- Compass arrow
- Approximate distance
- Status text
- Reveal
- Give Up
- Reroll

Interaction:
- “Move closer” button for simulation
- Each tap decreases distance by random 60–140m
- Arrow direction changes slightly each step

Copy examples:
- “Keep going.”
- “You are getting warmer.”
- “The place is still hidden.”

### S4. Near

Trigger:
- Distance below 120m

Elements:
- Stronger approach feedback
- “Very close” status
- Optional reveal prompt

### S5. Arrived

Trigger:
- Distance below 30m

Elements:
- Arrival confirmation
- Reveal destination button

### S6. Revealed

Elements:
- Destination name
- Category
- Hint explanation
- Short description
- Start Again
- Reroll

### S7. Give Up

Elements:
- Confirm give up
- Reveal destination anyway
- Restart

### S8. Reroll

Elements:
- Select a new hidden destination
- Keep previous one hidden or discard

## 8. Interaction Rules

1. Destination name must remain hidden until reveal.
2. Reveal must always be available for safety.
3. Reroll must not feel like failure.
4. Give Up must be neutral, not shameful.
5. UI must stay minimal.
6. Do not show a map.
7. Do not add route instructions.
8. Avoid visual clutter.

## 9. Visual Direction

Initial direction:
- Minimal
- Low-screen
- Compass-like
- Analog-inspired
- Calm, not gamified too heavily

Avoid:
- Full map UI
- Restaurant ranking UI
- Bright game UI unless explicitly requested
- Review-card layout

## 10. Success Criteria

The prototype is successful if it can answer these questions:

1. Does the hidden destination flow make sense?
2. Does the user understand what to do next?
3. Does the user feel safe enough because Reveal/Give Up exist?
4. Does the compass/distance flow feel different from a map app?
5. Does the reveal moment feel like a reward?

## 11. Codex Task Prompt

Use this prompt to start implementation:

```text
Read docs/project_brief.md and docs/prototype_spec.md.

Build the first mobile-first web prototype in /prototype for a hidden-destination compass adventure UX.

Core flow:
1. User presses “Start Adventure”
2. App selects one hidden destination from mock data
3. Destination name is hidden
4. User sees only a compass arrow, approximate distance, hint, and subtle status text
5. User can tap “Reveal”, “Give Up”, or “Reroll”
6. Movement is simulated with a “Move closer” button
7. When close enough, the destination can be revealed

Do not add maps, real GPS, real APIs, user accounts, reviews, or recommendation algorithms.
Keep the UI minimal and low-screen.
Document the implemented states in docs/prototype_notes.md.
```

## 12. Later Prototype Extensions

After v0.1:
- Real phone orientation sensor
- Real GPS
- Vibration feedback
- Hardware mock connection
- BLE prototype
- Physical compass form exploration
- Figma visual prototype
- User testing script
