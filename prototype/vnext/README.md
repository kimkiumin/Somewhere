# Somewhere vNext Sequence Prototype

This low-fidelity browser prototype demonstrates the approved vNext sequence. It is not the historical v0.1 prototype and does not use real location, provider, route, notification, BLE, account, or backend services.

## Open

Open `prototype/vnext/index.html` directly in a modern browser. No install or server is required.

## Product Path

Use the product canvas for onboarding, first-use dietary/allergy profile setup, restaurant-only conditions, wheel-adjustable walking-time and budget sliders, one-action start, compass guidance, Stop, Reveal reason, confirmed Stop, arrival details, and place reaction.

Budget stops start at 4,000 KRW, use 2,000 KRW increments through 20,000 KRW, then 30,000/40,000/50,000 KRW and the final `상관없음` value. Wheel input is handled as a 1,000 KRW directional intent but snaps to even-thousand stops, so 11,000 KRW settles at 10,000 or 12,000 KRW. Minimum destination disclosure (walking time, budget, and main menu) is the default, with an optional private mode under the collapsed settings.

## Prototype Controls

The separately labeled prototype panel simulates finding, walking, near, arrival, no-fit, low confidence, permission denial, a missing arrival field, feedback eligibility, and reset. These controls are not proposed product UI.

## GitHub Pages Prototype

The runnable prototype is published at <https://kimkiumin.github.io/Somewhere/> by the `Prototype — vNext Sequence` workflow. The Pages artifact contains only the six browser runtime files from this directory; tests, this README, project documents, and the historical v0.1 prototype are not published with the site.

## Limitations

All destinations, routes, sensor states, timing, and external-map behavior are deterministic mock evidence. Passing this prototype does not establish provider, iPhone, outdoor-navigation, legal, or field feasibility.
