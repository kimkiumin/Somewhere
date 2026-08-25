# Product Bill of Materials and Evidence State

Updated: 2026-08-25 (Asia/Seoul)

This is an evidence-aware BOM. `purchased_observed` means visible in the supplied photo and sufficiently matched to a source; it does not mean electrically validated or production-approved.

Planning budget context: the existing feasibility document uses a KRW 200,000 ceiling and separates purchase gates, shipping/tax reserves, battery allowance, and an optional servo negative control. That ceiling is planning evidence only; it is not a current checkout total and does not authorize another purchase.

## Purchased / photographed

| BOM ID | Part record | Qty observed | Status | Immediate role | Next gate |
|---|---|---:|---|---|---|
| `BOM-P-001` | [`ESP32-S3-Touch-LCD-2.1`](purchased/esp32-s3-touch-lcd-2.1.md) | 1 | purchased_observed | USB display/controller bench | confirm variant, run stable display/touch/current test |
| `BOM-P-002` | [`EC11 push encoder`](purchased/rotary-encoder.md) | 1 | purchased_observed | tactile selection input | map five terminals and debounce |
| `BOM-P-003` | [`PCF8574 / HW-171`](purchased/pcf8574-i2c-expander.md) | 1 | purchased_observed_identity_unresolved | possible button I/O expansion | identify module rail, pull-ups, address, pinout |
| `BOM-P-004` | [`GNSS-looking receiver set`](purchased/gnss-module.md) | 1 set | purchased_observed_identity_unresolved | exploratory only | identify chipset and safe power/UART interface |

## Photo-only accessories and controls

These objects are deliberately not assigned a vendor SKU. See [`observed-inventory.md`](observed-inventory.md).

| Object | Qty observed | Status | Potential use |
|---|---:|---|---|
| slide switch | 1 | observed_only | power or mode control, not assigned |
| tactile pushbutton | 1 | observed_only | confirmation or reset exploration |
| white tactile-button positions | 5 | observed_only | control-layout exploration |
| jumper-wire bundle | 1 bundle | observed_only | bench wiring |

## Existing planning candidates — not confirmed as present

These entries come from the pre-purchase feasibility plan. They must not be answered as “owned parts.”

| Candidate | Planned role | Current status | Source / gate |
|---|---|---|---|
| Seeed XIAO ESP32-S3 | BLE peripheral/controller alternative | candidate_not_confirmed | [`candidates.md`](candidates.md); H1 purchase gate |
| Seeed XIAO Round Display | earlier 39 mm, 240×240 digital compass face candidate | candidate_not_confirmed; not the same as the photographed Waveshare board | [`candidates.md`](candidates.md); H0/H1 |
| LIS2MDL breakout | separate magnetic heading sensor | candidate_not_confirmed | [`candidates.md`](candidates.md); H2 |
| LSM6DSOX breakout | tilt/motion compensation | candidate_not_confirmed | [`candidates.md`](candidates.md); H2 |
| DRV2605L + vibration disc | nonvisual cue / haptic fallback | candidate_not_confirmed | [`candidates.md`](candidates.md); H2 only after sensor baseline |
| BMM350 | later magnetometer comparison | candidate_not_confirmed | [`candidates.md`](candidates.md); no frozen purchase path |
| micro servo negative control | motorized-needle interference test only | candidate_not_confirmed | [`candidates.md`](candidates.md); after digital H2 |

## Allowance / not-approved states

The feasibility plan also contains `allowance` entries for a USB data cable, enclosure/fastener work, shipping/tax reserves, a protected battery allowance, and optional motorized-needle hardware. They are not photographed inventory, not approved purchases in this catalog, and not included in the owned-parts count.

## BOM interpretation rule

The purchased board may support the next bench prototype, but the current physical-product blueprint still requires H0 form, H1 display/BLE evidence, H2 heading/interference evidence, and H3 enclosure refinement before a final product claim.
