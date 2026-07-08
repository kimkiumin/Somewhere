# Prompt Library

생성일: 2026-07-07  
상태: v0.1

이 문서는 GPT, 브라우저 AI, Codex에 반복해서 사용할 프롬프트 모음이다.

## 1. 컨셉 정리 프롬프트

```text
내 제품 컨셉을 다음 기준으로 다시 정리해줘.

핵심 UX:
사용자는 목적지를 모르지만, 제품/앱이 주는 방향 단서를 따라가며 낯선 장소를 발견한다.

정리 형식:
1. 한 문장 컨셉
2. 3문장 설명
3. 사용자 가치
4. 제품이 아닌 것
5. 현재 확정할 것
6. 아직 보류할 것

단, 이 제품을 일반 지도 앱이나 맛집 추천 앱처럼 설명하지 마.
```

## 2. 비판 프롬프트

```text
너는 제품기획팀장이다.
이 제품 아이디어를 무조건 칭찬하지 말고, 회사 관점에서 가장 강하게 비판해줘.

제품 핵심 UX:
목적지를 모르는 상태에서 방향 단서만 따라가고, 도착 후 장소를 발견한다.

비판 기준:
- 앱으로 대체될 가능성
- 하드웨어 필요성
- 반복 사용성
- 안전 리스크
- 추천 실패 리스크
- 사업성
- 사용자가 실제로 원하는지

마지막에는 보류/수정/추진 중 어떤 판단이 적절한지 조건부로 정리해줘.
```

## 3. 가설 분해 프롬프트

```text
이 솔루션이 성립하려면 어떤 사용자 욕구와 행동 가설이 참이어야 하는지 분해해줘.

출력 형식:
| 가설 | 위험도 | 틀리면 생기는 문제 | 검증 방법 | 우선순위 |

핵심 UX:
목적지를 모르지만 제품/앱을 따라 목적지를 향해 가는 모험.
```

## 4. 확정/보류 판단 프롬프트

```text
현재 단계에서 확정해야 할 요소와 아직 보류해야 할 요소를 나눠줘.

기준:
- 지금 확정하지 않으면 리서치가 흔들리는 것
- 지금 확정하면 가능성을 좁혀버리는 것
- 사용자 판단이 필요한 것
- 프로토타입으로 검증해야 할 것

제품 핵심 UX:
목적지를 모르는 상태에서 방향 단서만 따라가는 탐험.
```

## 5. 경쟁 리서치 프롬프트

```text
2024-2026년 기준으로 ‘목적지를 숨기고 사용자가 방향 단서만 따라가며 장소를 발견하는 경험’과 유사한 제품/앱/서비스를 조사해줘.

범주:
1. compass navigation hardware
2. random destination / mystery travel app
3. geocaching / treasure hunt platform
4. local discovery / hidden place curation service
5. screenless or low-screen navigation product
6. mainstream place recommendation app

각 사례마다:
- 제품/서비스명
- 핵심 UX
- 목적지를 숨기는가?
- 물리적 이동 경험이 있는가?
- 앱으로 충분한가, 하드웨어 가치가 있는가?
- 반복 사용 이유
- 실패 요인 또는 리스크
- 수익 모델
- 내 제품 컨셉에 주는 시사점

출처를 반드시 달고, 홍보 문구와 실제 UX를 구분해줘.
```

## 6. 사용자 시나리오 프롬프트

```text
아래 제품 컨셉에 대해 4가지 사용 시나리오를 작성해줘.

제품 컨셉:
사용자는 목적지를 모르지만, 제품/앱이 주는 방향 단서를 따라가며 낯선 장소를 발견한다.

시나리오:
1. 혼자 산책
2. 데이트
3. 여행
4. 친구들과 즉흥 탐험

각 시나리오마다:
- 상황
- 사용 흐름
- 기대 가치
- 불안/리스크
- 필요한 안전장치
- 프로토타입에서 검증할 질문

주의:
실제 사용자 조사처럼 쓰지 말고, 가설 기반 시나리오라고 명시해.
```

## 7. 디자인 원칙 프롬프트

```text
이 제품이 일반 지도 앱이나 맛집 추천 앱으로 변질되지 않도록 디자인 원칙을 세워줘.

핵심 UX:
목적지를 숨긴 채 방향 단서만 따라가고, 도착 후 장소를 발견한다.

각 원칙마다:
- 원칙 이름
- 설명
- 해야 할 것
- 하지 말아야 할 것
- 판단 질문
```

## 8. Codex 구현 프롬프트

```text
Read docs/project_brief.md and docs/prototype_spec.md.

Build the first mobile-first web prototype in /prototype for a hidden-destination compass adventure UX.

Core flow:
1. User presses “Start Adventure”
2. App selects one hidden destination from mock data
3. Destination name is hidden
4. User sees only a compass arrow, approximate distance, hint, and subtle status text
5. User can tap “Reveal”, “Give Up”, or “Reroll”
6. Movement is simulated with a “Move closer” button
7. When close enough, the destination can be revealed

Do not add maps, real GPS, real APIs, user accounts, reviews, or recommendation algorithms.
Keep the UI minimal and low-screen.
Document the implemented states in docs/prototype_notes.md.
```

## 9. 프로토타입 리뷰 프롬프트

```text
아래 프로토타입 설명을 보고, 이 프로토타입이 핵심 UX를 제대로 검증하는지 평가해줘.

핵심 UX:
목적지를 모르지만 방향 단서만 따라가고, 도착 후 목적지를 발견한다.

평가 기준:
1. 목적지 숨김이 유지되는가?
2. 지도 앱처럼 변하지 않았는가?
3. 안전장치가 충분한가?
4. 사용자가 다음 행동을 이해할 수 있는가?
5. 공개 순간이 보상처럼 느껴지는가?
6. 하드웨어 필요성을 비교할 여지가 있는가?

출력:
- 잘 된 점
- 빠진 점
- 불필요한 점
- 다음 수정 요청문
```
