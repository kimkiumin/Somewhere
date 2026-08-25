---
record_id: inventory.observed.photo-2026-08-25
state: observed-only
status: observed_only
aliases: ["parts photo", "unmatched accessories", "bench inventory"]
role: photo-grounded inventory cross-check
quantity_observed: set
source_ids: ["SRC-USER-PHOTO-2026-08-25"]
identity_confidence: confirmed_for_shape_only
---

# Photo-only Inventory Cross-check

This record prevents the catalog from silently inventing specifications for objects that are visible but do not have a linked product page. The count is an observation from one photograph, not a receiving inspection.

| Observed object | Approximate count | Identity confidence | Safe statement | Do not assume |
|---|---:|---|---|---|
| ESP32-S3 round display board | 1 | high | See [`esp32-s3-touch-lcd-2.1.md`](purchased/esp32-s3-touch-lcd-2.1.md) | battery safety, exact revision, current |
| Receiver-like module and antenna-looking accessory | 1 set | low | See [`gnss-module.md`](purchased/gnss-module.md) | GPS chipset, voltage, pinout |
| PCF8574 blue expansion board | 1 | medium | See [`pcf8574-i2c-expander.md`](purchased/pcf8574-i2c-expander.md) | 3.3 V compatibility, address jumpers |
| Metal rotary encoder | 1 | high | See [`rotary-encoder.md`](purchased/rotary-encoder.md) | terminal order, shaft dimensions |
| Small slide switch | 1 | low | physical switch is present | pole/throw arrangement, current rating |
| Small tactile pushbutton | 1 | low | tactile switch is present | footprint, actuation force, rating |
| White tactile-button strip | 5 visible positions | low | five small button-like items are visible | whether they are five independent switches, caps, or a packaged strip |
| Rainbow jumper-wire bundle | 1 bundle | high for appearance | jumper wires are present | wire gauge, insulation rating, connector pitch and gender |

## Evidence asset

The source photograph is preserved at [`parts/evidence/parts-photo-2026-08-25.png`](evidence/parts-photo-2026-08-25.png). It is a user-provided reference image and should be replaced or supplemented with receiving photos when exact labels are available.
