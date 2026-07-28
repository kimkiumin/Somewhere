# Somewhere v0.2 iPhone Field Gate

This runbook is the hardware acceptance gate for the screen-on sensor web app.
Linux browser automation is regression evidence, not proof of iPhone sensor
quality.

## Fixed test target

- Device: iPhone 15 Pro Max
- URL: <https://kimkiumin.github.io/Somewhere/>
- Field area: Seoul Forest, Seoul
- Browser modes: Safari tab and Add to Home Screen
- Environments: one open-sky segment and one urban/building-canyon segment
- Duration: 15–20 minutes per browser mode and environment

Record the deployed commit SHA, exact iPhone model, iOS version, Safari version,
weather context, start/end times, and browser mode before each run. Do not reuse
a trace or checklist result across builds.

## Privacy

Field trace downloads contain exact coordinates. They are memory-only until the
tester presses Download. Store them in an access-controlled location, do not
attach raw traces to public issues or pull requests, and use Discard after the
run when the trace is not needed.

## Preflight

1. Confirm the deployment SHA shown by the GitHub Pages workflow.
2. Open the stable URL over HTTPS. Do not use a changing preview origin.
3. Confirm Location and Motion & Orientation access are not globally blocked.
4. For Home Screen mode, add the current URL to the Home Screen and launch it.
5. Open Field diagnostics, select the environment label, and note zero or one
   active listener per source.
6. Keep the screen on. Somewhere does not promise locked-screen or background
   guidance.

## Scenario A — permission and first fix

1. Press Start adventure.
2. Grant orientation and location access.
3. Confirm a hidden hint appears without a destination name.
4. Press Begin walk.
5. Record time to first location, location accuracy, first heading, heading
   accuracy, and Wake Lock state.
6. Turn slowly across compass north and confirm the needle takes the short path.

Pass: permission originates from the Start gesture, the app reaches live
guidance, identity stays hidden, and only one listener per source is active.

## Scenario B — denial and trust controls

1. Repeat from a clean permission state and deny orientation or location.
2. Confirm the arrow is absent and the reason is plain language.
3. Confirm Reveal, Give Up, and Reroll remain usable.
4. Use Retry only from a deliberate tap.

Pass: denial never traps the user, shows stale guidance, or removes safety
controls.

## Scenario C — visibility recovery

1. Reach live guidance, briefly switch to another app, then return.
2. Confirm the arrow is absent immediately after return.
3. Confirm Wake Lock is reacquired.
4. Wait for both a fresh location and a fresh heading.

Pass: no pre-background arrow is reused; guidance resumes only after both fresh
signals exist; listener counts remain one per source.

## Scenario D — open-sky and urban walk

1. Walk while remaining on public paths and obeying crossings. The arrow is a
   direction cue, not a route.
2. Include one control segment that moves away from the destination.
3. Observe Near entry and boundary stability.
4. Approach the destination and verify one inaccurate or isolated GPS jump
   cannot arrive.
5. Confirm Arrived occurs only after three accurate qualifying samples and
   remains latched.
6. Reveal, then repeat one run using Give Up and one using Reroll.

Pass: there is no false arrival, no repeated Near/Following oscillation, no
stale arrow, and the destination identity appears only after Reveal or Give Up.

## Native pivot trigger

Investigate Capacitor/native before more web investment when two controlled
runs, after one focused recovery or calibration correction, still show any of:

- Start cannot reliably initiate the required permissions.
- Fresh location or device-facing heading does not recover after returning.
- Wake Lock cannot sustain the agreed screen-on walk.
- Heading stays frozen, inverted, or materially unusable.
- Product scope changes to locked-screen or background guidance.

Complete one metadata record against `evidence.schema.json` for every run. Raw
diagnostic JSON remains a separate sensitive artifact referenced only by its
SHA-256 digest.
