# Codex First Task Prompt

Copy and paste this into Codex after connecting the GitHub repository.

```text
Read AGENTS.md, docs/project_brief.md, docs/core_ux.md, and docs/prototype_spec.md.

Build the first mobile-first web prototype in /prototype for a hidden-destination compass adventure UX.

Core flow:
1. User presses “Start Adventure”
2. App selects one hidden destination from data/mock_destinations.json
3. Destination name is hidden
4. User sees only a compass arrow, approximate distance, hint, estimated time, and subtle status text
5. User can tap “Move closer” to simulate walking
6. User can tap “Reveal”, “Give Up”, or “Reroll”
7. When distance is below 120m, the app enters Near state
8. When distance is below 30m, the app enters Arrived state
9. The user can reveal the destination after arrival, or reveal earlier for safety

Required states:
- Idle
- Selecting
- Hidden destination ready
- Following
- Near
- Arrived
- Revealed
- Give up
- Reroll

Required files:
- prototype/index.html
- prototype/style.css
- prototype/app.js

Use data/mock_destinations.json as the only destination source.

Do not add maps, real GPS, real APIs, user accounts, reviews, ratings, restaurant rankings, search UI, reservations, payments, or recommendation algorithms.

Keep the UI minimal, calm, compass-like, low-screen, and mobile-first.

Document the implemented states, controls, major UI decisions, limitations, and next recommended iteration in docs/prototype_notes.md.
```
