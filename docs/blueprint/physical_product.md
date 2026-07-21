# Physical Product Blueprint

Status: approved design, pending written-spec review

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

The stretch prototype connects to the iPhone and receives a minimal state contract:

```text
session state
relative bearing
remaining distance
representative menu text
price band
confidence/recovery state
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

## Control Exploration

Control placement is a physical-design task, not yet a locked electronics layout. The prototypes must explore:

- Stop confirmation using the same control twice
- access to secondary destination reveal
- display wake or information review
- recovery confirmation
- an accessible alternative to any gesture or timing interaction

A button sequence or needle-alignment mini-game is a deferred hypothesis. It is excluded from the baseline until it proves meaningful rather than punitive.

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
- evidence from 5-8 participant handling tests

### P3: BLE Stretch

- microcontroller and display selection
- BLE service contract
- battery and enclosure feasibility
- integrated field demonstration if time and budget permit

## Physical Test Measures

- first-use understanding of the arrow and display rows
- menu and price readability at realistic distance
- accidental Stop rate
- successful double-confirm Stop
- one-handed use
- carry comfort
- perceived product character
- preference for physical compass versus phone compass

The physical product does not need to prove mass-manufacturing readiness. It must prove product intent, interaction plausibility, and a credible path to BLE functionality.
