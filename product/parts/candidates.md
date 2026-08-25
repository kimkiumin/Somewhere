# Planning Candidates — Not a Purchase Record

These parts were proposed in the existing feasibility work before the photographed AliExpress purchases. They remain candidate architecture inputs, not confirmed inventory. The actual purchased Waveshare board is tracked separately.

| Candidate | Aliases | Intended role | Evidence / risk | Gate |
|---|---|---|---|---|
| Seeed Studio XIAO ESP32-S3 | XIAO ESP32-S3 | BLE peripheral, codec, fusion, display control | `BLE 5`, I2C/SPI, and manufacturer figures are planning evidence; assembled current and antenna behavior need measurement | H1 purchase and BLE/display test |
| Seeed Studio Round Display for XIAO | XIAO Round Display, 39 mm round display | earlier 1.28-inch 240×240 touch face candidate | This is not the photographed Waveshare 2.1-inch board; outdoor readability, touch, power, and magnetic cleanliness remain open | H0/H1 display and form tests |
| Adafruit LIS2MDL breakout #4488 | LIS2MDL magnetometer | physical magnetic heading | hard/soft-iron error and installation error | H2 eight-heading/tilt matrix |
| Adafruit LSM6DSOX breakout #4438 | LSM6DSOX IMU | tilt and motion input | fusion and enclosure alignment are unimplemented | H2 flat/15°/30° matrix |
| Adafruit DRV2605L #2305 + vibration disc | haptic driver, ERM motor | nonvisual warning or fallback | motor field and vibration may corrupt magnetic sampling | only after sensor-only baseline |
| BMM350 | alternate magnetometer | later sensor comparison | no frozen breakout, price, or integration path | explicit comparison decision |
| TowerPro SG92R #169 | micro servo | bounded motorized-needle negative control | motor, magnets, backlash, power, and interference risk; not the baseline | only after digital H2 |

Source: [`docs/feasibility/hardware_architecture.md`](../../docs/feasibility/hardware_architecture.md) and [`docs/feasibility/bom_and_purchase_gates.md`](../../docs/feasibility/bom_and_purchase_gates.md).

The planning BOM's KRW 200,000 ceiling, H0/H1/H2 sequence, shipping/tax reserves, battery allowance, and optional servo rule remain planning constraints. None of them changes the current photographed inventory.

## RAG distinction

If a question asks “what do we own now?”, retrieve [`bom.md`](bom.md) and the `purchased/` records first. If it asks “what could the architecture use later?”, retrieve this file and preserve `candidate_not_confirmed`.
