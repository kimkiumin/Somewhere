# UI / UX Review Checklist

Use this checklist after Codex creates or updates the prototype.

## 1. Core UX Integrity

- [ ] The destination is hidden at the start.
- [ ] Destination name is not visible before reveal.
- [ ] Exact address is not visible before reveal.
- [ ] Photos are not visible before reveal.
- [ ] Reviews, ratings, and rankings are not shown.
- [ ] The app does not look like a normal map app.
- [ ] The flow is understandable without extra explanation.

## 2. State Coverage

- [ ] Idle state exists.
- [ ] Selecting state exists.
- [ ] Hidden destination ready state exists.
- [ ] Following state exists.
- [ ] Near state exists.
- [ ] Arrived state exists.
- [ ] Revealed state exists.
- [ ] Give Up flow exists.
- [ ] Reroll flow exists.

## 3. Safety and Control

- [ ] Reveal is available during the journey.
- [ ] Give Up is available during the journey.
- [ ] Reroll is available before or during the journey.
- [ ] Give Up is written neutrally, not as failure.
- [ ] Reroll does not feel like punishment.
- [ ] Safety copy is visible but not overwhelming.

## 4. Off-Screen Design Principle

- [ ] Direction is more important than screen content.
- [ ] No full map is shown.
- [ ] No route line is shown.
- [ ] No turn-by-turn instructions are shown.
- [ ] The interface encourages looking around, not staring at the screen.

## 5. Visual Direction

- [ ] Mobile-first layout works at phone width.
- [ ] Compass arrow or direction indicator is central.
- [ ] Distance is visible but not overly technical.
- [ ] The tone is calm and slightly mysterious.
- [ ] The design is not too game-like.
- [ ] The UI avoids clutter.

## 6. Reveal Moment

- [ ] Arrival feels distinct from following.
- [ ] Reveal feels like a reward.
- [ ] Revealed screen explains the hidden hint.
- [ ] User can start another adventure after reveal.
- [ ] User can restart or reroll after reveal without review/rating UI.

## 7. Technical Simplicity

- [ ] The prototype can run without API keys.
- [ ] The prototype can run without login.
- [ ] The prototype uses mock data only.
- [ ] Code is simple enough to revise quickly.
- [ ] `docs/prototype_notes.md` is updated after implementation.

## 8. Red Flags

Reject or revise if any of these happen:

- Destination name appears too early.
- The UI becomes a place search/list app.
- The UI becomes a restaurant recommendation app.
- The UI becomes a normal navigation app.
- Maps dominate the experience.
- Reviews, ratings, or rankings appear.
- Safety controls are hidden or unavailable.
- The reveal moment feels flat or unnecessary.
