# 보드 작업, 여기서 시작하면 돼요

Windows에서 AI와 함께 원형 LCD를 이어서 만드는 사람을 위한 짧은 안내다.
모든 문서를 외우거나 명령을 전부 실행할 필요는 없다. **하려는 변경에 해당하는
부분만 고르고, 결과를 실물에서 확인**하면 된다.

## 먼저 알아둘 현재 상태

이 보드는 ESP32-S3-Touch-LCD-2.1 평면형이다. 검정 원형 화면에 초록색 거리·메뉴·가격,
회전하는 동서남북, 터치로 바꾸는 5종 바늘이 있다. BOOT는 화면 켜기/끄기,
RST는 재시작이다.

전원을 넣으면 센서 없이도 움직이는 **독립 데모**가 나온다. `320 m / TONKATSU`는
협업자 시안의 예시 값이며 실제 위치가 아니다. 실제 앱 상태를 받으면 이 값이
바뀌지만, 보드 자체의 방향 센서는 아직 코드에 연결하지 않아 실사용 바늘은 숨겨진다.
센서가 없는데 보정 완료 상태로 바꾸는 것은 센서 연동을 끝낸 것이 아니다.

최근 개선은 선의 불필요한 전체 화면 갱신 감소, 한글 표시 보강, 긴 문구의
픽셀 너비 기준 줄임표다. 새 버전 부팅 로그는 `display_revision=fitted-text-v2`다.
**GitHub에 올라온 코드가 이미 넘겨받은 보드에 자동으로 깔리지는 않는다.**
화면 왼쪽 지글거림의 실제 해결 여부도 아직 실물 확인이 필요하다.

세 단어만 구분하면 작업이 쉬워진다.

- **소스**: GitHub에서 가져오는 수정 가능한 코드.
- **컴파일**: 소스를 보드가 실행할 파일로 만드는 것. 보드는 아직 바뀌지 않는다.
- **업로드/플래시**: 실행 파일을 USB로 보드에 쓰는 것. 이때 실제 화면이 바뀐다.

## 무엇을 바꾸려는지에 따라 파일 찾기

