# Roll Compass board firmware

This sketch targets the flat Waveshare `ESP32-S3-Touch-LCD-2.1` board (not the
2.1B variant). The phone remains the journey authority; this board only
renders safe guidance and emits touch intents over BLE.

## Local setup

From the repository root:

```sh
bun run firmware:setup
bun run firmware:assets
bun run firmware:ios
bun run firmware:compile
```

The setup is pinned in `dependencies.lock` and installs Arduino CLI and XcodeGen
under `.tools/`, with Arduino data under `.local-artifacts/`. Homebrew is not
required. The supported board FQBN is:

```text
esp32:esp32:waveshare_esp32_s3_touch_lcd_21
```

`firmware:assets` regenerates the 520px cropped LVGL compass shell and needle
from the shared iOS artwork. The board crop removes the transparent outer
decoration so the circular body reaches the display edges; the image is
intentionally clipped by the 480×480 face. The dial owns most of the display
while status, distance, and touch actions sit on top as small rounded overlays
rather than separate cards.

## USB flashing and logs

The connected CH343P USB-UART port is normally exposed as
`/dev/cu.usbmodem*`. Upload compiles first and does not erase flash:

```sh
bun run firmware:upload
BOARD_PORT=/dev/cu.usbmodem5B901259011 bun run firmware:upload
bun run firmware:monitor
```

The port can change after a reset. If more than one modem is connected, set
`BOARD_PORT` explicitly. Serial speed is 115200.

## BLE runtime contract

- Advertised name: `Roll Compass`
- Service: `C1F8A100-35D1-4C53-9A03-7A1B3E620001`
- State write characteristic: `C1F8A101-35D1-4C53-9A03-7A1B3E620001`
- Event notify characteristic: `C1F8A102-35D1-4C53-9A03-7A1B3E620001`

State and event messages are newline-delimited compact JSON. The board rejects
unknown versions/actions, invalid numbers, oversized frames, and any payload
that does not contain the safe state fields. Destination identity is not part
of the board contract.

## Display behavior

The official Espressif `ESP32_Display_Panel` preset initializes the 480×480
RGB LCD and CST820 touch controller. The LVGL UI shows connection status,
phone-computed direction only when confidence is `credible`, approximate
distance, safe category/price cues, and only the actions advertised by the
phone. A stale state hides the arrow and disables actions.

Wi-Fi and the QMI8658 IMU are intentionally not used in the journey path.
Wi-Fi is reserved for a later OTA/diagnostics milestone, and the IMU is not a
magnetometer so it must not calculate compass heading.
