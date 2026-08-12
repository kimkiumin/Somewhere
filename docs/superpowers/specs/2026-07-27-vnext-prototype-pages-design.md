# Somewhere vNext 프로토타입 GitHub Pages 배포 설계

Status: 사용자 승인 설계 — 문서 최종 확인 대기

Date: 2026-07-27

## 목적

완성된 Somewhere vNext 저충실도 시퀀스 프로토타입을 GitHub에서 링크 하나로 실행할 수 있게 한다. 공개 사이트에는 `prototype/vnext/`의 정적 파일만 포함하고, 청사진·검증 자료·테스트·기존 v0.1 프로토타입과 섞이지 않게 한다.

이 배포는 프로토타입 접근성을 위한 것이다. 실제 앱, 운영 서비스, 추천 품질, 위치·경로 데이터, iOS, BLE 또는 물리 제품의 구현·배포를 의미하지 않는다.

## 승인된 방식

GitHub Pages의 사용자 지정 GitHub Actions 워크플로를 사용한다.

- 원본 저장소: `kimkiumin/Somewhere`
- 공개 저장소: `kimkiumin/Somewhere-wireframe-sequence`
- 배포 소스 브랜치: `codex/vnext-sequence-prototype`
- 배포 입력 폴더: `prototype/vnext/`
- 공개 주소: `https://kimkiumin.github.io/Somewhere-wireframe-sequence/`
- Pages 빌드 방식: `workflow`
- Pages 환경: `github-pages`

원본 저장소의 `prototype/vnext/`만 공개 저장소의 루트로 분리해 게시한다. 과거 v0.1 앱과 저장소, Pages origin, 브라우저 캐시, 서비스 워커 범위를 공유하지 않는다.

## 저장소 경계

추가할 워크플로:

```text
.github/workflows/vnext-prototype-pages.yml
```

배포 대상:

```text
prototype/vnext/
  index.html
  style.css
  state.js
  screens.js
  controller.js
  app.js
```

배포하지 않는 항목:

- `prototype/vnext/*.test.js`
- `prototype/vnext/README.md`
- 기존 `prototype/` v0.1 파일
- `docs/`, `research/`, `hardware/`, `navigation/`, `recommendation/`
- 저장소 설정, Git 이력, 작업 보고서와 로컬 비밀 정보

Pages artifact를 만들기 전에 전용 임시 staging 디렉터리에 실행 파일 여섯 개만 복사한다. `prototype/vnext/` 안에 테스트나 README가 함께 존재하더라도 공개 artifact에는 포함되지 않게 허용 목록 방식으로 고정한다.

공개 artifact 구조는 다음과 같다.

```text
wireframe-sequence/
  index.html
  style.css
  state.js
  screens.js
  controller.js
  app.js
```

## 프로토타입 표시

GitHub에서 다음 세 위치가 이 결과물이 프로토타입임을 명시한다.

1. Pages 워크플로 이름: `Prototype — vNext Sequence`
2. 브라우저 문서 제목: `Somewhere vNext 시퀀스 프로토타입`
3. `prototype/vnext/README.md`의 첫 설명과 공개 URL

제품 화면 안에는 새로운 배지나 장식 요소를 넣지 않는다. 제품 캔버스와 별도로 존재하는 현재 `프로토타입 제어 — 실제 앱 UI 아님` 표시를 유지한다.

## 워크플로

공식 GitHub Pages Actions 구성을 사용한다.

1. `actions/checkout@v6`
2. 실행 파일 허용 목록을 임시 `_site` 디렉터리로 복사
3. `actions/configure-pages@v5`
4. `actions/upload-pages-artifact@v4`로 `_site`만 업로드
5. `actions/deploy-pages@v4`로 `github-pages` 환경에 배포

필요 권한:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

배포 job은 `github-pages` 환경과 배포 결과 URL을 사용한다. 동시에 여러 배포가 실행되면 최신 변경만 남도록 Pages 전용 concurrency group을 사용한다.

## 실행 조건

자동 배포는 다음 조건을 모두 만족할 때 실행한다.

- `codex/vnext-sequence-prototype` 브랜치에 push
- `prototype/vnext/`의 실행 파일 또는 Pages 워크플로가 변경됨

수동 재배포를 위해 `workflow_dispatch`도 제공한다. 문서나 다른 프로젝트 파일만 변경될 때는 Pages 배포가 실행되지 않는다.

## GitHub 설정

현재 Pages 사이트가 생성되어 있지 않으므로, 워크플로를 푸시한 뒤 GitHub Pages의 `build_type`을 `workflow`로 생성한다. 이 작업은 GitHub REST API 또는 저장소 설정 화면에서 수행할 수 있다.

권한이나 요금제 때문에 Pages 사이트 생성이 거부되면 임의의 다른 호스팅으로 전환하지 않는다. 오류와 필요한 사용자 조치를 보고하고 배포 워크플로는 보존한다.

## 실패 처리

- 허용 목록의 실행 파일이 하나라도 없으면 artifact를 만들지 않고 실패한다.
- 테스트가 실패하면 배포하지 않는다.
- Pages 설정 생성이 실패하면 반복 변경이나 권한 우회를 하지 않는다.
- 배포가 실패하면 Actions run 로그에서 실패 단계를 확인하고 같은 브랜치에서 수정한다.
- 공개 URL이 200이어도 제목, CSS, JavaScript 또는 한글이 깨지면 성공으로 처리하지 않는다.

## 검증

푸시 전:

- `npm.cmd run verify`
- workflow YAML의 trigger, permissions, environment, artifact path 확인
- artifact staging 결과가 실행 파일 여섯 개만 포함하는지 확인
- `git diff --check`

푸시 후:

- GitHub Actions run이 성공했는지 확인
- GitHub Pages API가 `build_type: workflow`과 공개 URL을 반환하는지 확인
- 공개 URL이 HTTP 200을 반환하는지 확인
- 문서 제목이 `Somewhere vNext 시퀀스 프로토타입`인지 확인
- CSS와 JavaScript가 200으로 로드되는지 확인
- 첫 화면과 한 단계 이상의 상호작용이 동작하는지 브라우저에서 확인
- 브라우저 콘솔 오류가 없는지 확인
- 공개 사이트에서 테스트·README·기존 v0.1 파일 URL이 404인지 확인

## GitHub 맥락 정리

기존 초안 PR `#1`에 다음을 추가한다.

- Pages 공개 URL
- Pages에는 프로토타입 실행 파일만 배포된다는 설명
- 프로토타입과 실제 제품 구현의 범위 차이
- 배포 검증 결과

PR은 계속 초안으로 유지하며 자동 병합하지 않는다.

## 공식 근거

확인일: 2026-07-27

- GitHub Docs, `Using custom workflows with GitHub Pages`: `configure-pages`, `upload-pages-artifact`, `deploy-pages`, Pages 권한과 환경 구성.
  - https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Docs, `REST API endpoints for GitHub Pages`: Pages 사이트 생성 시 `build_type: workflow` 사용.
  - https://docs.github.com/en/rest/pages/pages?apiVersion=2026-03-10

## 범위 밖

- 사용자 지정 도메인
- 별도 프로토타입 저장소
- Pages 외 호스팅 서비스
- 실제 위치·장소·경로 API
- 분석 도구, 계정, 데이터 수집
- 운영용 캐시·보안 헤더·서비스 워커
- 시각 디자인 변경
