# Roll the compass! vNext Sequence Prototype

This low-fidelity browser prototype demonstrates the approved vNext sequence. It is not the historical v0.1 prototype and does not use real location, provider, route, notification, BLE, account, or backend services.

## Open

Open `prototype/vnext/index.html` directly in a modern browser. No install or server is required.

## Product Path

Use the product canvas for a three-second intro splash, direct first-use dietary/allergy profile setup, a first-viewport compass Start button, below-fold restaurant conditions, top-right profile menu and settings, researched dietary/allergy pickers with a top `없음` option and four-item internal scrolling, a 1–5+ party-size selector with pawn silhouettes, wheel-adjustable walking-time and budget sliders, one-action start, map-free turn-by-turn guidance, Stop, Reveal reason, confirmed Stop, arrival details, and place reaction. The same compass face and needle structure continues from Start through rotating search into pointing guidance. The arrival hierarchy makes the restaurant name prominent, then shows a photo, building/floor, the recommendation rationale, and a review summary; it omits street address and precise entrance guidance.

Budget stops start at 4,000 KRW, use 2,000 KRW increments through 20,000 KRW, then 30,000/40,000/50,000 KRW and the final `상관없음` value. Wheel input is handled as a 1,000 KRW directional intent but snaps to even-thousand stops, so 11,000 KRW settles at 10,000 or 12,000 KRW. Minimum destination disclosure (walking time, budget, and main menu) is the default, with an optional private mode under the collapsed settings. Accessibility-condition input is intentionally deferred until venue and route data can verify it reliably.

## Prototype Controls

The separately labeled prototype panel simulates finding, walking, near, arrival, no-fit, low confidence, permission denial, a missing arrival field, feedback eligibility, and reset. These controls are not proposed product UI.

## Current Interaction Hypothesis

Keeping one compass visually continuous across launch, search, and guidance will make the one-action transition from setting conditions to beginning movement easier to understand. This prototype demonstrates the transition but does not yet establish that users understand it better; that remains a supervised usability question.

## GitHub Pages Prototype

The runnable prototype is published from the dedicated public repository at <https://kimkiumin.github.io/Somewhere-wireframe-sequence/>. A separate repository and Pages origin prevent the current wireframe from sharing deployment state, cache, or a service-worker scope with the historical v0.1 app. The published app contains only this vNext wireframe; project documents and the historical prototype remain in the main source repository.

## Limitations

All destinations, route steps, sensor states, timing, and external-map behavior are deterministic mock evidence. The arrival photo is an inline monochrome placeholder so the six-file Pages artifact stays self-contained; a production build would replace it with a rights-cleared provider image. The guidance surface shows current heading, next maneuver, distance to that maneuver, and total remaining distance without exposing the destination. Party size is an input contract only; it does not yet calculate shared-menu quantities or group totals. The dietary/allergy taxonomy and sources are documented in `docs/research/profile_dietary_allergy_taxonomy.md`. The route-provider feasibility record is in `docs/research/route_guidance_api_validation.md`. The profile menu's logout item is a UI placeholder because authentication is not implemented. Passing this prototype does not establish provider, iPhone, outdoor-navigation, legal, or field feasibility.
