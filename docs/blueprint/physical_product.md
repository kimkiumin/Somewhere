# Physical Product Blueprint

Status: approved written blueprint (2026-07-21)

## Product Role

The physical compass is the final product expression. The iPhone is the companion compute and network layer, not the intended center of the walking interaction.

The hardware track begins in parallel with software research.

## Required Final Outcome: High-Fidelity Mockup

The project is complete at the required physical level when it includes:

- full-scale physical form
- resolved grip and carry concept
- realistic mass and balance target represented in the model
- compass needle or directional indicator geometry
- three-row analog-style display window
- proposed controls with tactile placement
- CMF direction
- interaction storyboard or animated display demonstration
- evidence from ergonomic and readability tests
- clear companion-app and system architecture

The required mockup does not have to receive live BLE data.

## Stretch Outcome: BLE Functional Prototype

The stretch prototype connects to the iPhone with a minimal state contract. The orientation fields depend on the architecture selected before BLE implementation:

```text
session state
absolute route bearing + north reference, or device-relative bearing after device heading input
remaining distance
representative menu text
price band
confidence/recovery state
message timestamp and sequence
```

The phone retains GPS, route, recommendation, network, and notification responsibilities. Standalone cellular and onboard LLM processing are out of scope.

## Display Contract

Fixed rows:

```text
remaining distance
representative menu 1 · optional menu 2
price band
```

Approved movement:

- distance and price remain fixed in position
- menu text moves continuously in one direction
- content loops seamlessly without reversing
- one menu is prioritized; a second appears only with reliable data
- information never exceeds distance, two menus, and price band

The exact display technology is not selected. LCD, OLED, electronic paper, and simulated display approaches must be compared for:

- Korean text legibility
- viewing angle and outdoor contrast
- animation behavior and ghosting
- power draw
- thickness
- prototyping availability and cost

Continuous menu motion is an approved interaction direction. Walking-time gaze reduction is not the primary selection criterion for that motion, but safety and legibility still require field observation.

Final hardware lock requires legibility, walking-safety, reduced-motion, display-technology, and power tests. Failure on those tests can replace or disable continuous movement without changing the fixed three-row information hierarchy.

## Status and Error Behavior

- Use conventional cellular-antenna and Wi-Fi icons for network state.
- Use the conventional Bluetooth icon for phone-to-compass connection.
- Place connection state in a small lower-center channel, separate from distance, menu, and price, near the conventional brand-mark position on an analog dial.
- Suppress the precise arrow when bearing data is stale or low confidence.
- For network, connection, or direction-calculation failure, rotate the compass slowly without pointing.
- For a user pause or confirmed stop, keep the needle stationary or hide it; do not use the error rotation.
- On recovery, recompute orientation before resuming directional pointing.

## Control Exploration

Control placement is a physical-design task, not yet a locked electronics layout. The prototypes must explore:

- Stop confirmation using the same control twice
- access to secondary destination reveal
- display wake or information review
- recovery confirmation
- an accessible alternative to any gesture or timing interaction

A button sequence or needle-alignment mini-game is a deferred hypothesis. It is excluded from the baseline until it proves meaningful rather than punitive.

The baseline Stop interaction pauses guidance on the first press, then presents `Continue` and `Confirm stop`. The same physical control may confirm after the warning, but continuing must be understandable and accessible. A confirmed stop always leads to a skippable reason step.

## Parallel Product-Design Track

### P0: Form Exploration

- handheld, clip, lanyard, pocket, and wearable hypotheses
- size and thumb-reach studies
- display window proportions
- control hierarchy

### P1: Full-Scale Interaction Mockups

- at least three form directions
- realistic display animation
- gloved and one-handed handling where relevant
- Stop and reveal comprehension

### P2: Refined High-Fidelity Mockup

- selected form
- CMF and assembly intent
- final interaction storyboard
- evidence from Study A handling sessions within the 5-8-session test round

### P3: BLE Stretch

- microcontroller and display selection
- BLE service contract
- battery and enclosure feasibility
- integrated field demonstration if time and budget permit

If BLE cannot be completed, physical interaction claims still require an embodied test through a wired prototype or Wizard-of-Oz setup. A screen animation alone supports visual and ergonomic design claims, not claims about live physical navigation.

## Physical Test Measures

- first-use understanding of the arrow and display rows
- menu and price readability at realistic distance
- accidental Stop rate
- successful double-confirm Stop
- one-handed use
- carry comfort
- perceived product character
- preference for physical compass versus phone compass
- correct distinction among pointing, technical-error rotation, pause, and stop
- magnetic interference, stale-message, reconnect, and latency behavior for connected prototypes

The physical product does not need to prove mass-manufacturing readiness. It must prove product intent, interaction plausibility, and a credible path to BLE functionality.
