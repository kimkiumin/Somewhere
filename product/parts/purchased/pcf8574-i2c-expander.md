---
record_id: part.purchased.pcf8574-i2c-expander
state: purchased
status: purchased_observed_identity_unresolved
aliases: ["PCF8574 board", "HW-171", "I2C GPIO expander", "PCF8574 I/O expansion module"]
role: possible expansion of button and switch inputs over I2C
quantity_observed: 1
source_ids: ["SRC-USER-PHOTO-2026-08-25", "SRC-USER-AE-33010117287", "SRC-PCF8574-FAMILY"]
identity_confidence: medium
---

# PCF8574 / HW-171 I2C Expansion Board

## RAG summary

The photo shows a blue board marked `PCF8574` and `HW-171`, with a four-pin header labeled `VCC`, `GND`, `SDA`, and `SCL`. At family level, PCF8574 is an I2C-connected 8-bit GPIO expander. The exact AliExpress item `33010117287`, chip suffix, supply rail, pull-up rail, address configuration, and module schematic are not verified, so this board must not be wired to the ESP32 from the photo alone.

## Identity

- Visible board marking: `PCF8574` and `HW-171`.
- Visible interface labels: `VCC`, `GND`, `SDA`, `SCL`.
- Small yellow configuration links appear on the board; their function and default state are not yet confirmed.
- Provisional purchase mapping: item `33010117287`. The listing page was not accessible, so this mapping is photo-based and remains unresolved.

## Known specifications

| Fact | Value | Confidence | Source |
|---|---|---|---|
| Device family | PCF8574 I2C 8-bit I/O expander | family-level | board marking; official family documentation |
| Board identifier | HW-171 | observed | user photo |
| Exposed bus/power labels | VCC, GND, SDA, SCL | observed | user photo |
| Likely use | read buttons/switches or drive low-current digital lines through I2C | product hypothesis based on family role | family documentation; project need |
| Exact marketplace identity | unresolved | unresolved | supplied URL could not be opened |

## Unknown / do not assume

- `PCF8574` versus `PCF8574A` suffix and the resulting address range.
- Module VCC range, onboard regulator presence, pull-up resistor rail, logic-level behavior, and current limits.
- Header order beyond the printed labels, connector orientation, address-link meaning, and whether all eight I/O pins are exposed.
- Whether the module is intended for a 5 V LCD accessory rather than a 3.3 V ESP32 bus.

## Product role

If its electrical variant is closed, this module may reduce the number of ESP32 GPIOs needed for the five-button strip, slide switch, and related controls. It is an input-expansion candidate, not a confirmed part of the final product electronics.

## Dependencies and validation gate

1. Photograph or read the chip suffix and both sides of the PCB.
2. Trace VCC and the SDA/SCL pull-ups; measure the rail before attaching an ESP32-S3.
3. Verify I2C address and all eight I/O directions with a current-limited 3.3 V fixture.
4. Record whether the board can safely share the display board's I2C bus and whether the button wiring needs external pull-ups or debouncing.

**Electrical caution:** never assume that an I2C module's VCC or pull-ups are 3.3 V-compatible just because the controller is an ESP32. Verify the rail and level behavior first.
