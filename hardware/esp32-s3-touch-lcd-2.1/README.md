# ESP32-S3 2.1-inch display firmware

이 폴더는 `ESP32-S3 2.1-inch 480x480 touch display` 보드에 올릴 수 있는 독립 펌웨어입니다. 화면 초기화가 되면 색상 막대가 잠깐 나타난 뒤 제공된 SVG의 원형 컴퍼스 레이아웃과 동적 `REMAINING / PRICE / MENU` 표시가 나타납니다.

## 보드 연결

외부 점퍼선은 필요하지 않습니다.

```text
컴퓨터 USB 포트 ── USB 데이터 케이블 ── 보드의 USB-C 포트
```

첫 테스트는 USB 전원만 사용하세요. 배터리 커넥터에는 아직 연결하지 마세요. USB-C 케이블이 충전 전용이면 포트가 보이지 않으므로 데이터 케이블을 사용해야 합니다.

## Arduino IDE 준비

1. Arduino IDE 2.x를 설치합니다.
2. `Preferences → Additional boards manager URLs`에 Espressif 보드 패키지 URL을 등록합니다.
3. Boards Manager에서 `esp32 by Espressif Systems` 3.0.0 이상을 설치합니다.
4. `SomewhereDisplaySmokeTest/SomewhereDisplaySmokeTest.ino`를 엽니다.
5. 보드 설정을 다음처럼 선택합니다.

| 항목 | 값 |
|---|---|
| Board | `ESP32S3 Dev Module` |
| Flash Size | `16MB` |
| PSRAM | `OPI PSRAM` |
| USB Mode | `Hardware CDC and JTAG`가 보이면 선택 |
| USB CDC On Boot | `Enabled` |
| Port | 보드를 꽂았을 때 새로 생긴 COM 포트 |

보드 패키지 버전에 따라 메뉴 이름이 조금 다를 수 있습니다. 별도의 LVGL, GFX 라이브러리는 이 스모크 테스트에 필요하지 않습니다.

## 업로드

1. `Verify`로 컴파일합니다.
2. `Upload`를 누릅니다.
3. 업로드가 멈추면 보드의 `BOOT`를 누른 상태에서 `RESET`을 한 번 누르고, `BOOT`를 놓은 뒤 다시 업로드합니다.
4. Serial Monitor를 열고 baud rate를 `115200`으로 맞춥니다.

정상적으로 시작되면 다음과 비슷한 로그가 나옵니다.

```text
[SOMEWHERE] ESP32-S3 Touch LCD 2.1 smoke test
[INFO] chip=ESP32-S3 flash=16777216 bytes psram=yes ...
[READY] display + backlight + touch driver initialized
```

## 화면에서 확인할 것

- 처음 약 1초: 빨강·초록·파랑 색상 테스트와 `DISPLAY OK`
- 이후: SVG 눈금 기반의 원형 컴퍼스, 회전하는 핑크 바늘, `320 m`, `PRICE -`, `MENU TONKATSU`
- 화면을 터치하면 Serial Monitor에 터치 좌표가 출력됨

화면이 켜지고 색상 테스트가 보이면 플래시 업로드, ST7701 초기화, RGB 프레임버퍼, 백라이트가 모두 동작한 것입니다. 터치까지 반응하면 CST820과 I2C 경로도 확인됩니다.

## 문제 해결

### COM 포트가 나타나지 않음

- 충전 전용 케이블 대신 데이터 케이블을 사용합니다.
- 다른 USB 포트에 연결합니다.
- Windows에서 CH343P USB-Serial 드라이버가 필요한지 확인합니다.
- `BOOT → RESET → BOOT 해제` 순서로 다운로드 모드에 진입한 뒤 포트를 다시 확인합니다.

### 업로드는 되지만 화면이 검은색

- `Flash Size=16MB`, `PSRAM=OPI PSRAM`인지 확인합니다.
- 보드 패키지가 3.0.0 미만이면 업데이트합니다.
- 링크 상품의 실크 인쇄가 실제로 `ESP32-S3-Touch-LCD-2.1` 또는 `2.1B`인지 확인합니다. 다른 2.1인치 ESP32 보드는 RGB 핀과 ST7701 초기화 값이 다를 수 있습니다.
- 백라이트만 켜지고 `DISPLAY OK`가 안 보이면 화면 패널 변형이 상품 설명과 다른 경우일 수 있습니다. 이때 보드 뒷면 사진과 실크 인쇄를 확인해야 합니다.

