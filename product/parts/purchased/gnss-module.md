---
record_id: part.purchased.gnss-module-identity-unresolved
state: purchased
status: purchased_observed_identity_unresolved
aliases: ["GPS module", "GNSS receiver", "external-antenna receiver", "u-blox-like module (unconfirmed)"]
role: exploratory location-signal or radio-module candidate; not a vNext baseline requirement
quantity_observed: 1 set
source_ids: ["SRC-USER-PHOTO-2026-08-25", "SRC-USER-AE-33043849485"]
identity_confidence: low
---

# GNSS / GPS-looking Receiver Set — Identity Unresolved

## RAG summary

The photo contains a small receiver-like module with a QR/label area and a separate antenna-looking piece connected by a thin coax-style lead. It may be a GPS/GNSS receiver set, but the exact AliExpress item `33043849485`, chipset, voltage, UART protocol, antenna type, and even the relationship between the two visible pieces were not verified. Do not power or wire it until the markings and datasheet are closed.

## Identity

- Visible in the user photo: a small dark module with a white label/QR-like marking, a thin antenna lead, and a separate green/metal antenna-looking component.
- Provisional purchase mapping: item `33043849485`.
- No exact seller title or product datasheet was available through the research surfaces.
- “GPS/GNSS” is a visual hypothesis, not a confirmed chip identity.

## Known specifications

| Fact | Value | Confidence | Source |
|---|---|---|---|
| Physical contents | receiver-like PCB/module plus antenna-looking accessory | observed, low identity confidence | user photo |
| External antenna path | thin coax-style lead is visible | observed | user photo |
| GNSS function | possible, not confirmed | hypothesis | visual appearance only |
| Intended role in Somewhere | exploratory only; the phone remains the vNext location/route layer | architecture boundary | physical-product blueprint |

## Unknown / do not assume

- Chipset, board name, supported constellations, fix accuracy, time-to-first-fix, and update rate.
- Supply voltage, current, active-antenna bias, UART voltage, default baud, NMEA/binary protocol, and pinout.
- Whether the green/metal piece is an antenna, shield, battery, or a separate unrelated item.
- Whether the module is safe near the display, ESP32 antenna, magnetometer, or a battery.

## Product role

Keep this item as an exploratory inventory record. The approved product architecture assigns GPS, route, recommendation, and network responsibilities to the iPhone; a standalone GPS module is not required for the current product baseline. A future bench test may still be useful for understanding component options.

## Dependencies and validation gate

1. Read the top and underside markings at higher resolution and match them to the supplied listing or a manufacturer datasheet.
2. Identify power, ground, UART TX/RX, antenna connector, and any active-antenna supply before applying power.
3. Use a current-limited supply and a serial capture fixture; record voltage, current, baud, protocol, cold-start time, and outdoor fix behavior.
4. Test radio, display, and magnetic interference separately; do not treat a first serial sentence as evidence of navigation quality.
