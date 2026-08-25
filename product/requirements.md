# Product Area Requirements

Status: active product-evidence contract, 2026-08-25

## Purpose

The product area stores the physical compass definition and the evidence needed to make later design decisions. It is intentionally separate from the app implementation and firmware.

## Required record behavior

- Every owned part has one stable record ID and a status that distinguishes observed purchase, unresolved identity, and candidate planning.
- Every important specification names a source and confidence level.
- Unknown voltage, pinout, current, connector polarity, model suffix, and variant must remain unknown until measured or source-matched.
- User photos may be used for visible markings and approximate count only.
- Marketplace pages are purchase references; they are not assumed to be complete or stable datasheets.
- Mockups are visual hypotheses and must retain their limitations when copied, indexed, or summarized.

## Product/app separation

The iPhone remains the companion compute and network layer for location, route, recommendation, and network responsibilities. The physical display/controller may receive a minimal state contract later, but a component record does not authorize a new app feature or firmware behavior.

## Current scope

1. Preserve the four supplied purchase references and map them to the photographed inventory.
2. Record the exact board marking and known smoke-test profile for the Waveshare display.
3. Record the EC11 encoder's public family description without inventing its pinout.
4. Record the PCF8574-looking and GNSS-looking items as unresolved until their exact variants are closed.
5. Preserve the 20 existing form-exploration images with explicit visual-only status.
6. Keep H0–H3 physical-product gates as the authority for product claims.

## Out of scope for this catalog update

- Purchasing, checkout, payment, account changes, or seller communication.
- A final PCB, enclosure, battery selection, magnetic calibration result, or manufacturing claim.
- Reclassifying the historical v0.1 prototype as the final physical product.
