# 교차 플랫폼 시각 협업 런북

상태: 2026-08-27 기준 iPhone·iPad·480×480 원형 LCD 시안 협업 경로

이 문서는 Windows에서 작업하는 시각 협업자와 Mac/iOS 통합 담당자가
`Roll the compass!`의 화면과 상호작용을 같은 근거로 검토하기 위한 실행
절차다. 제품 요구사항의 정본이 아니며, 충돌할 때는
[`../README.md`](../README.md)의 권위 순서를 따른다.

## 결론

Windows에서 Apple의 Xcode와 iOS Simulator 자체를 실행할 수는 없다. 대신
저장소의 macOS GitHub Actions가 실제 SwiftUI 앱을 ARM Simulator `.app`으로
빌드하고, Windows 협업자는 그 ZIP을 Appetize에 직접 올려 브라우저에서
누르고 캡처할 수 있다. 이 경로는 단순 목업이 아니라 Debug 전시 앱의 실제
화면 라우팅, `JourneyStore`, Stop/Continue, 도착·공개 흐름을 실행한다.

브라우저 시연은 서명된 iPhone/iPad 실기기 증거가 아니다. Core Location,
CoreBluetooth, 알림, 카메라, 성능, 화면 밝기, 터치 감각은 Mac과 실제 기기에서
따로 검증한다.

## 역할과 소유권

| 역할 | 주 환경 | 책임 | 완료라고 말할 수 없는 범위 |
| --- | --- | --- | --- |
| 시각 협업자 | Windows + GitHub + Appetize | 상태별 시안, 에셋 원본, 정확한 상호작용·레이아웃 계약, 브라우저 캡처 | Xcode 컴파일, Apple 서명, 실기기 센서 |
| Mac/iOS 통합 담당자 | macOS + Xcode | SwiftUI 반영, Simulator 매트릭스, iPhone/iPad 설치·실행, GPS/BLE 확인 | Linux 운영 릴리스 권한 |
| 보드 통합 담당자 | Windows 또는 macOS + USB | Arduino CLI, 펌웨어 컴파일·플래시·시리얼, BOOT/RST·터치 확인 | iOS 앱 서명·실기기 배포 |
| 릴리스 권한 담당자 | Ubuntu CI + 외부 콘솔 | `verify:ops`, `verify:release`, Cloudflare·도메인·시크릿·권리 게이트 | Apple 기기 QA를 CI 결과로 대체 |

한 사람이 여러 역할을 맡아도 증거 종류는 합치지 않는다.

## 기준 브랜치와 SHA

- 앱 통합 브랜치: `codex/ipad-board-integration`
- 보드 통합 브랜치: `codex/roll-compass-native-app`
- 협업자 원형 LCD 원본 브랜치: `codex/full-blueprint`
- 협업자 원형 LCD 원본 SHA:
  `3022401c02e92204d2751f569b19745024724c80`
- 앱 기준: 항상 `origin/codex/ipad-board-integration`의 정확한 40자 SHA
- 보드 기준 SHA:
  `c60d9982f8e274648370513bdf253b8cba7fbef7`