| 하고 싶은 일 | 먼저 볼 파일 | 확인할 점 |
| --- | --- | --- |
| 색/글자 위치/터치 연결 변경 | `firmware/roll-compass-board/display_ui.cpp`, `compass_layout.h` | 480×480 원 안에 들어가는지, 터치 버튼을 가리지 않는지 |
| 바늘 모양 변경 | `needle_styles.cpp`, `needle_styles.h` | 중심/길이와 5종 터치 순환 유지 |
| 회전/방위 계산 수정 | `compass_math.cpp`, `compass_runtime.cpp` | 편각과 회전 부호, 센서 불신 시 숨김 |
| 데모 각도/움직임 수정 | `compass_diagnostics.cpp` | 데모와 실제 BLE 상태 구분 |
| 한글 메뉴가 `ON PHONE`으로 나옴 | `font-text.txt`, `instrument_text.cpp` | 아래 폰트 작업 방법 사용 |
| 화면 지글거림 확인 | [화면 진단 절차](board-display-handoff.md#협업자가-실물에서-비교할-방법), `instrument_line.h` | 정지/회전 비교, 이전 위치 잔상, 화면 전체 무효화 여부 |
| Windows 빌드/연결 실패 | `scripts/firmware/windows-board.mjs`, `.ps1` | 명령 전체와 오류 마지막 부분, COM 포트 확인 |
| 앱과 값이 다름 | `physical_compass_wire.*`, `compass_runtime.*` | BLE v2 `d`, `m[0]`, `p`, `tb`, `md` 확인 |

파일 경로를 생략한 행도 `firmware/roll-compass-board/` 안에 있다.
`lvgl_v8_port.cpp`는 패널 전송/버퍼 동기화 코드라 화면 디자인 수정에 보통 필요 없다.
원본 시안 `compass_artwork.h`와 원본 폰트 헤더도 일반 문구 변경 때는 건드릴 필요 없다.

## Windows에서 코드 받고 확인하기

Git, Bun 1.3.14, Arduino CLI 1.5.1 설치와 최초 clone은
[Windows 설치 안내](windows-collaboration-handoff.md#starting-on-windows)에 있다.
이미 저장소가 있다면 PowerShell에서 그 폴더로 이동해 아래 정도면 된다.

```powershell
git status
git fetch origin
git switch codex/roll-compass-native-app
git pull --ff-only
bun install --frozen-lockfile
bun run verify:windows
```

`git status`에 아직 저장하지 않은 변경이 나오거나 `pull --ff-only`가 거절되면,
AI에게 현재 변경과 브랜치 차이를 먼저 보여 달라고 하면 된다. 기존 작업을 지우거나
강제로 원격을 덮을 필요는 없다. 로컬 브랜치가 없으면
`git switch --track origin/codex/roll-compass-native-app`으로 한 번 만든다.

보드 도구 최초 설정 후 컴파일/업로드는 다음과 같다.

```powershell
.\scripts\firmware\windows-board.ps1 setup
.\scripts\firmware\windows-board.ps1 compile
.\scripts\firmware\windows-board.ps1 ports
.\scripts\firmware\windows-board.ps1 upload -Port COM7
.\scripts\firmware\windows-board.ps1 monitor -Port COM7
```

`setup`은 최초 설치나 도구 버전을 바꿀 때만 필요하다. `COM7`은 예시이므로
`ports`에 나온 내 보드 포트로 바꾼다. PowerShell 실행 정책 때문에 `.ps1`이
막히면 같은 기능의 Bun 명령을 직접 실행할 수 있다.

```powershell
bun scripts/firmware/windows-board.mjs upload --port COM7
```

업로드 뒤 자동 재시작한다. 화면이 바뀌었는지, 탭으로 바늘이 바뀌는지, BOOT가
바로 반응하는지 본다. 컴파일 성공과 화면 품질 확인은 서로 다른 결과다.

## 한글이나 긴 메뉴를 다루는 방법

앱/서버의 한글을 임의로 영문 메뉴로 바꾸지 않아도 된다.

- 원본 ASCII 시안은 원본 폰트를 쓴다.
- `font-text.txt`에 적힌 문구의 한글과 ASCII 숫자·기호는 한글 폰트에 들어 있다.
- 그 외 글자가 필요한 값은 `ON PHONE`으로 표시한다. 뜻은 “이 값은 휴대폰에서
  확인”이며, 메뉴 번역이나 목적지 이름이 아니다. BLE 원본은 그대로다.
- 긴 값은 실제 폰트 너비에 맞춰 `...`로 줄인다. 표시 영역은 스크롤하지 않는다.

예를 들어 새 메뉴 `매콤한 국수`를 써야 한다면:

1. `firmware/roll-compass-board/font-text.txt`에 그 문구를 한 줄 추가한다.
2. 저장소 루트에서 아래 명령을 실행한다. Windows/macOS에서 같고 Python/WSL은 필요 없다.

```powershell
bun run firmware:fonts
.\scripts\firmware\windows-board.ps1 compile
```

`firmware:fonts`는 필요한 원본 폰트를 검증해 내려받고, 글리프를 생성하고,
Windows 업로드 도구가 복원하는 `generated-assets-v1.br`까지 갱신한다.
첫 다운로드는 인터넷이 필요하다. 보통 커밋할 것은 **문구 파일과 바뀐 `.br` 번들**이다.
생성된 `.c` 파일은 무시 파일이므로 수작업 수정/강제 추가하지 않아도 된다.
`git diff --stat`에서 문구와 번들 변경을 확인한 뒤 컴파일 성공과 실물 표시 결과를 남긴다.

실수로 문구를 추가하고 번들을 빼먹으면 Windows가 이전 폰트를 복원할 수 있다.
이를 잡기 위해 Windows CI가 폰트를 실제로 재생성하고 커밋된 번들과 비교한다.

## 협업 AI에게 그대로 전달할 시작 문장

아래 마지막 줄에 원하는 변경을 적어 사용하면 된다. 이것은 작업 설명 예시이며
프로젝트 소유자의 최신 지시를 대신하는 규칙은 아니다.

```text
이 저장소의 원형 LCD 보드 작업을 이어서 해줘. 나는 Windows에서 작업한다.
먼저 git status와 현재 브랜치를 확인하고, 사용자 변경을 보존해줘.
docs/operations/board-collaborator-start-here.md를 읽고,
필요한 규격은 board-display-handoff.md와 windows-collaboration-handoff.md에서 확인해줘.
보드 브랜치는 codex/roll-compass-native-app다.
BLE v2, 원형 시안, 5종 바늘, BOOT, 실제 센서가 없는 현재 상태를 이해한 뒤 수정해줘.
시안 소스인 codex/full-blueprint를 통째로 merge하지 말아줘.
어느 파일을 왜 바꿨는지 쉬운 말로 설명하고, 변경에 맞는 검증을 실행해줘.
실기기를 보지 못했다면 화면 확인을 했다고 말하지 말고 다음 사람이 확인할 항목을 남겨줘.
내가 원하는 이번 변경: [여기에 적기]
```

## 작업을 마치고 남기면 좋은 짧은 메모

```text
무엇이 달라졌는지:
변경 파일:
실행해서 통과한 검증:
실물 업로드/관찰 여부:
커밋 SHA와 브랜치:
남은 문제나 다음에 확인할 것:
```

세부 규격은 [보드 인수인계](board-display-handoff.md), BLE 필드는
[연결 문서](physical-compass-ble.md), iOS/서버 작업 범위는
[Windows 전체 인수인계](windows-collaboration-handoff.md)를 참고하면 된다.
