# 원형 LCD 인수인계 · 2026-09-06

보드를 넘겨받은 협업자를 위한 현재 상태와 규격이다. 필요한 항목만 참고하면
된다. 지금은 **센서 없는 전시 데모까지 구현한 개발 펌웨어**이며, 실제 보행
나침반 완성품은 아니다. 사용자가 보고한 **왼쪽 화면 지글거림은 실물 재검증이
남아 있다.** 이번 변경은 확인된 과도한 화면 갱신을 줄였지만 증상 해결을
실기기에서 확인한 것은 아니다.

## 코드와 실물의 기준

| 구분 | 기준 |
| --- | --- |
| 보드 작업 브랜치 | `codex/roll-compass-native-app` — 이 문서가 포함된 최신 커밋 사용 |
| 이번 변경 직전 원격 | `a41867ff0375e34c995f0aa86d48d1b979559933` |
| 회전/그리기 개선 코드 | `de52405cc75a04e13ac6f18416d81e99b2c75b59` |
| 마지막 실물 플래시 | 2026-08-28, 위 커밋 + 당시 미커밋 방위판 회전 변경. 단일 커밋 SHA로 식별할 수 없었음 |
| 이번 펌웨어 식별 로그 | `display_revision=bounded-lines-v1 contract=2 built=...` |
| 협업자 원형 시안 | `codex/full-blueprint@3022401c02e92204d2751f569b19745024724c80` |
| 확인한 앱 통합 기준 | `codex/ipad-board-integration@7eeffafb348e9a7285892424f3e438b90035d9ef` |

