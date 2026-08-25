---
record_id: part.purchased.rotary-encoder-ec11
state: purchased
status: purchased_observed
aliases: ["EC11 encoder", "5-pin push rotary encoder", "360 degree encoder", "rotary selector"]
role: tactile selection and navigation input for a physical prototype
quantity_observed: 1
source_ids: ["SRC-USER-PHOTO-2026-08-25", "SRC-USER-AE-1005007644083514", "SRC-PRICEARCHIVE-1005007644083514"]
identity_confidence: confirmed
---

# EC11-style Push Rotary Encoder

## RAG summary

The photographed metal-knob component matches the public title for item `1005007644083514`: a 360-degree EC11 rotary encoder with a push button, 5 pins, and a 20-position/20-pulse description. The title is enough to identify the family and intended interaction, not enough to establish pin order, shaft dimensions, contact rating, or debounce behavior.

## Identity

- Visible object: panel-style rotary encoder with metal shaft/knob and integrated push action.
- Public snapshot title: `360 Degree Rotary Encoder EC11 With Push Button 5Pin 20 Positions 20 Pulse Code Switch Handle 15/20MM Digital Potentiometer`.
- User purchase reference: item `1005007644083514`.
- No manufacturer, exact shaft length, or exact variant is retained because the listing page was not available as a datasheet.

## Known specifications

| Fact | Value | Confidence | Source |
|---|---|---|---|
| Encoder family | EC11-style rotary encoder | high | public title; photo form |
| Rotation | 360-degree description | vendor-title claim | public snapshot |
| Push action | integrated push switch | high | public title; photo |
| Pin count | 5 pins | vendor-title claim | public snapshot |
| Position / pulse description | 20 positions / 20 pulses | vendor-title claim; exact detent semantics unverified | public snapshot |
| Intended product role | menu selection, confirmation, or tactile review control | product hypothesis | product architecture |

## Unknown / do not assume

- Pin order for A, B, switch common, switch contact, and ground/common.
- Whether “20 positions” and “20 pulses” are one-to-one on this unit, and whether the encoder is detented per pulse.
- Shaft diameter/length, bushing/thread dimensions, mounting hardware, contact rating, bounce time, and rotation direction.
- Whether the component is suitable for a sealed enclosure, gloved use, or long-term mechanical duty.

## Product role

This is a useful candidate for a physical selector or review control. It is not yet assigned to a final interaction. The product blueprint keeps Stop, reveal, recovery, and accessibility behavior ahead of a locked control layout.

## Dependencies and validation gate

1. Use a continuity meter or a current-limited GPIO fixture to map all five terminals before connecting to the ESP32.
2. Record A/B phase order, switch behavior, detent count, bounce duration, and pull-up strategy.
3. Test one-handed operation and accidental activation in a physical mockup.
4. Do not infer enclosure dimensions from the `15/20MM` text; ask for or measure the exact shaft/handle variant.