- 보드용 Windows 명령과 역할별 안내:
  [해당 SHA의 Windows collaboration handoff](https://github.com/kimkiumin/Somewhere/blob/c60d9982f8e274648370513bdf253b8cba7fbef7/docs/operations/windows-collaboration-handoff.md)

시안 파일명, 이슈, Appetize 링크에는 반드시 앱 또는 보드 SHA를 적는다.
“최신 버전”만 적으면 같은 화면인지 재현할 수 없다.

### 2026-08-27 협업자 원형 LCD 원본 영수증

협업자 SHA `3022401c02e92204d2751f569b19745024724c80`의
`feat: add ESP32 compass display firmware`가 현재 원형 LCD 시각 원본이다.
이 커밋은 독립 브라우저 프로토타입과 ESP32 화면 smoke test를 추가했으며,
운영 SwiftUI 앱·V2 백엔드·BLE v2 계약을 교체하지 않았다.

두 브랜치는 서로 다른 Git root를 가지므로 브랜치 전체 merge 또는 commit
cherry-pick을 하지 않는다. 보드 통합 담당자는 다음 원본을 정확한 SHA에서
읽고, 검증된 `firmware/roll-compass-board`의 renderer에 시각 자산과 표시
규칙만 선택적으로 포팅한다.

- `prototype/compass-ui/artboard-3-2.svg`
- `prototype/compass-ui/firmware-preview.png`
- `prototype/compass-ui/compass-ui.js`
- `prototype/compass-ui/compass-ui.test.js`
- `hardware/esp32-s3-touch-lcd-2.1/SomewhereDisplaySmokeTest/`

원본은 검정 `#050706` 계기판, 얇은 미색 눈금, 초록 `#4dff76` 정보,
분홍-빨강 `#ff3850` 바늘로 구성된다. 상단은 `REMAINING`, 좌하단은
`PRICE`, 우하단은 `MENU`다. 앱이 BLE v2로 보내는 값은 다음처럼
그대로 연결한다.

| LCD 표시 | BLE v2 값 | 앱·보드 규칙 |
| --- | --- | --- |
| `REMAINING` | `d` | 신뢰 가능한 안내는 현재 거리, 억제 상태는 안전한 근사 거리 |
| 분홍 바늘 | `tb` + `md` | 앱은 진북 기준 목표 방위와 자기 편차를 한 쌍으로 전송한다. 보드는 유효한 자체 자기 방위가 있을 때만 상대 바늘을 계산하며, stale·paused·recovery·sensor-missing에서는 숨김 |
| `MENU` | `m[0]` | 최대 두 개 중 첫 대표 메뉴, 목적지 이름·주소는 전송하지 않음 |
| `PRICE` | `p` | 백엔드 공개 계약의 price band token |

`tb`와 `md`는 항상 함께 있거나 함께 빠진다. 현재 Waveshare 보드의
QMI8658에는 자력계가 없으므로, 외부 자력계 없이 실제 보드를 회전시키는
동작은 독립 나침반 증거가 아니다. 이 경우 펌웨어는 그럴듯한 고정 바늘을
만들지 않고 `sensor-missing`으로 억제하며, USB 진단 시뮬레이션만 별도
시각 검증에 사용한다.

smoke-test 폰트는 영문·숫자만 포함해 한국어 메뉴가 `?`로 대체될 수 있다.
이 제약 때문에 앱이나 백엔드의 한국어 원본을 몰래 영문으로 바꾸지 않는다.
최종 보드 통합은 필요한 한국어 glyph 또는 명시적으로 문서화한 표시 fallback을
추가해야 하며, `?` 표시는 전시 최종 PASS가 아니다.

## Windows에서 앱을 직접 보는 가장 짧은 경로

### 1. macOS 빌드 요청

GitHub 저장소의 **Actions → Roll the compass iOS browser preview → Run
workflow**에서 `codex/ipad-board-integration`을 선택한다. 이 워크플로는
`.github/workflows/ios-preview.yml`이며 다음만 수행한다.

새 워크플로가 기본 브랜치에 아직 합쳐지지 않아 Actions 목록의 수동 실행이
보이지 않는 첫 도입 시점에는 통합 브랜치 push 또는 해당 브랜치의 PR이 같은
워크플로를 자동 실행한다. 기본 브랜치 반영 뒤에는 위 수동 실행을 사용한다.

- XcodeGen 2.42.0으로 `ios/project.yml`에서 프로젝트 생성
- `iphonesimulator`, Debug, ARM64, 서명 없음으로 빌드
- `SOMEWHERE_EXHIBITION_DEMO=YES`
- `SOMEWHERE_API_ORIGIN=https://example.invalid`
- 앱 ZIP과 `preview-manifest.json`만 GitHub artifact로 7일 보관

전시 Debug 앱은 앱 내부의 결정적 이동 경로를 사용하므로 브라우저 시연에
인터넷·GPS·실제 백엔드가 필요 없다. Release 제품 경로는 계속 실제 V2 API와
Core Location을 사용한다.

GitHub CLI를 설치한 Windows PowerShell에서는 같은 작업을 다음처럼 요청하고
받을 수 있다.

```powershell
gh auth status
gh workflow run ios-preview.yml --ref codex/ipad-board-integration
gh run list --workflow ios-preview.yml --branch codex/ipad-board-integration --limit 5
gh run watch RUN_ID --exit-status
gh run download RUN_ID --dir .\preview
Get-ChildItem .\preview -Recurse
Get-FileHash .\preview\*\Somewhere-iOS-Simulator.zip -Algorithm SHA256
Get-Content .\preview\*\preview-manifest.json | ConvertFrom-Json
```

`RUN_ID`는 바로 앞 목록의 실행 번호로 바꾼다. GitHub 웹만 사용할 경우 완료된
실행의 **Artifacts**에서 `roll-compass-ios-preview-*`를 내려받고, 바깥쪽
GitHub artifact ZIP을 한 번 풀어 내부의 `Somewhere-iOS-Simulator.zip`과
manifest를 확인한다. Appetize에는 내부 Simulator ZIP을 올린다.

### 2. manifest 확인

`preview-manifest.json`에서 최소한 다음을 확인한다.

| 필드 | 기대값 |
| --- | --- |
| `finalSha` | 요청한 브랜치의 정확한 커밋 |
| `configuration` | `Debug` |
| `architecture` | `arm64` |
| `exhibitionFlag` | `YES` |
| `apiOrigin` | `https://example.invalid` |
| `signing` | `unsigned` |
| `physicalDeviceEvidence` | `false` |
| `archiveSha256` | PowerShell `Get-FileHash`와 같은 ZIP 해시 |

값이 다르면 Appetize에 올리지 말고 해당 Actions 실행을 실패 증거로 남긴다.

### 3. Appetize에서 실행

1. [Appetize 업로드 화면](https://appetize.io/upload)에서 계정에 로그인한다.
2. `Somewhere-iOS-Simulator.zip`을 iOS 앱으로 업로드한다.
3. 업로드된 특정 build를 실행하고 세로 iPhone과 iPad 프로필을 각각 본다.
4. Home → 시작 → Guiding → Stop → Continue → Arrived → Reveal을 누른다.
5. 특정 build의 공유 링크와 build ID를 시각 인수인계 packet에 기록한다.
6. 공개가 필요하지 않으면 조직 인증 사용자만 실행하도록 권한을 제한한다.

Appetize는 iOS Simulator `.app`을 담은 ZIP/TAR.GZ만 지원하며 ARM Simulator
빌드를 권장한다. App Store용 `.ipa`를 이 경로에 올리지 않는다. 무료 계정은
제한된 시험 용도이므로 세션 시간·동시 실행·보관 조건은 업로드 당일 계정에서
다시 확인한다. API 토큰을 저장소, Issue, Actions log에 넣지 않는다. 이
저장소의 CI가 Appetize로 자동 전송하지 않는 이유도 같은 권한 경계 때문이다.

## 반드시 검토할 화면과 동작

| 상태 | iPhone 13 | 세로 iPad Pro 11형 | 핵심 판정 |
| --- | --- | --- | --- |
| Home | 필수 | 필수 | 중앙 나침반 시작, 중복 문구 없음, 첫 화면 비스크롤 |
| Conditions | 필수 | 필수 | 식당만, 예산 슬라이더, 식이·알레르기는 설정으로 이동 |
| Guiding | 필수 | 필수 | 방향·거리·나침반·Stop이 한 화면, 빨간 바늘이 껍질 밖으로 나가지 않음 |
| Direction unavailable | 필수 | 필수 | 거짓 바늘을 숨기고 복구 설명·뒤로가기 제공 |
| Near | 필수 | 필수 | 가까워짐이 명확하되 목적지 정체는 숨김 |
| Paused | 필수 | 필수 | 즉시 멈춤 뒤 Continue와 종료 확인이 구분됨 |
| Arrived/Revealed | 필수 | 필수 | 도착 전 정체·사진 비노출, 허용된 공개 뒤 이름·주소와 출처가 명확한 장소/메뉴 이미지 표시; iPad는 전폭 카드 |
| Settings | 필수 | 필수 | 식이·알레르기 지속 저장, BLE 상태와 권한 문구 구분 |

Guiding은 걷는 중 사용하는 화면이므로 세로 기기에서 스크롤해 Stop이나 거리를
찾게 만들지 않는다. iPad는 휴대폰 크기 카드를 가운데 작게 띄우지 않고 가용
세로 공간을 사용하되, iPhone과 정보 위계와 조작 순서를 동일하게 유지한다.
공개 화면의 생성 이미지는 정확한 매장 사진이라고 주장하지 않고 `대표 메뉴`
성격과 자산 출처를 함께 남긴다. 현재 `소문난성수감자탕` 상태의 기준 캡처는
[`../assets/roll-compass-vnext-arrival-gamjatang-2026-08-28.jpg`](../assets/roll-compass-vnext-arrival-gamjatang-2026-08-28.jpg)다.

## 시안 전달 형식

두 방식 중 하나를 사용한다.

1. [`../templates/visual-handoff.md`](../templates/visual-handoff.md)를 복사해
   PR 설명 또는 문서로 제출한다.
2. GitHub의 **New issue → Visual handoff**를 사용한다.

필수 항목은 source SHA, surface, state, device, orientation, screenshot,
interaction, expected result, geometry, typography, color, asset, constraints,
priority, Mac verification이다. “이 느낌으로”만 적은 이미지는 구현 계약이
아니다. 편집 가능한 원본과 정확한 텍스트·좌표·상태 변화를 함께 남긴다.

파일명은 다음을 권장한다.

```text
YYYY-MM-DD_surface_state_device_short-name.ext
2026-08-27_ipad_guiding_ipad-pro-11_compass-spacing.png
2026-08-27_lcd_paused_480x480_stop-layout.fig
```

## 원형 LCD 경계

앱 시안과 원형 LCD 시안은 같은 무드를 쓰지만 같은 캔버스가 아니다.

- 캔버스 `480×480`, 좌상단 원점
- 회전 중심 `(240,240)`
- 주요 텍스트·터치·바늘의 critical safe radius `214 px`
- 협업자 SHA `3022401c`의 `artboard-3-2.svg`를 시각 정본으로 사용
- 검정 계기판 위에 초록 `REMAINING / PRICE / MENU`와 분홍 바늘을 표시
- 바늘은 중심 허브에서 회전하고 원형 화면의 critical radius 밖으로 보이지 않음
- 상태별 `Boot`, `Pairing`, `Sensor missing`, `Calibrating`, `Ready`,
  `Guiding`, `Near`, `Paused`, `Arrived`, `Stale`, `Magnetic anomaly`,
  `Update required`를 구분
- BOOT 짧은 누름과 RST의 기대 결과를 시안에 명시

협업자 `SomewhereDisplaySmokeTest`는 패널·백라이트·터치·정적 화면을 확인하는
독립 firmware evidence다. BLE, 상태머신, stale 억제, action authority가 있는
현재 보드 firmware를 통째로 대체하지 않는다.

현재 보드 구현이 움직이는 동안 Windows LVGL 미리보기를 따로 복제하면 실제
펌웨어와 갈라질 위험이 있다. 보드 브랜치의 Windows 도구 작업이 안정 SHA로
push된 다음, 동일한 LVGL 8.4 화면·runtime 소스를 SDL2 어댑터에서 컴파일하는
후속 작업으로 진행한다. 그 전에는 480×480 정적 frame과 위 좌표 계약으로
시안을 넘긴다.

## 검증과 완료 정의

시각 변경 한 건은 다음이 모두 있어야 완료다.

1. 정확한 source SHA와 artifact/preview 근거
2. 영향받는 모든 상태의 before/after
3. 숨은 목적지, 즉시 Stop, 진행 화면 비스크롤, 기존 나침반 무드 유지 확인
4. Windows/Appetize에서 실제로 누른 경로와 결과
5. Mac에서 Xcode unit/UI test와 iPhone/iPad 화면 확인
6. GPS/BLE가 관련되면 Simulator 추정이 아닌 실기기 결과
7. 원형 LCD가 관련되면 compile, flash, serial, touch, BOOT/RST 결과
8. Linux 운영 변경이면 별도의 `verify:ops`/`verify:release` 결과

## 2026-08-27 구현 및 재검증 영수증

호스티드 미리보기 기준 앱 통합 SHA
`ed628acddf070c9848a2a997124d407a033aa7db`에서 다음을 다시 확인했다.

- 앱 단위 테스트 183, E2E 34, 계약 15, 서버 238 통과; WebKit 자동화 한계
  3개는 의도적으로 skip
- `verify:ios-source`: 36 통과, 0 실패; source/field validator `PASS`
- `verify:native-evidence`: 14 통과, 0 실패
- `verify:release-authority`: 8 통과, 0 실패
- 타입검사, 린트, production build 통과
- iPhone 13 Simulator 전체 XCTest: unit 68 통과, UI 55개 실행 중 0 실패와
  환경·기기 조건에 따른 의도적 skip 9개, 최종 `TEST SUCCEEDED`
- 누락됐던 iPad 전용 중단-이유 레이아웃 test guard를 보완한 뒤 iPhone에서는
  의도적 skip, 정확한 iPad Pro 11형 2세대에서는 1 통과, 0 실패
- Xcode 26.6 + iOS 26.5 `Somewhere iPhone 13` Simulator에서 Build iOS
  Apps로 Debug ARM64 빌드·설치·Home Screen 실행 성공
- 빌드된 Info.plist: `SomewhereAPIOrigin=https://example.invalid`,
  `SomewhereExhibitionDemo=YES`

최초 hosted run
[`32984412855`](https://github.com/kimkiumin/Somewhere/actions/runs/32984412855)는
job 시작 전 `startup_failure`로 종료됐다. 같은 시각 GitHub Status는 Actions를
`major outage`로 공지했고 run annotation도 GitHub 내부 unexpected error로
표시했다. workflow runtime을 30분으로 제한한 SHA `7e7786c` push에서 두 번째
run
[`32985450887`](https://github.com/kimkiumin/Somewhere/actions/runs/32985450887)이
생성됐지만 runner step을 시작하지 못한 채 15분 뒤 취소됐다. 장애 중 실행이므로
코드 실패 근거로 사용하지 않는다.

장애 이후 이전 앱 SHA `c0720263523747cf0dca8d9227f7aeef517627d3`를
대상으로 수동 재실행한
[`32986482520`](https://github.com/kimkiumin/Somewhere/actions/runs/32986482520)은
checkout, 고정 Bun 설치, source gate, XcodeGen, ARM64 Simulator build, manifest
검사, artifact upload를 모두 통과했다. 내려받은 artifact ZIP도 `unzip -t`를
통과했고 당시 manifest의 `finalSha`가 `c0720263523747cf0dca8d9227f7aeef517627d3`와
일치한다. 당시 hosted Simulator ZIP SHA-256은
`bd82b35eb0450f62d5dc3d9527464826cd8bc080792a2ead66c206ef2c6e7044`다.

최신 앱 SHA의 수동 재실행
[`32988428040`](https://github.com/kimkiumin/Somewhere/actions/runs/32988428040)도
동일한 10단계를 모두 통과했다. 내려받은 최신 artifact ZIP은 `unzip -t`를
통과했고 manifest의 `finalSha`가 위 앱 SHA와 일치하며, ZIP SHA-256은
`a4401ea857ba312f10e95eb49434fd3eb6558bdd83971a10b89e33fb26ec0c35`다.

보드 브랜치 SHA `c60d9982f8e274648370513bdf253b8cba7fbef7`도
별도로 확인했다.

- BOOT 즉시 화면 토글 커밋: `0ee5774`
- Windows 협업·PowerShell·Arduino CLI·CI 커밋: `8088d81`
- generated asset 전체 선검증·linked/reparse 거부·원자 복원 보정: `d9258cf`
- PowerShell Bun 버전 명령의 실제 성공 상태 보정: `426784f`
- Git for Windows 체크아웃의 LF 계약 고정: `249ac2f`
- 협업자 원형 instrument 소스 포팅: `c60d998`
- Windows command-plan·asset restore·visual instrument 단위 테스트: 17 통과, 0 실패
- `verify:windows`: 계약 15, 타입검사, 린트, 웹 build, 플랫폼 중립 iOS
  source gate 통과
- Waveshare ESP32-S3-Touch-LCD-2.1 firmware compile 성공: flash 32%,
  global RAM 10%

실제 GitHub Windows runner 실행
[`32988860540`](https://github.com/kimkiumin/Somewhere/actions/runs/32988860540)은
고정 Bun 설치, frozen dependency 설치, WSL 없는 PowerShell command-plan,
`verify:windows`를 모두 통과했다. 이 러너에는 물리 보드와 COM 포트가 없으므로
실제 플래시·시리얼·BLE·BOOT/RST 증거는 여전히 별도 상태로 유지한다.

## 외부 근거

- [Apple Xcode SDK 및 시스템 요구사항](https://developer.apple.com/xcode/system-requirements/)
- [Appetize iOS Simulator 빌드 업로드 형식](https://docs.appetize.io/platform/app-management/uploading-apps/ios)
- [Appetize build 공유와 권한](https://docs.appetize.io/platform/sharing-apps)
- [Appetize 제한 무료 계정 안내](https://support.appetize.io/may-i-test-appetize.io-for-free-before-paying-for-an-account)
- [GitHub Actions workflow artifact](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)
- [2026-08-27 GitHub Actions 장애](https://www.githubstatus.com/incidents/y1t7p9fzrlj2)