`full-blueprint`는 별도 Git root이므로 통째로 merge/cherry-pick하지 않는다.
시안 SVG/폰트의 출처와 선택적 재생성 방법은
[Windows 인수인계](windows-collaboration-handoff.md#circular-instrument-source-handoff)에 있다.
이번에는 보드 렌더러와 문서만 수정했다. 앱 브랜치의 새 화면 전체를 보드에
복제한 것은 아니다.

## 하드웨어와 화면 규격

| 항목 | 현재 기준 |
| --- | --- |
| 모델 | Waveshare **ESP32-S3-Touch-LCD-2.1**, 평면형. 2.1B 곡면형과 구분 |
| LCD | 2.1인치 원형, 480×480, ST7701 계열 RGB 패널 |
| 터치 | CST820, 정전식 I²C |
| MCU / 메모리 | ESP32-S3, 최대 240MHz, 제품 사양 Flash 16MB / PSRAM 8MB |
| 앱 파티션 | 현재 빌드 최대 3,145,728바이트. 전체 Flash 용량과 다름 |
| 실제 렌더링 | RGB565, 16비트/픽셀. 패널 제품의 262K 색 사양과 구분 |
| 화면 버퍼 | PSRAM 480×480×2바이트×2장 = 921,600바이트, LVGL direct double |
| 부족 시 대체 모드 | LCD 1장 + 내부 RAM 20행 LVGL 버퍼 2개. tearing-free 보장 없음 |
| 패널 클록 | 고정된 Display Panel 1.0.4 프리셋: PCLK 16MHz, bounce 설정 `480 * 10` |
| 패널 타이밍 | 수평 pulse/back/front = 8/10/50, 수직 = 3/8/8. 임의 변경 전 실물 비교 필요 |
| 연결 | BLE가 앱 상태 전달. USB는 업로드/시리얼. Wi-Fi/OTA는 현재 미구현 |
| 방향 센서 | QMI8658은 가속도·자이로만 제공. 현재 magnetometer 드라이버/보정 연결 미구현 |
| 제어 | BOOT(GPIO0) 짧게: 백라이트 토글, RST: 리셋, 전원 스위치: 하드웨어 전원 |

제품·메모리·커넥터·치수 출처는
[Waveshare 공식 문서](https://docs.waveshare.com/ESP32-S3-Touch-LCD-2.1),
LCD/touch 및 구동 설정은 설치된 `ESP32_Display_Panel@1.0.4`의
`src/board/supported/waveshare/BOARD_WAVESHARE_ESP32_S3_TOUCH_LCD_2_1.h`다.
**외장 제작에는 제조사 치수도와 전달받은 실물 리비전을 사용한다.**
480px나 공칭 2.1인치에서 외곽 유리·나사홀·USB 돌출 치수를 추정하지 않는다.
microSD는 현재 UI에 필요 없으며 실행 파티션이나 화면 해상도를 늘리지 않는다.

## 화면과 동작 규격

| 요소 | 규격 / 동작 |
| --- | --- |
| 좌표계 | 좌상단 `(0,0)`, 중심 `(240,240)`, 시계방향 양수, 0°는 12시 |
| 원형 영역 | 반경 240px, 바늘/회전 눈금 검사 한계 반경 230px |
| 눈금 | 협업자 원본 80개, 1px 선. 바깥 끝은 약 반경 218px |
| 방위판 | `normalize(-(boardMagneticHeading + md))`. 글자는 똑바로 선 채 원을 따라 이동 |
| 기준 표시 | 12시에 고정된 작은 미색 V 표시. 화면 전체 장착 회전은 0° |
| 바늘 | 중심에서 길이 139px. 원본 2px 선 / spear / dual rail / balanced / cutlass 총 5종 |
| 터치 | 빈 영역 탭 → 다음 바늘, 5번째 다음 첫 번째. 재부팅 시 원본으로 복귀 |
| 색 | 배경 `#050706`, 눈금 `#E4ECE8`, 값 `#4DFF76`, 바늘 `#FF3850` |
| 레이아웃 | 위 REMAINING, 좌하 PRICE, 우하 MENU. 스크롤 없음. 정확한 bounds는 `compass_layout.h` |
| 움직임 | 25ms 고정 간격의 스프링 계산. 실제 패널 FPS를 뜻하지 않음 |

기기를 제자리에서 오른쪽으로 30° 돌리고 목적지가 그대로라면 **눈금판과 바늘
둘 다 화면에서 왼쪽으로 30°** 변한다. 이동해 목적지 방위가 바뀌면 바늘만
눈금판에 대해 더 움직인다. 별개 계산이라고 매번 다른 속도로 움직이는 것은
아니다. 센서 누락/불신·stale·paused·recovery에서는 바늘을 숨기고 방위판을
멈춘다. 멈춰 있는 N은 측정된 현재 북쪽이라고 해석하면 안 된다.

자동 데모는 `320 m / TONKATSU / PRICE -`, 바늘 초기 35°, 헤딩 ±12°의 8초
왕복이다. 그래서 방위판도 ±12°로 왕복한다. 거리 감소 여정은 이 독립 시안
데모에 구현되어 있지 않다. 앱 전시의 약 1.65km/한식 시작값과 다른 것은
**의도된 독립 프리뷰**다. 처음 도착한 유효하고 최신인 BLE v2 상태가 자동
데모를 종료하며 앱 값을 우선한다. 연결만으로는 바늘의 실제 방위가 생기지 않는다.

## BLE v2와 글꼴의 한계

`d` → REMAINING, `m[0]` → MENU, `p` → PRICE.
`tb`는 진북 기준 목적지 방위, `md`는 동쪽 양수 자기 편각이며 두 값은 한 쌍이다.
`needle = shortestDelta(boardMagneticHeading + md, tb)`로 계산한다.
앱 상대각 `b`를 사용하던 v1로 되돌리지 않는다.

현재 `buildRuntimeInput()`은 실제 센서 상태를 `Missing`으로 둔다. 따라서
휴대폰이 연결돼 값이 들어와도 **별도 보드 heading 수집/보정 작업 전에는 실제
바늘이 숨겨지는 게 정상**이다. LIS2MDL 같은 외부 자력계 연결은 다음 개발
범위이며, 부품을 꽂는 것만으로 이번 펌웨어가 읽지는 않는다.
정확한 UUID·프레임·액션은 [BLE 문서](physical-compass-ble.md)와
`physical_compass_wire.*`를 참고한다. 목적지 이름/주소는 전송하지 않는다.

ASCII는 원본 Univers Thin Condensed bitmap을 사용한다. 한국어는 Noto Sans KR
16/20px **제한된 글리프 집합**으로 분기한다. `generate-board-fonts.sh`의
`korean_symbols`에는 상태 문구 위주로만 들어 있어 **임의의 한국어 메뉴 전체를
지원한다고 보장할 수 없다**. UTF-8 잘림 방지는 글리프 지원과 별개다.
발표에 쓸 메뉴의 글자가 빠졌다면 원본 한글 계약을 유지하면서 해당 글리프를
추가·재생성한 뒤 `package-board-assets.mjs`로 Windows용 번들도 갱신해야 한다.

## 왼쪽 지글거림: 확인된 부분과 확인할 부분

이번에 소프트웨어에서 확인한 것은 아래 세 가지다.

- 짧은 눈금/바늘 선도 LVGL 객체 크기가 480×480여서 한 선 갱신이 화면 전체를
  무효화했다. 이제 선의 실제 위치·크기로 제한하고 이전 위치를 지운다.
- 약 5ms 루프마다 같은 좌표를 다시 넣었다. 이제 25ms 계산 간격으로 갱신하고
  동일한 픽셀 좌표·스타일·표시 상태는 다시 쓰지 않는다.
- 방위 변화만으로 고정된 거리/가격/메뉴까지 다시 설정했다. 이제 방위 애니메이션과
  내용 변경을 구분한다. BOOT로 화면을 끄면 애니메이션 작업도 쉰다.

실제 LVGL 8.4 호스트 검증에서 왼쪽 눈금 하나의 불필요한 갱신은
**230,400px → 동일 좌표 0px**, 1px 이동은 **532px**였다. 이동·축소하는 선의
156개 경우에서 기존과 최종 RGB565 픽셀이 같고 이전 선 잔상이 없는 것을
검사했다. 이 수치는 **단일 눈금 테스트**이며, 전체 UI의 FPS나 LCD 전송량이
같은 비율로 개선됐다는 의미는 아니다.

1px 선은 정수 픽셀을 옮길 때 미세하게 반짝여 보일 수 있다. 화면 줄 전체가
찢어지거나 밀리는 증상은 별도로 패널 전송/타이밍을 봐야 한다.
[Espressif RGB LCD 문서](https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32s3/api-reference/peripherals/lcd/rgb_lcd.html)는
PSRAM 대역폭과 버퍼 동기화가 화면 밀림/tearing에 영향을 줄 수 있다고 설명한다.
현재 프리셋에는 이미 bounce buffer가 있다. 이번에는 검증 없이 PCLK를 올리거나
패널 전송 드라이버를 교체하지 않았다.

### 협업자가 실물에서 비교할 방법

Windows 환경 설치는 [기존 PowerShell 안내](windows-collaboration-handoff.md#compiling-and-flashing-the-board-without-wsl)를
사용한다. 예시 `COM7`은 반드시 실제 연결 포트로 바꾼다.

```powershell
git switch codex/roll-compass-native-app
git pull --ff-only
bun install --frozen-lockfile
.\scripts\firmware\windows-board.ps1 ports
.\scripts\firmware\windows-board.ps1 upload -Port COM7
.\scripts\firmware\windows-board.ps1 monitor -Port COM7
```

로그에서 새 `display_revision`과 `display_mode=direct_double`을 확인한다.
모니터를 연 상태에서 RST를 한 번 눌러야 부팅 로그가 잡힐 수 있다.
이번 코드가 자동으로 이미 전달된 보드에 배포되지는 않는다.

앱 BLE 연결을 끈 뒤 시리얼 모니터에 한 줄씩 보내 비교한다.

```text
sim on
sweep stop
heading 0
target 35
```

1–2초 안정화 후 정지 화면을 본다. 이어 `sweep cw`로 360° 회전,
`sweep stop`으로 정지, `sim on`으로 원래 왕복 데모를 복원한다.
`state paused`, `state sensor-missing`, `state anomaly`에서 바늘이 사라지는지도
필요할 때 확인한다. 연결된 앱에서 계속 새 값을 보내면 자동으로 데모를 덮는다.

| 관찰 | 다음 확인 |
| --- | --- |
| 정지하면 깨끗하고 얇은 선 움직임만 반짝임 | 픽셀 이동/렌더 부하 가능성. 이번 버전과 원본 2px 바늘로 비교 |
| 움직일 때 화면의 줄/블록 전체가 밀림 | direct/partial 로그, 전송 타이밍·PSRAM 상태 확인 |
| 같은 왼쪽 위치가 정지 상태에서도 계속 깨짐 | 같은 전원/케이블로 제조사 예제와 비교. 패널·연결·구동 설정 가능성 모두 남음 |
| 사진/영상에만 띠가 보임 | 육안과 비교. 카메라 셔터와 화면 갱신의 간섭 가능성 |

기기 결함 판정 전에 펌웨어 SHA, 새 부팅 로그, 정지/회전 각각의 관찰, 사용한
USB 포트·전원 정보를 남기면 다음 작업자가 이어서 판단할 수 있다.
제조사 예제를 올릴 경우 현재 브랜치와 SHA를 기록하면 같은 소스로 복원 가능하다.

## 이번 검증과 남은 작업

- `bun run firmware:test`: 각도/편각/상태 억제, 360° 눈금 원형 경계와 기존 BLE/5종 바늘 테스트.
- `bun run firmware:test-renderer`: 실제 LVGL의 픽셀 동일성·잔상·갱신 영역 검사.
  macOS/Linux C/C++ 컴파일러와 `firmware:setup`의 LVGL 설치를 사용한다.
- `bun run firmware:compile`: 고정 Arduino 도구로 전체 펌웨어 컴파일.
- `bun run verify:windows`: 기존 Windows 공유 검증. Windows CI는 실제 LCD나 Arduino 업로드를 검사하지 않는다.

2026-09-06 로컬에서 위 네 검증을 통과했다. 전체 Arduino 빌드는 실행 이미지
1,017,849바이트(앱 파티션 32%), 전역 RAM 34,884바이트(10%)였다.
전역 RAM 비율은 LVGL/PSRAM 동적 할당까지 포함한 총 메모리 사용률이 아니다.
Windows 공유 검증은 로컬 macOS에서 실행했으며 실제 Windows 결과는 해당 커밋의
GitHub Actions `Somewhere Windows collaboration smoke`에서 별도로 확인한다.
기존 서버 lint의 정보성 알림 9건은 남아 있고 오류는 없었다.
추가로 루트에서 직접 실행한 `biome check`는 기존 `app`/`server`의 중첩 root
설정 충돌로 실행되지 않았다. 위 공유 검증 안의 각 패키지 lint와는 별개이며,
이번 보드 작업에서 저장소 전체 Biome 설정을 변경하지 않았다.

이번 변경의 가설은 “불필요한 redraw를 줄이면 같은 시안의 움직임 안정성을
높일 수 있다”이다. 테스트는 화면 부하 개선을 뒷받침하지만, **실보드 지글거림
해결 여부·회전 체감·터치/BOOT 반응 재확인은 협업자에게 남긴다.**
실제 방향 센서 연동·임의 한국어 메뉴 지원·독립 데모 거리 감소는 별도 미완성 항목이다.
