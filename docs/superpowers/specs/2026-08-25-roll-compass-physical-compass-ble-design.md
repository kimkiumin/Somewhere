# Roll the compass physical BLE prototype design

## Outcome

Connect the existing iPhone V2 app to a Waveshare ESP32-S3-Touch-LCD-2.1 over
Bluetooth Low Energy. The phone remains the authority for GPS, heading,
trusted-route guidance, recommendation state, server actions, and destination
identity. The board is a low-screen companion: it renders the current safe
projection and sends touch intents back to the phone.

This is an explicitly approved physical-prototype extension to the V2 stretch
roadmap. It does not change the hidden-destination boundary or create a
standalone navigation product.

## Boundaries

- USB is the development transport for flashing and serial logs only.
- BLE is the runtime journey transport between the iPhone and board.
- Wi-Fi is reserved for a later firmware-update/diagnostics path; it is not
  needed for a journey and is not added to this milestone.
- The board has no GPS, cellular, recommendation, route, or destination-name
  authority.
- The board never reveals destination identity and cannot mutate server state
  directly.
- There is no background or locked-screen navigation promise. The iOS app does
  not request `bluetooth-central` background mode in this milestone.
- The board's QMI8658 IMU is available for diagnostics only. It is not a
  magnetometer and must not be used to calculate a compass heading.

## Runtime topology

```text
iPhone Core Location + server projection
        │
        ├── phone-computed arrow, distance, confidence, safe disclosure
        │        (BLE state characteristic, phone → board)
        │
        └── board touch intent
                 (BLE event characteristic, board → phone)
```

`JourneyStore` owns the integration point. Whenever the server projection or
phone guidance changes, it sends a compact snapshot. Board events are mapped to
the existing guarded `JourneyStore` methods (`requestStop`, `cancelStop`,
`confirmStop`, and `requestReveal`) rather than bypassing the API service.

## BLE contract v1

Service UUID:

`C1F8A100-35D1-4C53-9A03-7A1B3E620001`

Characteristics:

- State, phone → board, write without response:
  `C1F8A101-35D1-4C53-9A03-7A1B3E620001`
- Event, board → phone, notify:
  `C1F8A102-35D1-4C53-9A03-7A1B3E620001`

The board advertises as `Roll Compass` and advertises the service UUID. Both
directions use newline-delimited UTF-8 JSON. The iOS client chunks writes at
the negotiated BLE write length; the board reassembles until `\\n`. Each
logical message is limited to 512 bytes and the UI builder truncates display
strings before encoding if needed.

State message example:

```json
{"v":1,"type":"state","seq":14,"phase":"following","d":420,"b":315,"c":"credible","m":["한식 국물 요리"],"p":"medium","a":["stop"],"r":false,"ts":1787659200000}
```

Fields:

- `v`: contract version, currently `1`.
- `seq`: monotonically increasing phone snapshot sequence.
- `phase`: safe journey phase string.
- `d`: remaining route distance in metres, omitted when unavailable.
- `b`: phone-computed device-relative arrow degrees, omitted when guidance is
  suppressed.
- `c`: `credible` or a suppression reason.
- `m`: zero to two safe representative category strings.
- `p`: safe price band, omitted when unavailable.
- `a`: guarded actions exposed by the current projection.
- `r`: whether the server has already revealed identity; identity itself is
  never sent.
- `ts`: phone timestamp in milliseconds.

Board event example:

```json
{"v":1,"type":"event","action":"stop","seq":14}
```

Allowed event actions are `stop`, `continue`, `confirm-stop`, `reveal`, and
`review`. Unknown versions, actions, non-finite numbers, invalid sequence
values, and oversized frames are rejected.

## Board display and touch behavior

The first board UI is deliberately text-first:

- connection/status line;
- large direction arrow only for `credible` guidance;
- approximate distance;
- one or two safe category labels and price band;
- large touch actions derived from the phone snapshot.

When guidance is suppressed, the board shows a calm recovery status and hides
the arrow. When stale or disconnected, it shows `연결 대기`/`방향 확인 중` and
does not invent a direction. Touch actions remain guarded by the `a` field and
are only sent as intents; the phone validates the current server projection.

## Toolchain

- Arduino CLI 1.5.1, installed locally under `.tools/arduino-cli`.
- XcodeGen 2.46.0, installed locally under `.tools/xcodegen`.
- Espressif Arduino core 3.3.11 and board FQBN
  `esp32:esp32:waveshare_esp32_s3_touch_lcd_21`.
- Espressif `ESP32_Display_Panel` 1.0.4 for the official
  `BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_2_1` board preset.
- LVGL 8.4.0, `ESP32_IO_Expander` 1.x, `esp-lib-utils` 0.2.x, and
  ArduinoJson 7.4.3.
- CoreBluetooth on iOS 17+, with
  `NSBluetoothAlwaysUsageDescription` and no background-mode promise.

## Failure and recovery

- BLE unavailable: the phone app continues normally and the board remains
  disconnected.
- Board disconnects: the iOS client scans/reconnects while running; the board
  displays a stale/disconnected state until a fresh snapshot arrives.
- Invalid or oversized payload: reject and keep the last known safe state;
  never reveal identity or execute a server action on malformed input.
- Upload failure: keep the existing flash intact; do not erase flash as part of
  setup.
