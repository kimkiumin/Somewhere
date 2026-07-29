# Somewhere V2

Somewhere는 사용자가 정한 최소 조건 안에서 검증된 목적지 하나를
숨긴 채 확정하고, 후보 비교 대신 출발하게 만드는 모바일 서비스입니다.
지도나 후보 목록이 아니라 조용한 나침반과 대략적인 거리만 전면에 둡니다.

```text
최소 조건 → 숨겨진 목적지 하나 → 명시적 확정 → 경로 기반 안내
→ 도착 → 공개 → 60분 뒤 선택적 반응
```

## 현재 구현

- 모바일 전용 V2 웹앱과 실제 Cloudflare Workers 백엔드
- 익명 세션, CSRF/Origin/Host 검증, 요청 순서와 멱등성 경계
- D1, SQLite Durable Objects, Queues/DLQ/Cron, Static Assets
- 서버가 소유하는 숨겨진 목적지와 목적지 정체를 노출하지 않는 응답
- 유효한 보행 경로 기하가 있을 때만 나타나는 방향 안내
- 즉시 `Stop`, 명시적 중단 확정, 제한된 복구, 도착 래치
- 도착 60분 뒤 한 번만 쓸 수 있는 개인정보 최소화 피드백
- 프로덕션·테스트 하네스·현장 진단 빌드의 분리

현재 저장소 검증은 Ubuntu에서 자동화 가능한 범위까지 완료하는 것을
목표로 합니다. 공개 출시는 별도입니다. Cloudflare 운영 권한과 도메인,
장소·보행 경로 제공자 권리/쿼터, 한국 개인정보·위치정보 전문 검토,
Study A 기반 RC 정책, 동일 빌드의 iPhone 15 Pro Max 실기기 4회,
네이티브 배포가 필요하면 macOS/Xcode/서명 증거가 모두 있어야 합니다.
없는 증거는 `PASS`로 추정하지 않고 `BLOCK`으로 기록합니다.

## 제품 경계

- 목적지는 한 번에 하나만 선택하며 이름·주소·사진·리뷰·평점은 기본적으로
  숨깁니다.
- `목적지 확인`은 안전을 위한 독립 동작이며 안내를 끝내지 않습니다.
- 진행 중 활성 Reroll, 후보 목록, 순위, 검색, 지도 중심 UI는 없습니다.
- 목적지 직선 방위 fallback은 없습니다. 경로·위치·방향 신뢰도가 깨지면
  화살표를 즉시 숨깁니다.
- 잠금 화면이나 백그라운드 내비게이션을 약속하지 않습니다.
- 넓은 화면에서도 소비자 제품은 가운데 놓인 하나의 휴대폰 캔버스입니다.

정본 우선순위와 역사 문서는 [문서 권위 인덱스](docs/README.md),
기계 판독 기준은 [V2 권위 맵](docs/authority-map-v2.json)을 따릅니다.
제품 청사진은 [BLUEPRINT.md](BLUEPRINT.md), 운영 방법은
[V2 릴리스 런북](docs/operations/v2-release.md)에 있습니다.

## 저장소

```text
app/                 모바일 V2 TypeScript/Vite PWA와 브라우저 QA
contracts/           wire·정책·스키마 계약
server/              Cloudflare Worker와 D1/DO/Queue 구현
scripts/operations/  로컬 운영·복구·비용 검증
scripts/release/     정확 트리 준비와 F1–F4 릴리스 증거 도구
prototype/           동결된 v0.1 시뮬레이션
docs/                정본·운영·역사 문서
```

## Ubuntu 검증

Bun 1.3.14와 Node 24가 기준입니다.

```bash
bun install --frozen-lockfile
bunx playwright install --with-deps chromium webkit
bun run verify:release
```

`verify:v2`는 기존 v0.1 회귀, 앱·계약·서버·운영 검증, 타입과 린트를
실행합니다. `verify:release`는 여기에 릴리스 스키마·레지스트리·문서 연결과
실패 폐쇄 동작을 더하는 상위 명령입니다. 일상 검증에는 `verify:v2`, 최종
검증에는 `verify:release` 하나만 실행하면 됩니다. 배포는 자동으로 수행하지
않습니다.

로컬 백엔드와 현장 QA 절차는
[V2 파일럿 백엔드](docs/operations/v2-pilot-backend.md)와
[V2 릴리스 런북](docs/operations/v2-release.md)을 사용하십시오.

## 비용 원칙

Cloudflare는 Free-first 파일럿의 운영 대상이지 영구 무료 보장이 아닙니다.
운영 정책의 50%에서 경고하고 80%에서 신규 여정 admission을 닫습니다.
정확한 한도와 가격은 배포 시점의 Cloudflare 공식 대시보드·문서로 다시
확인해야 하며, 저장소는 고정 0원이나 한국 리전을 주장하지 않습니다.

## 역사

`prototype/`은 11개 회귀 테스트를 가진 v0.1 시뮬레이션입니다. 이전
v0.2 센서 PWA와 Reroll/Give Up 문서는 설계 이력으로 보존되지만 V2 요구가
아닙니다. 역사 문서를 현재 제품 계약처럼 다시 쓰지 마십시오.
