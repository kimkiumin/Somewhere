---
record_id: part.purchased.esp32-s3-touch-lcd-2-1
state: purchased
status: purchased_observed
aliases: ["ESP32-S3-Touch-LCD-2.1", "Waveshare 2.1 inch round ESP32 display", "ESP32-S3 round touch LCD"]
role: bench display and controller for the physical-compass prototype
quantity_observed: 1
source_ids: ["SRC-USER-PHOTO-2026-08-25", "SRC-USER-AE-1005008208733698", "SRC-PRICEARCHIVE-1005008208733698", "SRC-WAVESHARE-DISPLAY-DOCS", "SRC-LOCAL-HW-README"]
identity_confidence: confirmed
---

# ESP32-S3-Touch-LCD-2.1

## RAG summary

The photographed main board is a Waveshare `ESP32-S3-Touch-LCD-2.1`, marked `Rev2.0`. Public product text and the existing local smoke-test profile associate this item with a 2.1-inch round 480×480 touch display and an ESP32-S3 controller. It is confirmed as a physical bench item, but exact panel revision, battery behavior, current draw, and production suitability remain validation gates.

## Identity

- Visible silkscreen: `ESP32-S3-Touch-LCD-2.1`, `Rev2.0`, Waveshare mark.
- Visible board features: round display assembly, two USB-C locations marked `USB` and `UART`, microSD slot, `I2C` and `UART` headers, battery connector area, power switch, and boot/reset controls.
- User purchase reference: item `1005008208733698`.
- Search-visible public title: ESP32-S3 2.1-inch IPS touchscreen development board, 480×480, for Arduino IDE/ESP-IDF. This is corroboration, not a unit-level datasheet.
- Existing firmware record: [`hardware/esp32-s3-touch-lcd-2.1/`](../../../hardware/esp32-s3-touch-lcd-2.1/).

## Known specifications

| Fact | Value | Confidence | Source |
|---|---|---|---|
| Board family | ESP32-S3-Touch-LCD-2.1 | confirmed | photo; Waveshare docs |
| Board revision marking | Rev2.0 | observed | user photo |
| Display form | round, 2.1-inch class | confirmed at product-family level | photo; public product title |
| Display resolution | 480×480 | confirmed for the referenced product family; not independently measured on this unit | public product title; local smoke-test README |
| Controller family | ESP32-S3, dual-core LX7 in the public listing description | product-family claim | public product title |
| Storage / memory profile used by local upload | 16 MB flash, OPI PSRAM | configured test profile, not a measurement of this unit | local smoke-test README; board configuration |
| Local display driver profile | ST7701 panel path, CST820 touch path, TCA9554 power-control path | repository implementation assumption tied to this board family | local source filenames and smoke test |
| Visible host connections | USB-C, including labels `USB` and `UART` | observed | user photo |
| Expansion | I2C/UART headers and microSD slot visible | observed | user photo |

## Unknown / do not assume

- Exact LCD panel part number, RGB timing, touch-controller revision, and whether this unit is identical to the current Waveshare example.
- Actual flash/PSRAM size, display brightness, touch calibration, USB data behavior, and operating current.
- Battery connector pinout, polarity, charge behavior, protected-cell requirements, and safe cell capacity.
- Outdoor readability, heat, magnetic field impact, enclosure fit, and long-run stability.
- The two USB-C connectors' exact roles beyond the visible labels; verify before selecting a port.

## Product role

Use this board as the current wired/USB bench platform for display hierarchy, touch/control exploration, and the 480×480 round-face prototype. It can test visual and interaction behavior. It does not by itself prove the final compass sensor architecture, BLE field behavior, battery life, enclosure, or manufacturing readiness.

## Dependencies and validation gate

1. Use USB power only for the first repeatable test; do not attach a battery until connector and polarity are verified.
2. Select the `ESP32S3 Dev Module` profile documented in the local README and verify the exact board variant.
3. Run display, touch, frame-stability, current, and heat checks on this physical unit.
4. Keep the phone responsible for GPS, route, recommendation, and network in the vNext architecture; this board is not evidence that standalone GPS is required.
