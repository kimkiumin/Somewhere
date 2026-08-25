# Product Validation Gates

These gates are the next actions implied by the current evidence catalog. Passing a part-level gate does not pass the full physical-product H0–H3 gates.

## Inventory closure

| Gate | Applies to | Pass evidence | Current state |
|---|---|---|---|
| `P-G0-IDENTITY` | PCF8574 board and GNSS-looking set | exact listing title/model or readable chip/PCB marking matched to a source | open |
| `P-G0-PHOTO` | all unmatched accessories | receiving photo with labels, quantity, and connector side visible | open |

## Electrical / interaction checks

| Gate | Applies to | Minimum record | Current state |
|---|---|---|---|
| `P-G1-DISPLAY` | Waveshare board | board variant, USB port role, display/touch init, stable frame, current and heat log | smoke test exists; unit-level evidence to repeat |
| `P-G1-POWER` | display and every module | measured rail, polarity, current limit, connector mapping; no battery until verified | open |
| `P-G1-ENCODER` | EC11 encoder | five-terminal map, A/B phase, switch behavior, bounce, detent count, shaft dimensions | open |
| `P-G1-I2C` | PCF8574 board | chip suffix, address, VCC, SDA/SCL pull-up rail, all I/O test at safe voltage | open |
| `P-G1-GNSS` | receiver-looking set | chip identity, power/UART map, current, protocol, antenna relationship, cold-start result | open |

## Physical product gates

The project-wide gates remain in [`docs/blueprint/physical_product.md`](../../docs/blueprint/physical_product.md) and [`docs/feasibility/hardware_architecture.md`](../../docs/feasibility/hardware_architecture.md):

- `H0`: full-scale embodied form and control comprehension, without an electronics claim.
- `H1`: USB/BLE display and status behavior.
- `H2`: heading, tilt, interference, stale/reconnect, latency, power, and haptic/motor matrix.
- `H3`: final-enclosure repeatability after H2.

## RAG safety checks

- A retrieved `candidate_not_confirmed` record must not be presented as a purchased part.
- A retrieved `identity_unresolved` record must not produce a pinout or safe-voltage answer.
- A retrieved visual mockup must retain `visual_hypothesis_only`.
- A local firmware smoke-test pass must be described as a test-profile result, not a universal specification for every board revision.