### 컴파일 에러가 발생함

이 테스트는 Arduino-ESP32 3.x의 `esp_lcd` API를 사용합니다. 오래된 ESP32 코어를 삭제하거나 업데이트한 뒤 다시 컴파일하세요.

## 파일 구성

- `SomewhereDisplaySmokeTest.ino`: 색상 테스트, SVG 눈금 컴퍼스, 바늘, 3행 텍스트, 터치 처리
- `Display_ST7701.cpp/.h`: Waveshare ST7701 RGB 패널 초기화와 프레임버퍼 연결
- `TCA9554PWR.cpp/.h`: 화면 리셋·전원 제어용 I/O 확장칩
- `Touch_CST820.cpp/.h`: CST820 터치 컨트롤러
- `I2C_Driver.cpp/.h`: 보드 내부 I2C 핀 설정
- `display_content.h`: 거리·메뉴·가격 표시 버퍼 규칙
- `univers_next_pro_thin_condensed_font.h`: 첨부 TTF에서 생성한 안티앨리어싱 영문·숫자 비트맵 폰트
- `compass_artwork.h`: `prototype/compass-ui/artboard-3-2.svg`의 80개 눈금 좌표
- `tools/generate_display_assets.py`: TTF/SVG에서 두 헤더를 재생성하는 도구

## 폰트와 표시값

펌웨어는 런타임에 TTF를 읽지 않습니다. `Univers Next Pro Thin Condensed.ttf`에서 라벨(8px), 보조값(16px), 방위(28px), 거리(34px) 글리프를 안티앨리어싱 비트맵으로 변환해 플래시에 포함합니다. 원본 TTF는 라이선스 문제를 피하기 위해 저장소에 복사하지 않습니다.

첨부 TTF로 자산을 다시 만들 때:

```powershell
python hardware\esp32-s3-touch-lcd-2.1\SomewhereDisplaySmokeTest\tools\generate_display_assets.py `
  --font "C:\Users\kyumin\AppData\Local\Temp\Univers Next Pro Thin Condensed.ttf" `
  --svg prototype\compass-ui\artboard-3-2.svg `
  --output-dir hardware\esp32-s3-touch-lcd-2.1\SomewhereDisplaySmokeTest
```

화면의 데이터는 스케치의 `setDisplayState(distance_meters, price_band, menu, target_bearing_deg, heading_deg, direction_valid)`로 갱신할 수 있습니다. BLE/시리얼 입력을 연결하기 전까지는 기본값 `320`, `-`, `TONKATSU`, `35°`, `0°`를 사용합니다. 가격은 숫자만 남겨 `10000원`, `₩10,000`을 `10000`으로 표시하고, 숫자가 없으면 `-`로 표시합니다. 메뉴는 영문 표시를 전제로 하며 지원하지 않는 글리프는 `?`로 안전하게 대체됩니다.

저수준 디스플레이 드라이버는 Waveshare의 공식 `ESP32-S3-Touch-LCD-2.1` Arduino 예제 구조를 기준으로 정리했습니다. 공식 보드 문서와 리소스는 [ESP32-S3-Touch-LCD-2.1 문서](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1)와 [공식 리소스 페이지](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1/Resources-And-Documents)에서 확인할 수 있습니다.

## 로컬 계약 테스트

하드웨어가 연결되지 않은 환경에서는 화면에 넣는 3행 데이터 규칙만 Node로 확인할 수 있습니다.

```powershell
node --test hardware\esp32-s3-touch-lcd-2.1\SomewhereDisplaySmokeTest\display_content.test.js
```

이 저장소에는 Arduino 툴체인이 포함되어 있지 않으므로 로컬에서 보드 컴파일·업로드를 대신할 수 없습니다. Arduino IDE에서 Verify와 Upload를 한 번씩 수행해야 실제 보드의 전기적 연결, 패널 초기화, 폰트 가독성, 밝기, 터치, 발열을 확인할 수 있습니다. 이 펌웨어는 업로드 가능한 소스 구조이며 실제 COM 포트 업로드까지 완료된 상태는 아닙니다.
