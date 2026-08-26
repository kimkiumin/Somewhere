# 비-Mac 협업자용 iOS 인수인계

상태: 2026-08-26 기준 `Roll the compass!` 네이티브 앱 협업 진입점

이 문서는 Windows, ChromeOS, GitHub 웹처럼 Xcode를 실행할 수 없는
환경의 사람과 AI 협업자를 위한 문서다. 이 문서만으로 제품 의도, 최신
브랜치, 전시용 실행 경로, 실제 제품 경로, 수정 가능한 파일, 검증을 Mac
담당자에게 넘기는 방법을 구분할 수 있어야 한다.

이 문서는 제품 정본을 바꾸지 않는다. 충돌할 때는
[`../README.md`](../README.md)의 권위 순서를 따른다.

## 지금 확인할 기준

| 항목 | 현재 기준 |
| --- | --- |
| 저장소 | `kimkiumin/Somewhere` |
| 통합 브랜치 | `codex/ipad-board-integration` |
| 전시 모드 구현 기준 커밋 | `67cb03b` (`feat(ios): add offline exhibition journey mode`) |
| 공개 제품명 | `Roll the compass!` |
| 내부 프로젝트·타깃명 | `Somewhere` |
| 주 전시 기기 | 세로형 iPad Pro 11형 2세대 |
| 보조 전시 기기 | 세로형 iPhone 13 |
| 실제 제품 경로 | Release + Core Location + V2 API/Worker |
| 오프라인 전시 경로 | Debug 전용 인프로세스 서비스 + 결정적 위치 재생 |

커밋 SHA는 구현 기준점을 뜻한다. 리뷰할 때는 항상 GitHub의
`codex/ipad-board-integration` 최신 HEAD까지 확인한다.

## 3분 맥락

`Roll the compass!`는 맛집 목록이나 지도를 보여 주는 앱이 아니다. 사용자가
최소 조건을 정하면 검증된 식당 하나를 숨긴 채 확정하고, 이동 중에는 현재
필요한 상대 방향과 대략적인 거리만 보여 준다. 목적지 이름과 주소는 허용된
종료 또는 도착 경로 전까지 공개하지 않는다.

현재 앱에는 서로 목적이 다른 두 실행 경로가 함께 있다.

| 구분 | Debug 전시 빌드 | Release 제품 빌드 |
| --- | --- | --- |
| 목적 | 실내 전시·시연을 끊김 없이 진행 | 실제 서비스와 현장 사용 |
| 시작 설정 | `SOMEWHERE_EXHIBITION_DEMO=YES` | `SOMEWHERE_EXHIBITION_DEMO=NO` |
| 목적지 서비스 | 앱 내부 `ExhibitionJourneyService` | `APIJourneyService`와 V2 Worker |
| 이동 데이터 | 결정적으로 재생되는 검토 경로 | Core Location의 실제 위치·방향 |
| 인터넷 | 없어도 핵심 여정 동작 | 목적지 생성·상태 변경에 필요 |
| GPS | 실내에서 잡히지 않아도 동작 | 실제 안내에는 필요 |
| 코드 경계 | `#if DEBUG` | 전시 서비스가 컴파일되지 않음 |

오프라인 전시 모드는 백엔드를 버린 구현이 아니다. 최신 기능 커밋은
`server/`와 `contracts/`를 변경하지 않았고, Release는 계속 실제 API와
Core Location을 사용한다. Debug 기본값만 전시장에서 안정적으로 시연할 수
있도록 바뀌었다.

## 먼저 읽을 문서

다음 순서를 지킨다.

1. 루트 [`AGENTS.md`](../../AGENTS.md) — 제품·버전 경계
2. [`../README.md`](../README.md) — 문서 권위 순서
3. [`../product/roll-the-compass-ios-requirements.md`](../product/roll-the-compass-ios-requirements.md)
   — 현재 화면과 상호작용 요구사항
4. 이 문서 — 비-Mac 협업과 최신 상태
5. [`../../ios/README.md`](../../ios/README.md) — 소스·빌드·테스트 상세
6. [`native-ios-collaboration-handoff.md`](native-ios-collaboration-handoff.md)
   — Mac/Xcode 실행 명령과 누적 검증 이력

`prototype/`의 v0.1, `app/`의 v0.2 웹앱, 이전 시각 프로토타입 브랜치는
참고 이력이다. 최신 V2 네이티브 앱을 그 코드로 통째로 교체하지 않는다.

## 사용자가 보게 되는 전시 흐름

새로 설치했을 때는 온보딩과 식이·알레르기 프로필 저장을 한 번 거친다.
이후 일반적인 Home Screen 실행은 다음 흐름으로 진행된다.

