# Product Source Register

Updated: 2026-08-25 (Asia/Seoul)

This register separates user-provided purchase references from public corroboration and local project records. An inaccessible listing is retained as provenance, but its missing fields remain unknown.

## Source records

| Source ID | Kind | Reference | Access / use |
|---|---|---|---|
| `SRC-USER-PHOTO-2026-08-25` | user-provided photo | [`parts-photo-2026-08-25.png`](parts/evidence/parts-photo-2026-08-25.png) | Direct observation only. It is evidence of visible markings and approximate inventory, not a wiring instruction. |
| `SRC-USER-AE-1005008208733698` | user-provided purchase URL | [AliExpress item 1005008208733698](https://ko.aliexpress.com/item/1005008208733698.html?spm=a2g0o.order_list.order_list_main.33.5eed1802l6e6CQ&gatewayAdapt=glo2kor) | Listing page was not available to the research tools. Identity is corroborated by the board silkscreen, search title, and local smoke-test record. |
| `SRC-USER-AE-1005007644083514` | user-provided purchase URL | [AliExpress item 1005007644083514](https://ko.aliexpress.com/item/1005007644083514.html?spm=a2g0o.order_list.order_list_main.5.5eed1802l6e6CQ&gatewayAdapt=glo2kor) | Listing page was not available to the research tools. Product identity is corroborated by a public price-history snapshot and the photo. |
| `SRC-USER-AE-33010117287` | user-provided purchase URL | [AliExpress item 33010117287](https://ko.aliexpress.com/item/33010117287.html?spm=a2g0o.order_list.order_list_main.28.5eed1802l6e6CQ&gatewayAdapt=glo2kor) | Listing page was blocked/unavailable. Mapped to the PCF8574-looking photo item provisionally; exact listing identity remains open. |
| `SRC-USER-AE-33043849485` | user-provided purchase URL | [AliExpress item 33043849485](https://ko.aliexpress.com/item/33043849485.html?spm=a2g0o.order_list.order_list_main.10.5eed1802l6e6CQ&gatewayAdapt=glo2kor) | Listing page was blocked/unavailable. Mapped to the receiver/antenna-looking photo item provisionally; exact listing identity remains open. |
| `SRC-PRICEARCHIVE-1005008208733698` | public product snapshot | [Pricearchive display snapshot](https://www.pricearchive.org/aliexpress.com/item/1005008208733698) | Search-visible title identifies a 2.1-inch ESP32-S3 480×480 touch development board. Price is intentionally not stored as a product spec. |
| `SRC-PRICEARCHIVE-1005007644083514` | public product snapshot | [Pricearchive EC11 snapshot](https://www.pricearchive.org/aliexpress.com/item/1005007644083514) | Search-visible title identifies a 360-degree EC11 push encoder, 5 pin, 20 positions/20 pulses. Vendor title is not treated as a complete datasheet. |
| `SRC-WAVESHARE-DISPLAY-DOCS` | official documentation | [Waveshare ESP32-S3-Touch-LCD-2.1](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1) | Board setup, examples, and variant checks. Use for technical confirmation, not for claims about this individual unit's condition. |
| `SRC-ESP-DISPLAY-BOARD-TABLE` | project/library documentation | [ESP32 Display Panel Waveshare board table](https://github.com/esp-arduino-libs/ESP32_Display_Panel/blob/master/docs/board/board_waveshare.md) | Board configuration reference used by the existing smoke test. |
| `SRC-PCF8574-FAMILY` | official family documentation | [TI PCF8574 datasheet](https://www.ti.com/lit/ds/symlink/pcf8574.pdf) | Family-level I2C GPIO-expander behavior only; it does not identify the photographed HW-171 module or its pull-up rail. |
| `SRC-LOCAL-HW-README` | repository record | [`hardware/esp32-s3-touch-lcd-2.1/README.md`](../hardware/esp32-s3-touch-lcd-2.1/README.md) | Local upload profile and known smoke-test limitations. |
| `SRC-LOCAL-HW-ARCH` | repository planning record | [`docs/feasibility/hardware_architecture.md`](../docs/feasibility/hardware_architecture.md) | Candidate architecture, roles, risks, and H0–H3 gates. |
| `SRC-LOCAL-BOM` | repository planning record | [`docs/feasibility/bom_and_purchase_gates.md`](../docs/feasibility/bom_and_purchase_gates.md) | Planning candidates and purchase gates; it predates the photographed purchases and must not be read as an inventory list. |
| `SRC-MOCKUP-CARABINER` | generated project asset set | [`outputs/imagegen/somewhere-carabiner-exploration/README.md`](../outputs/imagegen/somewhere-carabiner-exploration/README.md) | Ten concept images; visual hypotheses only. |
| `SRC-MOCKUP-STOPWATCH` | generated project asset set | [`outputs/imagegen/somewhere-stopwatch-exploration/README.md`](../outputs/imagegen/somewhere-stopwatch-exploration/README.md) | Ten concept images; visual hypotheses only. |

## Access limitation

The AliExpress pages for the two legacy numeric IDs could not be opened by the available web/browser surfaces. The catalog therefore records the supplied URLs and the physical observations, but deliberately does not invent a seller title, exact chipset, voltage, pinout, price, or variant for those two parts. Re-open the listings manually when the exact product record is needed.

## Provenance rules

- A user photo can confirm that a marking, connector, or physical object is visible; it cannot confirm hidden electrical limits.
- A marketplace title can supply search aliases and a coarse identity; it cannot replace a datasheet or unit-level measurement.
- Local firmware files show what the repository currently assumes or tests; they do not prove that every purchased unit has the same revision.
- A generated image is a design hypothesis. It is not a component specification.
