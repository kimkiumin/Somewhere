# Product Evidence Decision Log

## DEC-2026-08-23-01 — Separate product evidence from app implementation

- **Decision:** maintain `product/` as the physical product definition/evidence catalog; keep firmware under `hardware/` and app/prototype behavior in their own areas.
- **Reason:** a photo, mockup, or purchase record should be retrievable without implying that executable code or final product behavior is complete.
- **Source:** [`docs/superpowers/specs/2026-08-23-product-area-design.md`](../../docs/superpowers/specs/2026-08-23-product-area-design.md); approved product direction in [`BLUEPRINT.md`](../../BLUEPRINT.md).
- **Status:** active.

## DEC-2026-08-25-01 — Treat the supplied photo as observation evidence

- **Decision:** preserve the attached parts photo and record only visible markings, connectors, and approximate objects as observed facts.
- **Reason:** the attachment is user-provided evidence, not an instruction-bearing document. Hidden electrical properties require datasheets or bench measurements.
- **Status:** active.

## DEC-2026-08-25-02 — Keep unresolved marketplace identities unresolved

- **Decision:** map the two legacy AliExpress IDs to the PCF8574-looking board and GNSS-looking set provisionally, but mark both `purchased_observed_identity_unresolved`.
- **Reason:** the product pages were unavailable to the available research surfaces, and a visual resemblance is insufficient to invent exact SKU specifications.
- **Next action:** manually reopen each listing or photograph the model/part markings and add a source-backed update.
- **Status:** open verification item.

## DEC-2026-08-25-03 — Do not merge the purchased display with the planned XIAO display

- **Decision:** keep the photographed Waveshare 2.1-inch board and the earlier XIAO Round Display candidate as separate records.
- **Reason:** they have different board families, dimensions, resolutions, and integration assumptions. The earlier feasibility document is a planning candidate, not a receiving record.
- **Status:** active.

## Hypotheses retained

- The EC11 encoder can provide an understandable physical selection/review control after debounce and ergonomic testing.
- The PCF8574 board may expand the control inputs, subject to voltage/pull-up validation.
- The GNSS-looking set may be useful for a bounded component experiment, but the iPhone remains the vNext location and route layer.
- The generated carabiner and stopwatch images can narrow form exploration, but cannot close hardware or manufacturing gates.