```text
홈 화면
→ 중앙 나침반으로 시작
→ 숨겨진 식당 하나 확정
→ 빨간 바늘 + 현재 방향 + 남은 거리
→ 멈춤
   ├─ 계속하기 → 안내 재개
   └─ 중단 확정 → 이유 건너뛰기/선택 → 필요 시 공개
→ 경로 재생이 끝나면 도착 판정
→ 식당 이름·주소 공개
```

전시 경로도 실제 `JourneyStore`, 안내 계산, Stop/Continue 상태 전이,
도착·공개 SwiftUI 화면을 통과한다. 단순한 영상이나 화면별 가짜 버튼이
아니다. 네트워크 응답과 실내 GPS 입력만 Debug 전용 결정적 데이터로
대체한다.

## 런타임 데이터 흐름

```text
Debug 일반 실행
  → ExhibitionDemoRuntime
  → ExhibitionJourneyService
  → JourneyStore
  → PhysicalFieldRouteReplay
  → GuidanceEngine / ArrivalGate
  → SwiftUI 화면

Release 실행
  → APIJourneyService ↔ V2 Worker
  → JourneyStore
  → LocationController(Core Location)
  → GuidanceEngine / ArrivalGate
  → SwiftUI 화면
```

UI 테스트는 기존 테스트 의미가 바뀌지 않도록 `--ui-test-*` 인수가 있으면
전시 모드를 자동으로 끈다. 전시 경로 자체를 검증하는 테스트만
`--exhibition-demo`를 명시한다.

## 소스 지도

| 바꾸려는 내용 | 먼저 볼 파일 |
| --- | --- |
| 앱 시작 시 전시/제품 서비스 선택 | `ios/Somewhere/App/SomewhereApp.swift` |
| Debug 전시 상태와 응답 | `ios/Somewhere/Application/ExhibitionJourneyService.swift` |
| 실제 여정 상태 오케스트레이션 | `ios/Somewhere/Application/JourneyStore.swift` |
| 실제 API 연결 | `ios/Somewhere/Networking/APIJourneyService.swift` |
| 실제 위치·방향 | `ios/Somewhere/Platform/LocationController.swift` |
| Debug 위치 재생 | `ios/Somewhere/Platform/SimulatorHeadingReplay.swift` |
| 안내·도착 계산 | `ios/Somewhere/Domain/GuidanceEngine.swift`, `ArrivalGate.swift` |
| 화면 라우팅 | `ios/Somewhere/UI/RootView.swift` |
| 진행 화면과 나침반 | `ios/Somewhere/UI/CompassView.swift`, `SomewhereCompass.swift` |
| 색·간격·버튼 토큰 | `ios/Somewhere/UI/SomewhereStyle.swift` |
| 나침반·폰트·아이콘 | `ios/Somewhere/Resources/` |
| 빌드 설정·타깃·파일 포함 | `ios/project.yml` |
| 네이티브 회귀 테스트 | `ios/SomewhereTests/`, `ios/SomewhereUITests/` |
| 백엔드와 추천 정책 | `server/`, `contracts/` |

`ios/Somewhere.xcodeproj`는 생성물이다. 새 Swift 파일, 리소스, 설정을
추가할 때는 `ios/project.yml`을 수정하고 Mac에서 XcodeGen으로 다시
생성한다. 생성된 프로젝트 파일을 직접 수정하거나 커밋하지 않는다.

## 디자인과 제품에서 지켜야 할 것

- 협업자가 제공한 앤티크 나침반 껍질과 빨간 바늘을 시각 기준으로 유지한다.
- 껍질과 바늘은 별도 에셋이다. 바늘만 실제 상대 방향에 맞춰 회전한다.
- 바늘은 나침반 허브를 중심으로 돌며 원형 껍질 밖으로 벗어나지 않는다.
- 진행 화면은 세로 한 화면 안에서 핵심 안내와 `멈춤`이 보여야 한다.
  걷는 동안 스크롤하는 대시보드로 바꾸지 않는다.
- 진행 중에는 식당 이름, 정확한 주소, 사진, 평점, 리뷰, 후보 목록, 지도,
  경로선을 노출하지 않는다.
- V2에는 진행 중 Reroll이 없다. 먼저 즉시 멈추고, 여정 종료 뒤에만 조건을
  다시 확인해 제한적으로 새 추천을 받을 수 있다.
- 식이 조건과 알레르기는 설정에 저장하고, 예산은 슬라이더로 입력한다.
- 식당만 탐색한다. 이전 `cafe` 계약값은 역사 호환용이지 현재 UI 옵션이
  아니다.
- iPad라고 휴대폰 UI를 작게 띄우지 않는다. 세로 iPad 공간을 쓰되 동일한
  위계와 한 화면 원칙을 유지한다. iPhone 13도 계속 지원한다.
- 화면을 바꿀 때 백엔드, 계약, 추천 알고리즘, Release 센서 경로를 함께
  지우거나 가짜 데이터로 교체하지 않는다.

현재 리뷰용 이미지는 다음에서 바로 볼 수 있다.

- [홈](../assets/roll-compass-vnext-home-2026-08-25.jpg)
- [진행](../assets/roll-compass-vnext-following-2026-08-25.jpg)
- [경로 복구](../assets/roll-compass-vnext-route-recovery-2026-08-25.jpg)
- [도착·공개](../assets/roll-compass-vnext-arrival-2026-08-25.jpg)
- [피드백](../assets/roll-compass-vnext-feedback-2026-08-25.jpg)

## Mac이나 Ubuntu가 없어도 할 수 있는 일

협업자는 GitHub 웹만으로도 문서, SwiftUI 구조, 에셋, 변경 diff를 검토하고
이슈·PR로 디자인 수정 의도를 전달할 수 있다. Windows에서 Git과 편집기를
사용한다면 PowerShell에서 다음처럼 최신 브랜치를 받을 수 있다.

```powershell
git clone https://github.com/kimkiumin/Somewhere.git
cd Somewhere
git fetch origin
git switch --track origin/codex/ipad-board-integration
```

이미 같은 이름의 로컬 브랜치가 있으면 다음을 사용한다.

```powershell
git switch codex/ipad-board-integration
git pull --ff-only
```

Windows에서도 안전하게 할 수 있는 범위:

- GitHub에서 현재 화면 코드와 이미지 에셋 검토
- 문구, 레이아웃 의도, 상태별 시안, 에셋 원본 제안
- Swift·Markdown·TypeScript 소스 수정과 PR 작성
- 변경 전후 기대 화면과 미검증 항목 기록

Windows 로컬만으로 완료했다고 말할 수 없는 범위:

- XcodeGen 결과와 Swift 컴파일
- iOS Simulator UI 동작
- iPhone/iPad 서명·설치·실행
- Core Location, 실제 나침반, CoreBluetooth 실기기 동작
- Ubuntu 전용 최종 릴리스 운영 게이트

이 제한은 협업을 막지 않는다. Draft PR을 만들면 저장소 권한과 Actions
사용량이 허용되는 범위에서 `.github/workflows/ios-ci.yml`의 macOS 빌드·
테스트와 `.github/workflows/v2-ci.yml`의 Ubuntu 저장소 검증이 실행된다.
즉, 협업자 컴퓨터가 Mac이나 Ubuntu일 필요는 없다. 단, GitHub Actions의
통과는 Apple 서명이나 실제 기기 전시 확인을 대신하지 않는다.

화면을 직접 눌러 보려면
[`cross-platform-visual-collaboration.md`](cross-platform-visual-collaboration.md)의
절차를 사용한다. macOS Actions가 실제 Debug 전시 앱을 unsigned ARM64 iOS
Simulator ZIP으로 만들고, Windows 협업자가 Appetize에 수동 업로드해 Home,
Guiding, Stop/Continue, Arrived/Reveal을 브라우저에서 실행할 수 있다. ZIP의
`preview-manifest.json`과 정확한 source SHA를 먼저 확인해야 하며, 이 결과를
Apple 서명·GPS·BLE·실기기 통과로 기록하면 안 된다.

## 비-Mac 협업자의 변경 전달 형식

PR 또는 커밋 설명에 아래 항목을 남긴다. AI가 만든 변경도 동일하다. 시각
변경은 [표준 visual handoff packet](../templates/visual-handoff.md) 또는 GitHub
`Visual handoff` Issue Form을 우선 사용한다.

```text
목적:
참고한 시안/에셋:
영향받는 화면 상태:
수정 파일:
사용자가 눌렀을 때 기대 동작:
유지해야 한 제품 경계:
Windows/GitHub에서 확인한 내용:
Mac/iOS에서 아직 확인하지 못한 내용:
Mac 담당자에게 요청할 테스트:
```

시각 변경은 최소한 홈, 조건, 진행, 멈춤/복구, 도착/공개 중 영향받는 상태를
명시한다. 화면 하나가 좋아 보여도 다른 상태의 나침반, 뒤로가기, Stop,
Dynamic Type을 깨뜨릴 수 있으므로 “진행 화면만 확인”처럼 범위를 숨기지
않는다.

## Mac 담당자에게 넘길 검증 계약

협업자가 직접 실행할 명령이 아니라, PR에 붙여 Mac 담당자에게 요청하는
체크리스트다. 상세 명령은
[`native-ios-collaboration-handoff.md`](native-ios-collaboration-handoff.md)와
[`../../ios/README.md`](../../ios/README.md)에 있다.

1. 정확한 PR/브랜치를 깨끗한 작업 트리에서 체크아웃한다.
2. `ios/project.yml`로 Xcode 프로젝트를 다시 생성한다.
3. 네이티브 소스·현장 흐름 validator를 실행한다.
4. `SomewhereTests`와 영향받는 `JourneyFlowUITests`를 실행한다.
5. Debug 전시 빌드에서 Home Screen 시작, 나침반, 거리, Stop/Continue,
   도착·공개를 확인한다.
6. Release 빌드에서 `SOMEWHERE_EXHIBITION_DEMO=NO`와 실제 API/Core
   Location 경계가 유지되는지 확인한다.
7. 세로 iPad Pro 11형 2세대와 iPhone 13에서 화면 잘림·불필요한 스크롤·
   바늘 축·44pt 터치 영역·Dynamic Type을 확인한다.
8. 실기기 설치가 필요하면 각자 승인된 Apple Team으로 서명한다. 인증서,
   개인키, Team ID, 기기 식별자는 Git에 올리지 않는다.

## 2026-08-26 최신 검증 근거

전시 모드 구현 기준 `67cb03b`에서 다음을 확인했다.

- iOS 단위 테스트: 68 통과, 0 실패
- 전시 전용 Simulator UI 테스트: 1 통과, 0 실패
- 연결된 iPad Pro 11형 2세대(iPadOS 26.6) 전시 UI 테스트: 1 통과,
  0 실패; 시작, 진행 나침반, Stop, Continue를 실제 앱에서 확인
- Release Simulator 빌드: 성공; 번들 설정
  `SomewhereExhibitionDemo = NO` 확인
- iPad 전체 UI 실행: 55개 중 51 통과, 3 의도적 skip, 접근성 스크롤
  자동화 1건 실패; 그 동일 테스트의 단독 재실행은 1/1 통과
- 네이티브 소스·현장 validator와 `git diff --check`: 통과

전체 UI 실행의 단일 실패를 “전체 55개 완전 통과”로 바꾸어 기록하지 않는다.
기능 실패가 아니라 자동화 타이밍으로 판단한 근거는 동일 테스트의 즉시 단독
재실행 통과이며, 다음 전체 매트릭스에서 계속 관찰해야 한다.

전시용 iPad에는 개발 서명 Debug 앱이 설치되어 실제 기기 경로를 검증했다.
iPhone 13은 Simulator 매트릭스가 있고, 협업자 iPhone 13 물리 설치는 아직
별도 단계다. 개발 서명에 사용한 Apple 계정은 앱 로그인이 아니라 설치
신뢰용 서명이다. 인증서를 공유하지 말고 각 기기에서 승인된 방식으로
서명하거나 TestFlight를 사용한다.

## AI 협업자에게 그대로 전달할 문맥

```text
You are contributing to Roll the compass! in kimkiumin/Somewhere.
Work from the latest origin/codex/ipad-board-integration branch. First read
AGENTS.md, docs/README.md,
docs/product/roll-the-compass-ios-requirements.md, and
docs/operations/non-mac-ios-collaboration-handoff.md.

The product hides one evidence-qualified restaurant and shows only minimal
route-relative direction and distance until an allowed reveal. Preserve the
collaborator-approved antique compass shell and separate red needle, the
single-viewport portrait guidance layout, immediate Stop, hidden destination,
restaurant-only flow, profile-based dietary/allergy settings, and budget
slider. Do not add maps, lists, rankings, active Reroll, or early identity.

Do not remove server/, contracts/, APIJourneyService, Core Location, or the
Release path. Checked-in Debug uses SOMEWHERE_EXHIBITION_DEMO=YES only for a
reliable offline exhibition. Release must remain
SOMEWHERE_EXHIBITION_DEMO=NO and use the real API and sensors. Edit
ios/project.yml, never the generated .xcodeproj.

This collaborator is working without macOS/Xcode. Mark native results as
source-only and device-unverified unless GitHub macOS CI or a Mac owner has
actually run them. In every handoff, report intent, affected states, changed
files, preserved boundaries, checks actually run, and the exact Mac/iOS tests
still required. Never invent a passing Xcode, Simulator, or device result.
```

## 완료 정의

협업자의 수정은 코드가 GitHub에 올라간 것만으로 끝나지 않는다. 다음이 모두
기록되어야 한다.

- 어떤 사용자 문제와 어떤 시안을 반영했는지
- 어떤 상태와 파일이 바뀌었는지
- 숨김·Stop·한 화면·Debug/Release 경계를 유지했는지
- 비-Mac 환경에서 실제로 확인한 것과 확인하지 못한 것을 분리했는지
- Mac CI 또는 Mac 담당자의 빌드·테스트 결과
- iPad/iPhone 실기기 확인이 필요한지

Apple 배포 권한, 실제 서비스 도메인, 제공자 권리, 법률 검토처럼 저장소 밖의
승인이 필요한 항목은 코드로 임의 해결하거나 `PASS`로 기록하지 않는다.
