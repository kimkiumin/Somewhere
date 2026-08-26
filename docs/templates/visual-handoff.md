# Roll the compass! visual handoff packet

Use one copy of this packet for one coherent visual or interaction decision. A
Windows collaborator may attach it to an issue or pull request; an AI collaborator
must fill the same fields. Do not describe a whole redesign as one vague request.

## Identity

- Source commit SHA (40 characters):
- Surface: `iPhone app` / `iPad app` / `480x480 circular LCD` / `cross-surface`
- Product state:
- Device and viewport:
- Orientation:
- Priority: `P0` / `P1` / `P2` / `P3`

## Evidence

- Current screenshot or recording:
- Proposed screenshot, editable frame, or asset:
- GitHub Actions artifact name and run URL:
- `preview-manifest.json` SHA and `archiveSha256`:
- Appetize preview URL, if manually uploaded:

## Interaction contract

- Starting state:
- User action:
- Expected visible result:
- Expected animation or transition:
- Expected backend, GPS, BLE, haptic, or notification consequence:
- Back, Stop, Continue, and recovery behavior:

## Visual contract

- Exact copy and language:
- Frame, alignment, spacing, and safe-area values:
- Responsive rule for iPhone 13 and portrait iPad Pro 11-inch:
- Typography role, font, size, weight, line count, and truncation:
- Color/token values, opacity, texture, and contrast intent:
- Asset source, editable source, export size, owner, and usage rights:
- Elements that must stay unchanged:

## Circular LCD contract

Complete this section when the surface is the physical compass display.

- Canvas: `480x480`, origin at top-left
- Rotation pivot: `(240,240)`
- Critical content safe radius: `214 px`
- Shell and red needle supplied as separate transparent assets: `yes` / `no`
- Needle alpha crop and pivot offset:
- Touch target bounds `(x, y, width, height)`:
- BOOT short-press result:
- RST result:
- Required state: `Boot` / `Pairing` / `Sensor missing` / `Calibrating` /
  `Ready` / `Guiding` / `Near` / `Paused` / `Arrived` / `Stale` /
  `Magnetic anomaly` / `Update required`
- What may be hidden when the screen is toggled off:

All critical text, touch targets, and the needle must remain inside the critical
safe circle. The needle rotates around the fixed centre and must not visually
leave the compass shell.

## Product boundaries

Confirm each item explicitly.

- Destination identity remains hidden until an allowed reveal or arrival:
- The V2 backend, contracts, and recommendation policy remain intact:
- Release continues to use Core Location and the real API path:
- Debug exhibition mode remains the only offline deterministic path:
- The Guiding screen shows direction, distance, and Stop without scrolling:
- No active in-journey Reroll control is introduced:
- The change preserves the collaborator's antique compass and red-needle concept:

## Verification handoff

- Checks completed on Windows/GitHub/Appetize:
- Checks not possible outside macOS/Xcode:
- Exact Xcode Simulator models and orientations requested:
- Exact iPhone/iPad physical checks requested:
- Core Location/CoreBluetooth checks requested:
- LCD compile/flash/touch checks requested:
- Acceptance criterion for closing the issue:
