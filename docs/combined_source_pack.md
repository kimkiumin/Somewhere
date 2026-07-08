# Blind Compass Discovery — GPT Project Source Pack v0.1

생성일: 2026-07-07

이 파일은 개별 Markdown 문서를 하나로 합친 버전이다. ChatGPT 프로젝트에 소스를 적게 넣고 싶을 때 사용한다.



---

# File: 00_README_UPLOAD_GUIDE.md

# GPT Project Source Pack v0.1 — Blind Compass Discovery

생성일: 2026-07-07

이 폴더는 ChatGPT 프로젝트에 소스로 넣기 위한 기획 문서 세트다.  
현재 목적은 최종 제품을 확정하는 것이 아니라, **검증 가능한 컨셉 v0.1**을 고정하는 것이다.

## 사용 방법

1. ChatGPT 프로젝트를 새로 만든다.
2. 이 폴더의 `.md` 파일들을 프로젝트 소스로 업로드한다.
3. `11_GPT_PROJECT_INSTRUCTIONS.md`의 내용을 프로젝트 지침에 붙여 넣는다.
4. 기존 평가 PDF도 같은 프로젝트 소스로 함께 넣는다.
5. 이후 GPT에게 문서 업데이트를 시킬 때는 항상 `04_DECISION_LOG.md`와 `05_OPEN_QUESTIONS.md`를 갱신하게 한다.

## 파일 구성

| 파일 | 목적 |
|---|---|
| `01_PROJECT_BRIEF.md` | 프로젝트 전체 요약 |
| `02_CORE_UX.md` | 핵심 UX 정의와 플로우 |
| `03_ASSUMPTION_LOG.md` | 검증해야 할 가설 목록 |
| `04_DECISION_LOG.md` | 지금까지의 결정 기록 |
| `05_OPEN_QUESTIONS.md` | 사용자의 판단이 필요한 질문 |
| `06_RESEARCH_PLAN.md` | 리서치 흐름 |
| `07_COMPETITOR_RESEARCH_BRIEF.md` | 경쟁/유사 사례 조사 틀 |
| `08_USER_SCENARIOS.md` | 가설 기반 사용 시나리오 |
| `09_DESIGN_PRINCIPLES.md` | 디자인 원칙 |
| `10_PROTOTYPE_SPEC_FOR_CODEX.md` | Codex 구현용 프로토타입 명세 |
| `11_GPT_PROJECT_INSTRUCTIONS.md` | GPT 프로젝트 지침용 문서 |
| `12_CODEX_HANDOFF_AGENTS.md` | Codex/AGENTS.md용 지침 |
| `13_PROMPT_LIBRARY.md` | 반복 사용할 프롬프트 모음 |
| `14_SOURCE_BASIS.md` | 어떤 근거에서 작성했는지 정리 |

## 현재 컨셉 요약

> 사용자는 목적지를 모르지만, 제품/앱이 주는 최소한의 방향 단서를 따라가며 낯선 장소를 발견한다.

## 현재 고정한 것

- 핵심 UX는 “목적지를 모르지만 따라가는 모험”이다.
- 목적지는 식당에 한정하지 않는다.
- 지도 앱을 더 효율적으로 대체하는 제품이 아니라, 오프스크린 탐험 경험을 만드는 제품이다.
- 하드웨어 여부, 폼팩터, 목적지 카테고리, 추천 알고리즘은 아직 확정하지 않는다.

## 주의

이 문서들은 **v0.1 초안**이다.  
사용자의 판단이 필요한 부분은 `05_OPEN_QUESTIONS.md`에 따로 모았다.


---

# File: 01_PROJECT_BRIEF.md

# Project Brief — Blind Compass Discovery

생성일: 2026-07-07  
상태: v0.1 / 검증 전 컨셉 가설

## 1. 임시 제품명

**Blind Compass Discovery**

대체 후보:
- Hidden Destination Compass
- Unknown Route
- Follow the Unknown
- Blind Compass
- Wonder Compass
- Local Quest

> 사용자 결정 필요: 최종 이름은 아직 확정하지 않는다.

## 2. 한 문장 컨셉

사용자는 목적지를 모르지만, 제품/앱이 주는 최소한의 방향 단서를 따라가며 낯선 장소를 발견한다.

## 3. 제품의 본질

이 제품은 **더 좋은 장소 추천 앱**이 아니다.  
이 제품은 **목적지를 숨기고, 이동 과정을 탐험으로 바꾸는 오프스크린 발견 경험**이다.

## 4. 핵심 UX

> 목적지를 모르지만 제품/앱을 따라 목적지를 향해 가는 모험.

기본 흐름:

1. 사용자가 탐험을 시작한다.
2. 제품/앱이 목적지를 선택한다.
3. 목적지 이름과 상세 정보는 숨겨진다.
4. 사용자는 방향, 거리감, 진동, 상태 문구 등 최소 단서만 받는다.
5. 사용자는 목적지를 모른 채 이동한다.
6. 도착하거나 사용자가 원할 때 목적지가 공개된다.
7. 사용자는 저장, 평가, 다시 탐험하기를 선택한다.

## 5. 현재 확정한 범위

### 확정

- 목적지는 처음에 숨긴다.
- 사용자는 최소한의 방향 단서를 따라간다.
- 이동 과정 자체가 경험 가치다.
- 목적지는 식당에 한정하지 않는다.
- 이 제품은 효율보다 발견감, 기대감, 오프스크린 경험을 우선한다.

### 보류

- 별도 하드웨어가 반드시 필요한지
- 앱 단독 MVP로 충분한지
- 목적지 카테고리를 어디까지 열지
- 실제 추천 알고리즘
- 제품 폼팩터
- 수익 모델
- 브랜드 톤
- 가격대
- 실사용 지역

## 6. 문제 가설

이 솔루션이 성립하려면 다음 욕구가 참이어야 한다.

1. 사람들은 가끔 목적지를 모르는 이동을 불안보다 재미로 받아들일 수 있다.
2. 사람들은 지도 앱을 계속 보는 이동 경험에서 피로감이나 무미건조함을 느낄 수 있다.
3. 사람들은 결과뿐 아니라 과정의 우연성과 기대감을 소비할 수 있다.
4. 안전장치가 있으면 목적지 미공개 상태를 수용할 수 있다.
5. 물리적 디바이스 또는 최소 화면 UX가 경험의 특별함을 높일 수 있다.

## 7. 주요 사용 상황 가설

우선순위 높은 상황:

- 낯선 동네 산책
- 여행 중 빈 시간
- 데이트 코스
- 친구와 즉흥 탐험
- 로컬 상점/카페/작은 전시 발견
- 관광지의 숨은 장소 탐방

우선순위 낮은 상황:

- 급하게 식사를 해결해야 하는 상황
- 목적지가 명확한 이동
- 실패 비용이 큰 약속 전후
- 가격, 웨이팅, 알레르기 등 통제가 강하게 필요한 상황

## 8. 제품이 해결하려는 것

이 제품은 다음을 직접 해결하려고 한다.

- 선택지 과잉으로 인한 결정 피로
- 지도 앱 중심 이동의 스크린 의존
- 낯선 장소를 스스로 발견하는 감각의 약화
- 여행/산책/데이트에서 즉흥성과 기대감 부족

## 9. 제품이 해결하지 않으려는 것

이 제품은 다음을 1차 목표로 삼지 않는다.

- 가장 빠른 길 안내
- 가장 평점 높은 장소 추천
- 예약/웨이팅 최적화
- 정확한 맛집 랭킹
- 기존 지도 앱의 완전 대체

## 10. 핵심 차별점

기존 지도/추천 서비스가 “어디가 좋은지 알려주는 것”에 가깝다면, 이 제품은 “어디인지 모른 채 따라가게 만드는 것”에 가깝다.

즉 차별점은 추천 정확도보다 **목적지 숨김 + 방향 단서 + 이동 과정의 호기심**에 있다.


---

# File: 02_CORE_UX.md

# Core UX — Hidden Destination Adventure

생성일: 2026-07-07  
상태: v0.1

## 1. 핵심 UX 정의

> 목적지를 모르지만 제품/앱을 따라 목적지를 향해 가는 모험.

이 UX에서 가장 중요한 것은 목적지 정보가 아니라 **따라가는 과정**이다.  
사용자는 “어디로 가는지”보다 “어떤 방향으로 가야 하는지”만 안다.

## 2. UX의 핵심 감정

- 맡김
- 호기심
- 약간의 긴장감
- 안전한 불확실성
- 발견감
- 회고하고 싶은 작은 사건

## 3. UX 플로우

```text
Start
→ Destination Hidden
→ Follow Direction
→ Approach
→ Arrive
→ Reveal
→ Save / Rate / Restart
```

## 4. 단계별 설명

### 1. Start — 맡기기

사용자가 버튼을 누른다.

사용자 심리:
- “이번엔 어디로 데려갈까?”
- “내가 고르지 않아도 된다.”
- “너무 멀거나 위험하지는 않겠지?”

필요 기능:
- 시작 버튼
- 탐험 조건 설정
- 거리 범위
- 카테고리 범위
- 안전 조건

### 2. Destination Hidden — 숨김 추천

제품/앱이 목적지를 선택하지만 이름은 숨긴다.

보여주면 안 되는 것:
- 장소명
- 정확한 주소
- 사진
- 리뷰
- 평점
- 상세 카테고리

보여줄 수 있는 것:
- 대략적인 거리
- 난이도
- 소요 시간 범위
- 분위기 힌트
- 안전/운영 여부 통과 표시

예시:
- “12분 거리의 작은 발견”
- “조용한 방향”
- “도착 전까지 비밀”
- “운영 중인 장소만 선택됨”

### 3. Follow Direction — 방향 따라가기

사용자는 지도 대신 방향 단서만 본다.

가능한 인터페이스:
- 나침반 바늘
- 방향 화살표
- 진동 강도
- LED 방향 표시
- 거리감만 제공
- 음성/텍스트 최소 힌트

핵심 원칙:
- 지도처럼 만들지 않는다.
- 세부 경로를 과하게 알려주지 않는다.
- 사용자가 주변을 보며 직접 길을 고르게 한다.

### 4. Approach — 가까워짐

목적지에 가까워질수록 피드백이 바뀐다.

가능한 피드백:
- 바늘 흔들림 감소
- 진동 간격 증가
- 화면 밝기 변화
- 거리 텍스트 감소
- “가까워지고 있음” 상태 문구

주의:
- 너무 게임처럼 보이면 장난감이 될 수 있다.
- 너무 정확하면 지도 앱과 다를 바가 없다.

### 5. Arrive — 도착

일정 반경 안에 들어오면 도착 상태로 전환한다.

기준 가설:
- 1차 프로토타입: 30m 이내를 도착으로 처리
- 실제 제품: GPS 오차, 실내/골목, 도심 협곡을 고려해 조정 필요

### 6. Reveal — 발견

목적지가 공개된다.

공개 정보:
- 장소명
- 사진 또는 짧은 설명
- 왜 선택됐는지
- 운영 정보
- 저장/공유
- 다시 탐험하기

핵심 질문:
- 공개 순간이 충분히 보상감 있는가?
- 실패한 목적지도 이야기거리가 되는가?
- 사용자가 “또 해볼까?”라고 느끼는가?

### 7. Save / Rate / Restart — 회고

사용자는 경험을 평가한다.

가능한 평가 항목:
- 재미있었는가?
- 안전했는가?
- 기대감이 있었는가?
- 목적지가 만족스러웠는가?
- 다시 사용할 의향이 있는가?

## 5. UX에서 반드시 지켜야 할 것

1. 목적지는 처음에 숨긴다.
2. 방향 단서는 충분하지만 과하지 않게 준다.
3. 사용자는 언제든 포기하거나 공개할 수 있어야 한다.
4. 실패 가능성을 완전히 없애기보다, 안전하게 관리한다.
5. 사용자가 주변 환경을 보게 만들어야 한다.

## 6. UX에서 피해야 할 것

- 평범한 지도 앱처럼 변하는 것
- 추천 결과 품질만으로 승부하는 것
- 사용자에게 불안감을 과하게 주는 것
- 목적지 공개를 지나치게 늦추는 것
- 위험하거나 통제 불가능한 장소로 유도하는 것
- 사용자가 스마트폰을 계속 보게 만드는 것

## 7. 핵심 상태 정의

| 상태 | 이름 | 사용자에게 보이는 것 |
|---|---|---|
| S0 | Idle | 시작 전 화면 |
| S1 | Selecting | 목적지 선택 중 |
| S2 | Hidden | 목적지 숨김 완료 |
| S3 | Following | 방향 단서 제공 |
| S4 | Near | 가까워짐 |
| S5 | Arrived | 도착 |
| S6 | Revealed | 목적지 공개 |
| S7 | Abandoned | 포기 |
| S8 | Rerolled | 재선택 |

## 8. 1차 프로토타입에서 검증할 질문

1. 목적지가 숨겨져 있는 것이 재미로 작동하는가?
2. 사용자가 방향 단서만으로도 움직이고 싶어 하는가?
3. 사용자가 불안을 느끼는 순간은 어디인가?
4. 공개/포기/재선택 버튼은 언제 필요해지는가?
5. 앱 화면만으로도 충분한가, 물리적 제품이 있어야 더 강한가?


---

# File: 03_ASSUMPTION_LOG.md

# Assumption Log

생성일: 2026-07-07  
상태: v0.1

이 문서는 제품이 성립하려면 참이어야 하는 가설을 기록한다.  
각 가설은 아직 검증되지 않았다.

## 1. 핵심 가설 목록

| ID | 가설 | 위험도 | 왜 중요한가 | 검증 방법 |
|---|---|---:|---|---|
| A1 | 사용자는 목적지를 모르는 이동을 불안보다 재미로 느낄 수 있다. | 높음 | 이게 틀리면 핵심 UX가 무너진다. | 가짜 나침반 프로토타입 테스트 |
| A2 | 사용자는 선택지를 직접 비교하지 않고 제품에 맡기는 경험을 받아들일 수 있다. | 높음 | 맡기기 경험이 성립해야 출발한다. | 컨셉 카드 테스트, 시나리오 반응 |
| A3 | 방향 단서만 보고 이동하는 경험은 지도 앱보다 특별하게 느껴진다. | 높음 | 앱 대체 가능성에 대한 방어 논리다. | 지도형 UX와 나침반형 UX 비교 |
| A4 | 식당이 아니어도 작은 가게, 여행지, 전시, 산책 장소로 확장 가능하다. | 중간 | 시장과 컨셉 확장성에 영향을 준다. | 목적지 카테고리 선호도 조사 |
| A5 | 안전장치가 있으면 목적지 미공개 상태를 수용할 수 있다. | 높음 | 불안과 위험을 낮추는 핵심 조건이다. | 공개/포기/재선택 사용률 관찰 |
| A6 | 실패한 추천도 일부 사용자는 이야기거리로 받아들일 수 있다. | 중간 | 추천 정확도 부담을 낮출 수 있다. | 실패 시나리오 반응 테스트 |
| A7 | 별도 하드웨어는 앱 단독보다 경험 가치를 높일 수 있다. | 높음 | 제품디자인 프로젝트로서의 타당성이다. | 앱 프로토타입 vs 물리 목업 비교 |
| A8 | 사용자는 이 경험을 반복할 이유를 가질 수 있다. | 높음 | 일회성 장난인지 제품인지 가르는 지점이다. | 2회차 사용 의향, 저장/공유 행동 |
| A9 | 동행자와 함께할 때 이 경험은 갈등보다 놀이가 될 수 있다. | 중간 | 데이트/친구 사용 맥락의 타당성이다. | 2인 이상 시나리오 테스트 |
| A10 | 사용자는 정확한 길 안내보다 주변을 보며 찾아가는 느슨한 안내를 받아들일 수 있다. | 중간 | 제품의 오프스크린성이 유지된다. | 경로 정확도 기대치 조사 |

## 2. 가장 위험한 가설

### A1. 목적지 미공개가 재미로 작동하는가?

이 제품의 가장 중요한 가설이다.  
목적지를 모르는 상태가 설렘이 아니라 불안으로 받아들여지면 제품 컨셉은 약해진다.

검증 질문:
- 사용자는 언제 불안해지는가?
- 어느 정도 정보가 있으면 안심하는가?
- “완전히 모름”과 “분위기 힌트만 있음” 중 무엇이 더 적절한가?

### A3. 앱만으로 충분하지 않은가?

이 제품이 산업디자인 프로젝트로 설득력을 가지려면 하드웨어 또는 물리 인터페이스의 이유가 필요하다.

검증 질문:
- 스마트폰 화면의 화살표만으로도 충분한가?
- 물리 나침반/진동 디바이스가 있으면 더 몰입되는가?
- 하드웨어가 실제 사용성을 높이는가, 아니면 컨셉 장식인가?

### A8. 반복 사용 이유가 있는가?

첫 경험은 신기할 수 있지만, 제품은 반복 사용 이유가 있어야 한다.

검증 질문:
- 사용자는 언제 다시 사용하려 하는가?
- 혼자보다 동행자가 있을 때 더 강한가?
- 여행/데이트/산책 중 어떤 상황이 가장 반복 가능성이 높은가?

## 3. 가설 검증 우선순위

1. 목적지 미공개 경험의 매력
2. 방향 단서만으로 이동하는 경험의 수용성
3. 안전장치 요구 수준
4. 앱 단독 vs 하드웨어 필요성
5. 목적지 카테고리 확장성
6. 반복 사용 이유
7. 수익/제휴 가능성

## 4. 사용자가 판단해야 할 항목

- 어떤 사용 상황을 1순위로 볼 것인가?
- 목적지 힌트를 얼마나 줄 것인가?
- 하드웨어를 핵심으로 밀 것인가, 앱 기반 MVP로 출발할 것인가?
- 불확실성을 얼마나 허용할 것인가?


---

# File: 04_DECISION_LOG.md

# Decision Log

생성일: 2026-07-07  
상태: v0.1

이 문서는 프로젝트에서 내려진 결정과 보류된 판단을 기록한다.  
새로운 결정이 생길 때마다 날짜, 결정 내용, 이유, 남은 리스크를 기록한다.

## 2026-07-07

### D001. 제품의 핵심 UX를 “목적지를 모르지만 따라가는 모험”으로 정의

**결정**  
핵심 UX는 “목적지를 모르지만 제품/앱을 따라 목적지를 향해 가는 모험”으로 둔다.

**이유**  
제품의 차별성은 추천 정확도가 아니라 목적지를 숨긴 상태에서 방향 단서를 따라가는 경험에 있다.

**남은 리스크**  
목적지 미공개가 사용자에게 재미가 아니라 불안으로 작동할 수 있다.

---

### D002. 목적지를 식당으로 한정하지 않음

**결정**  
목적지는 식당에 한정하지 않고, 여행지, 작은 가게, 카페, 전시, 산책 장소 등으로 열어둔다.

**이유**  
핵심 UX는 “먹을 곳 추천”보다 “낯선 장소 발견”에 가깝기 때문이다.

**남은 리스크**  
목적지 카테고리가 넓어지면 추천 품질과 안전 관리가 어려워질 수 있다.

---

### D003. 지금은 컨셉 확정이 아니라 검증 가능한 v0.1 고정 단계로 본다

**결정**  
최종 제품 사양을 확정하지 않고, 가설·리서치·프로토타입 기준을 명확히 하는 단계로 진행한다.

**이유**  
현재는 인터뷰/설문이 원활하지 않으므로 AI 기반 데스크 리서치와 프로토타입 준비를 먼저 수행한다.

**남은 리스크**  
AI 기반 정리가 실제 사용자 반응을 대체할 수는 없다.

---

### D004. 하드웨어 필요성은 보류

**결정**  
별도 하드웨어가 반드시 필요한지는 아직 확정하지 않는다.

**이유**  
앱 단독으로도 핵심 UX를 일부 구현할 수 있고, 하드웨어 필요성은 비교 테스트로 판단해야 한다.

**남은 리스크**  
하드웨어가 없다면 산업디자인 제품으로서의 설득력이 약해질 수 있다.

---

### D005. 1차 검증은 가짜 나침반 프로토타입으로 진행

**결정**  
실제 GPS/API 없이, 먼저 앱 기반 가짜 나침반 UX를 만든다.

**이유**  
최소 비용으로 목적지 숨김, 방향 단서, 공개/포기/재선택 흐름을 검증할 수 있다.

**남은 리스크**  
실제 이동 환경의 안전, 위치 오차, 사용 피로는 이후 현장 테스트에서만 검증 가능하다.

## 다음에 필요한 결정

아래 항목은 사용자의 판단이 필요하다. 상세 질문은 `05_OPEN_QUESTIONS.md`에 정리한다.

1. 1차 타깃 상황
2. 목적지 카테고리 범위
3. 브랜드 감정 톤
4. 화면과 하드웨어의 역할 분담
5. 목적지 힌트 공개 수준
6. 안전장치 기준
7. 포트폴리오 중심인지 사업성 중심인지


---

# File: 05_OPEN_QUESTIONS.md

# Open Questions — User Judgment Needed

생성일: 2026-07-07  
상태: v0.1

이 문서는 사용자의 생각이나 판단이 필요한 질문만 모은다.  
답변이 들어오면 `01_PROJECT_BRIEF.md`, `02_CORE_UX.md`, `03_ASSUMPTION_LOG.md`, `10_PROTOTYPE_SPEC_FOR_CODEX.md`를 갱신한다.

## 1. 가장 먼저 정해야 할 질문

### Q1. 1차 사용 상황은 무엇인가?

현재 후보:

1. 혼자 낯선 동네를 산책할 때
2. 데이트 중 즉흥 코스를 찾을 때
3. 여행지에서 숨은 장소를 찾을 때
4. 친구들과 가벼운 탐험을 할 때
5. 식당/카페 선택 피로를 줄이고 싶을 때

**v0.1 기본값**  
여행지/낯선 동네에서의 로컬 탐험.

**왜 필요한가**  
타깃 상황에 따라 제품 톤, 안전장치, 목적지 카테고리, 폼팩터가 달라진다.

---

### Q2. 이 제품은 얼마나 “모르게” 해야 하는가?

현재 후보:

1. 완전 숨김: 목적지 정보 없음. 방향과 거리만 제공.
2. 분위기 힌트: 장소명은 숨기되 “조용한 곳”, “작은 가게” 정도만 제공.
3. 카테고리 힌트: “카페”, “전시”, “상점” 정도는 공개.
4. 조건 공개: 거리, 예상 시간, 가격대, 운영 여부만 공개.

**v0.1 기본값**  
분위기 힌트 + 거리/시간/안전 조건 공개.

**왜 필요한가**  
숨김이 강할수록 모험감은 커지지만 불안도 커진다.

---

### Q3. 하드웨어는 어느 정도 핵심인가?

현재 후보:

1. 앱만으로 먼저 검증한다.
2. 앱이 목적지를 고르고, 하드웨어가 방향을 알려준다.
3. 하드웨어 단독 제품처럼 보이게 한다.
4. 하드웨어는 컨셉 목업 수준으로만 둔다.

**v0.1 기본값**  
앱 기반 MVP → 이후 물리 나침반/진동 디바이스 비교.

**왜 필요한가**  
산업디자인 프로젝트라면 하드웨어 존재 이유가 명확해야 한다.

---

### Q4. 목적지 카테고리는 어디까지 열 것인가?

현재 후보:

1. 식당/카페
2. 작은 가게/소품샵/서점
3. 전시/문화공간
4. 전망/공원/산책 장소
5. 관광지/로컬 명소
6. 사용자가 직접 저장한 장소

**v0.1 기본값**  
카페, 작은 가게, 전시, 산책 장소 중심. 식당은 하위 카테고리로 둔다.

**왜 필요한가**  
카테고리가 넓으면 컨셉은 풍부해지지만 추천 품질 관리가 어려워진다.

---

### Q5. 제품의 감정 톤은 무엇인가?

현재 후보:

1. 장난감처럼 유쾌한 탐험
2. 조용하고 감성적인 산책
3. 미스터리하고 약간 긴장감 있는 경험
4. 프리미엄 여행 가이드
5. 아날로그 감성의 작은 도구

**v0.1 기본값**  
아날로그 감성의 작은 도구 + 조용한 탐험.

**왜 필요한가**  
톤에 따라 형태, 색, 인터페이스, 카피 문구가 달라진다.

---

### Q6. 실패한 목적지는 어느 정도 허용할 것인가?

현재 후보:

1. 실패를 거의 허용하지 않는다. 검증된 장소만 추천.
2. 실패 가능성은 있지만 안전하고 운영 중이면 허용한다.
3. 실패도 이야기거리로 본다.
4. 실패를 줄이기 위해 사용자가 조건을 많이 설정하게 한다.

**v0.1 기본값**  
실패 가능성은 허용하지만, 안전·운영·거리 조건은 반드시 통과시킨다.

**왜 필요한가**  
제품이 “탐험”인지 “추천 서비스”인지의 성격을 가른다.

---

### Q7. 프로젝트 목표는 무엇에 더 가까운가?

현재 후보:

1. 학교/포트폴리오용 제품디자인 프로젝트
2. 실제 창업/서비스 가능성 검토
3. UX 리서치 중심 프로젝트
4. 하드웨어 형태 중심 프로젝트
5. AI/코딩 프로토타입 중심 프로젝트

**v0.1 기본값**  
포트폴리오용 제품디자인 프로젝트 + UX 검증 가능성 확보.

**왜 필요한가**  
산출물 우선순위가 달라진다. 포트폴리오라면 컨셉 명료성, UX 시나리오, 폼팩터 설득이 중요하고, 창업 검토라면 시장/수익/규제 검증이 더 중요하다.

---

## 2. 이후 단계에서 정할 질문

### Q8. 사용자는 혼자인가, 동행자인가?

- 혼자: 안전, 자기 주도성, 산책성 중요
- 둘: 대화거리, 데이트성, 공동 결정 회피 중요
- 여럿: 놀이성, 합의, 공유 기능 중요

### Q9. 제품은 손에 드는가, 가방/옷에 붙는가?

- 손에 드는 나침반
- 키링/카라비너
- 손목형
- 목걸이형
- 스마트폰 주변기기
- 자동차/자전거용은 우선 제외

### Q10. 목적지 공개 버튼은 항상 보여줄 것인가?

- 항상 공개 가능
- 일정 시간 후 공개 가능
- 위험/불안 상황에서만 공개
- 공개하면 탐험 실패로 처리

### Q11. 목적지까지 경로를 직접 선택하게 할 것인가?

- 방향만 제공하고 경로는 사용자가 선택
- 위험한 길을 피하기 위한 최소 경로 보정
- 지도 앱과 연동하되 화면은 숨김

### Q12. 이 제품의 가장 큰 적은 무엇인가?

- 지도 앱
- AI 추천 서비스
- 사용자의 불안
- 추천 실패
- 하드웨어 가격
- 반복 사용성 부족

## 3. 사용자가 답변하기 좋은 형식

아래처럼 번호만 답해도 된다.

```text
Q1: 3
Q2: 2
Q3: 2
Q4: 2,3,4
Q5: 5
Q6: 2
Q7: 1
추가 의견: 너무 게임 같지는 않았으면 좋겠음.
```


---

# File: 06_RESEARCH_PLAN.md

# Research Plan

생성일: 2026-07-07  
상태: v0.1

현재는 인터뷰/설문이 원활하지 않으므로, 먼저 AI와 데스크 리서치로 컨셉을 정리하고 이후 실제 사용자 검증으로 넘어간다.

## 1. 전체 리서치 흐름

```text
0. Concept Hypothesis
→ 1. Sense Intent
→ 2. Know Context
→ 3. Know People
→ 4. Frame Insight
→ 5. Prototype
→ 6. Test
→ 7. Refine MVP
```

## 2. 0단계 — Concept Hypothesis

목적:
- 현재 솔루션을 최종 답이 아니라 검증 가능한 가설로 바꾼다.

산출물:
- 한 문장 컨셉
- 핵심 UX
- 확정/보류 목록
- 핵심 가설
- 오픈 질문

현재 컨셉:
> 사용자는 목적지를 모르지만, 제품/앱이 주는 최소한의 방향 단서를 따라가며 낯선 장소를 발견한다.

## 3. 1단계 — Sense Intent

목적:
- 왜 이 제품을 만들려는지 명확히 한다.
- 제품이 건드리는 인간 욕구를 정의한다.

핵심 질문:
- 사용자는 왜 목적지를 모르는 이동을 해보고 싶어 할까?
- 지도 앱과 장소 추천 앱이 이미 강한데, 이 제품이 필요한 이유는 무엇인가?
- 이 제품은 문제 해결인가, 경험 창출인가?
- 사용자가 “효율”보다 “탐험”을 선택하는 순간은 언제인가?

산출물:
- 디자인 의도문
- 문제/욕구 가설
- 제품이 해결하지 않을 것 목록

## 4. 2단계 — Know Context

목적:
- 경쟁 제품, 대체재, 기술, 규제, 문화적 맥락을 파악한다.

조사 범주:
- 나침반형 내비게이션
- 랜덤 여행/미스터리 트립
- 지오캐싱/보물찾기
- 로컬 큐레이션 서비스
- 장소 추천 앱
- 스마트폰 지도 사용 피로
- 위치정보/안전 관련 이슈

산출물:
- 경쟁/유사 사례 매트릭스
- 대체재 분석
- 기술 가능성 메모
- 안전/규제 리스크 메모

## 5. 3단계 — Know People

목적:
- 실제 사용자가 식당/장소를 고르고 이동하는 방식을 이해한다.

인터뷰/관찰이 가능해지면 볼 것:
- 장소를 고르는 과정
- 선택 피로 발생 지점
- 동행자 조율 방식
- 지도 앱 사용 빈도
- 목적지를 모르는 이동에 대한 감정
- 안전과 통제에 대한 요구
- 실패 허용 범위

대체 방법:
- 본인 사용 기록 회고
- 주변 지인 3명 비공식 인터뷰
- 기존 연구/아티클 분석
- 유사 서비스 리뷰 분석
- AI 기반 시나리오 생성은 가설 도출용으로만 사용

주의:
- AI가 만든 가상 사용자 반응은 실제 사용자 증거가 아니다.
- AI 시뮬레이션은 질문을 정리하는 도구로만 사용한다.

## 6. 4단계 — Frame Insight

목적:
- 조사 내용을 제품 기회로 바꾼다.

산출물:
- 핵심 인사이트 3~5개
- 타깃 사용자
- 사용 상황
- 디자인 원칙
- 제품 기회 문장

예시 인사이트 후보:
- 사람들은 매번 완벽한 선택을 원하는 것이 아니라, 가끔 선택 부담을 내려놓고 싶어 한다.
- 목적지를 모른다는 불확실성은 안전장치가 있을 때 탐험감으로 전환될 수 있다.
- 지도 앱은 효율적이지만, 사용자의 시선을 화면에 묶어 주변 발견감을 줄일 수 있다.
- 이 제품의 경쟁력은 추천 품질보다 이동 과정의 감정 설계에 있다.

## 7. 5단계 — Prototype

목적:
- 말로만 설명되는 컨셉을 체험 가능한 흐름으로 만든다.

1차 프로토타입:
- 앱 기반 가짜 나침반
- 목데이터 목적지
- 실제 GPS/API 없음
- 목적지 숨김
- 방향/거리 시뮬레이션
- 공개/포기/재선택 버튼

2차 프로토타입:
- 물리 목업
- 진동/LED/바늘 인터페이스
- 스마트폰과 역할 분리
- 앱 단독 UX와 비교

## 8. 6단계 — Test

목적:
- 사용자가 이 경험을 실제로 받아들이는지 확인한다.

지표:
- 출발 의향
- 완주 의향
- 수동 공개율
- 포기율
- 불안 발생 지점
- 재미/기대감 평가
- 재사용 의향
- 하드웨어 필요성 평가

## 9. 7단계 — Refine MVP

목적:
- 제품을 만들 가치가 있는 최소 기능으로 좁힌다.

MVP 후보:
- 목적지 숨김 추천
- 방향 단서 제공
- 도착 후 공개
- 공개/포기/재선택 안전장치
- 거리/운영/위험지역 필터

보류 기능:
- 정교한 추천 알고리즘
- 예약/결제/쿠폰
- 커뮤니티
- 장소 리뷰
- 지도 기반 상세 경로
- 복잡한 개인화


---

# File: 07_COMPETITOR_RESEARCH_BRIEF.md

# Competitor & Analogy Research Brief

생성일: 2026-07-07  
상태: v0.1

이 문서는 브라우저 AI 또는 GPT 검색 리서치에 사용할 경쟁/유사 사례 조사 틀이다.

## 1. 조사 목적

이 제품은 기존 지도 앱과 직접 경쟁하기보다, 다음 경험 영역과 겹친다.

- 목적지를 단순화하는 내비게이션
- 랜덤/미스터리 여행
- 지오캐싱/보물찾기
- 로컬 큐레이션
- 장소 추천 서비스
- 오프스크린/저시선 인터페이스

## 2. 비교할 질문

각 사례마다 다음 질문으로 분석한다.

1. 목적지를 숨기는가?
2. 이동 경험이 핵심인가?
3. 사용자가 직접 경로를 선택하는가?
4. 앱만으로 충분한가?
5. 하드웨어가 경험 가치를 만드는가?
6. 실패했을 때 실망이 큰가?
7. 반복 사용 이유가 있는가?
8. 커뮤니티/콘텐츠 자산이 필요한가?
9. 수익 모델은 무엇인가?
10. 내 제품에 주는 시사점은 무엇인가?

## 3. 조사 카테고리

### A. Compass Navigation Hardware

예상 사례:
- Beeline Velo / Moto
- 자전거/오토바이용 미니 내비게이션
- hiking compass GPS device

볼 점:
- 방향만 주는 내비게이션의 장점
- 스마트폰과 하드웨어 역할 분리
- 경로 모드와 컴퍼스 모드 차이
- 화면을 덜 보는 이동 경험

### B. Random Destination / Mystery Travel

예상 사례:
- Randonautica
- mystery travel services
- random trip apps
- surprise travel packages

볼 점:
- 목적지 미공개의 매력
- 불안/위험/실망 관리
- 사용자가 왜 예측 불가능성을 소비하는가
- 실패 사례

### C. Geocaching / Treasure Hunt

예상 사례:
- Geocaching
- urban treasure hunt
- AR scavenger hunt

볼 점:
- 찾는 과정의 보상감
- 목적지보다 과정이 중요한 구조
- 커뮤니티와 콘텐츠 축적
- 게임화 수준

### D. Local Discovery / Hidden Place Curation

예상 사례:
- Atlas Obscura
- local hidden gem apps
- travel curation apps
- indie shop discovery guides

볼 점:
- 순수 랜덤보다 큐레이션이 중요한 이유
- 장소 품질 관리 방식
- 숨은 장소를 소개하는 카피/톤
- 지역 기반 콘텐츠 운영

### E. Mainstream Place Recommendation Apps

국내 사례:
- 네이버 플레이스
- 카카오맵
- 캐치테이블
- Google Maps
- Apple Maps

볼 점:
- 정보 탐색 효율성
- 리뷰/평점/예약/웨이팅 경쟁력
- 이 제품이 정면 경쟁하면 안 되는 이유
- 추천 정확도 대신 경험으로 차별화할 수 있는 지점

## 4. 경쟁 매트릭스 템플릿

| 사례 | 카테고리 | 핵심 UX | 목적지 숨김 | 이동 경험 | 하드웨어 가치 | 실패 리스크 | 시사점 |
|---|---|---|---|---|---|---|---|
| Beeline | Compass navigation | 목적지를 알고 방향을 따라감 | 낮음 | 높음 | 높음 | 중간 | 저시선 내비 가능성 |
| Randonautica | Random destination | 무작위 좌표 탐험 | 높음 | 높음 | 낮음 | 높음 | 목적지 미공개 매력/위험 |
| Geocaching | Treasure hunt | 숨겨진 캐시 찾기 | 중간 | 높음 | 낮음 | 중간 | 찾는 과정의 보상감 |
| Atlas Obscura | Curation | 숨은 장소 탐색 | 낮음 | 중간 | 낮음 | 낮음 | 랜덤보다 큐레이션 중요 |
| 네이버/카카오맵 | Place search | 효율적 장소 검색 | 없음 | 중간 | 낮음 | 낮음 | 효율 경쟁은 불리함 |

## 5. 브라우저 AI 리서치 프롬프트

```text
2024-2026년 기준으로 ‘목적지를 숨기고 사용자가 방향 단서만 따라가며 장소를 발견하는 경험’과 유사한 제품/앱/서비스를 조사해줘.

범주는 다음을 포함해줘:
1. compass navigation hardware
2. random destination / mystery travel app
3. geocaching / treasure hunt platform
4. local discovery / hidden place curation service
5. screenless or low-screen navigation product
6. mainstream place recommendation app

각 사례마다 다음 항목으로 정리해줘:
- 제품/서비스명
- 국가/운영사
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

## 6. 주의

- 기존 서비스가 존재한다는 사실만으로 내 제품이 타당해지는 것은 아니다.
- 경쟁 사례는 “증명”이 아니라 “비교 기준”이다.
- 실제 사용자 욕구는 이후 테스트로 확인해야 한다.


---

# File: 08_USER_SCENARIOS.md

# User Scenarios

생성일: 2026-07-07  
상태: v0.1 / 가설 기반 시나리오

주의: 이 문서의 사용자는 실제 인터뷰 기반 페르소나가 아니다.  
현재는 컨셉 검증을 위해 만든 가설 기반 시나리오다.

## 1. 시나리오 A — 혼자 낯선 동네를 걷는 사용자

### 상황

사용자는 수업이나 약속이 끝난 뒤, 처음 와본 동네에서 1시간 정도 시간이 남았다.  
지도 앱을 열면 카페, 식당, 편집샵이 너무 많이 나온다.  
사용자는 완벽한 선택보다 “그냥 한 번 걸어볼 이유”가 필요하다.

### 사용 흐름

1. 앱에서 “가벼운 탐험 시작”을 누른다.
2. 조건은 “20분 이내, 조용한 곳, 운영 중”으로 둔다.
3. 목적지 이름은 보이지 않는다.
4. 화면에는 방향과 대략적인 거리만 보인다.
5. 사용자는 골목을 보며 직접 길을 고른다.
6. 도착하면 작은 독립서점이 공개된다.
7. 사용자는 장소를 저장하고 짧은 메모를 남긴다.

### 기대 가치

- 선택 피로 감소
- 산책의 이유 생성
- 동네를 발견하는 감각
- 혼자 보내는 시간의 밀도 증가

### 리스크

- 안전 불안
- 너무 멀거나 별로인 목적지
- 화면을 계속 보게 되면 컨셉 약화

## 2. 시나리오 B — 데이트 중 즉흥 코스를 찾는 사용자

### 상황

두 사람은 밥을 먹고 나왔지만 다음 장소를 정하지 못했다.  
둘 다 “아무 데나 괜찮다”고 하지만 실제로는 결정이 잘 안 된다.  
사용자는 앱을 켜고 “15분 이내, 카페/작은 가게, 너무 시끄럽지 않은 곳”으로 탐험을 시작한다.

### 사용 흐름

1. 둘 중 한 명이 제품의 버튼을 누른다.
2. 목적지는 숨겨지고, 제품은 한 방향을 가리킨다.
3. 두 사람은 목적지를 추측하며 걷는다.
4. 중간에 분위기 힌트가 나온다: “작고 조용한 곳”.
5. 도착하면 골목 안 작은 카페가 공개된다.
6. 성공하면 다음에도 “오늘은 얘한테 맡겨보자”는 놀이가 된다.

### 기대 가치

- 동행자 조율 부담 감소
- 대화거리 생성
- 데이트의 즉흥성 증가
- 장소 선택이 이벤트가 됨

### 리스크

- 한쪽이 통제를 강하게 원하면 거부감 발생
- 목적지가 기대 이하일 때 민망함
- 너무 게임 같으면 가벼워 보일 수 있음

## 3. 시나리오 C — 여행지에서 숨은 장소를 찾는 사용자

### 상황

사용자는 여행지에서 유명 관광지는 이미 다녀왔다.  
검색하면 비슷한 추천만 반복되고, 리뷰를 읽는 것도 피곤하다.  
사용자는 “관광객이 덜 가는 작은 발견”을 원한다.

### 사용 흐름

1. 사용자가 “Local Discovery” 모드를 선택한다.
2. 조건은 “30분 이내, 사진 스팟 제외, 작은 가게/산책 장소”로 둔다.
3. 목적지는 숨겨진다.
4. 사용자는 방향 단서만 따라 이동한다.
5. 도착하면 작은 로컬 공방이 공개된다.
6. 사용자는 방문 후 사진과 메모를 기록한다.

### 기대 가치

- 여행의 우연성
- 과도한 검색 피로 감소
- 유명 관광지 외의 장소 발견
- 여행 기억의 서사화

### 리스크

- 로컬 콘텐츠 품질 확보 필요
- 영업시간/휴무/사유지 문제
- 외국/타지역 안전 기준 필요

## 4. 시나리오 D — 친구들과 가벼운 탐험

### 상황

친구들이 모였지만 무엇을 할지 정하지 못했다.  
누군가가 “그냥 이거 따라가 보자”고 제안한다.

### 사용 흐름

1. 탐험 조건을 “20분 이내, 아무 카테고리, 안전 경로”로 둔다.
2. 제품이 방향을 가리킨다.
3. 친구들은 목적지를 추측하며 이동한다.
4. 도중에 포기할지 계속 갈지 투표한다.
5. 목적지가 공개된다.
6. 좋으면 저장, 별로면 “실패 기록”으로 남긴다.

### 기대 가치

- 그룹 내 결정 부담 감소
- 놀이성
- 기억에 남는 사건 생성
- 실패도 농담거리로 전환 가능

### 리스크

- 그룹에서는 누군가가 싫어하면 중단될 가능성 높음
- 안전/거리 조건이 더 엄격해야 함
- 지나치게 게임화되면 제품 정체성이 바뀔 수 있음

## 5. 시나리오별 비교

| 시나리오 | 매력도 가설 | 안전 민감도 | 반복 가능성 | 하드웨어 필요성 |
|---|---:|---:|---:|---:|
| 혼자 산책 | 중간 | 높음 | 중간 | 중간 |
| 데이트 | 높음 | 중간 | 높음 | 높음 |
| 여행 | 높음 | 높음 | 중간 | 중간 |
| 친구 탐험 | 높음 | 중간 | 중간 | 중간 |

## 6. 우선 검증할 시나리오 후보

v0.1 기준 우선순위:

1. 여행지/낯선 동네 로컬 탐험
2. 데이트 중 즉흥 코스
3. 혼자 산책
4. 친구들과 탐험

사용자 판단에 따라 변경 가능하다.


---

# File: 09_DESIGN_PRINCIPLES.md

# Design Principles

생성일: 2026-07-07  
상태: v0.1

이 문서는 제품의 형태, 인터페이스, 프로토타입을 판단할 때 사용할 디자인 원칙이다.

## P1. Off-screen First

제품은 사용자가 화면을 덜 보게 해야 한다.  
화면에 더 많은 정보를 제공할수록 기존 지도 앱과 가까워진다.

판단 기준:
- 이 기능이 사용자의 시선을 화면으로 다시 끌어들이는가?
- 이 기능 없이도 사용자가 안전하게 이동할 수 있는가?
- 화면보다 물리적 단서로 전달할 수 있는가?

## P2. Hidden but Controllable

목적지는 숨기되, 사용자가 통제를 완전히 잃었다고 느끼면 안 된다.

필수 안전장치:
- 언제든 공개
- 포기
- 재선택
- 거리 제한
- 위험지역 제외
- 운영/접근 가능성 확인

## P3. Curated Serendipity

완전한 랜덤이 아니라, 관리된 우연성이어야 한다.

원칙:
- 목적지는 우연처럼 느껴져야 한다.
- 하지만 실제로는 안전, 거리, 운영 여부, 접근성을 통과해야 한다.
- 실패를 줄이되, 너무 예측 가능하게 만들지 않는다.

## P4. Direction, Not Route

제품은 세부 경로보다 방향을 제공한다.

이유:
- 사용자가 주변을 보며 직접 길을 고르게 하기 위해
- 지도 앱과 차별화하기 위해
- 탐험감을 유지하기 위해

허용:
- 방향
- 대략적 거리
- 가까워짐 피드백
- 위험 회피를 위한 최소 보정

지양:
- turn-by-turn 안내
- 전체 지도
- 정확한 주소 조기 공개
- 리뷰/평점 조기 공개

## P5. Safe Unknown

불확실성은 매력이어야지 위험이어서는 안 된다.

안전 조건:
- 너무 늦은 시간 추천 제한
- 사유지 제외
- 위험 골목/고립 지역 제외
- 영업 중/접근 가능 장소 우선
- 사용자가 불안하면 즉시 공개 가능

## P6. Small Event, Not Big Utility

이 제품은 필수 인프라가 아니라 작은 사건을 만드는 제품에 가깝다.

디자인 방향:
- 매일 필요한 도구처럼 과장하지 않는다.
- 한 번의 산책, 데이트, 여행을 특별하게 만드는 경험으로 잡는다.
- 효율보다 기억 가능성을 중시한다.

## P7. Hardware Must Earn Its Place

하드웨어가 있다면 반드시 이유가 있어야 한다.

하드웨어가 해야 할 일:
- 화면을 덜 보게 만들기
- 물리적 방향감을 주기
- 작은 의식/행동을 만들기
- 앱으로는 약한 감정적 몰입을 보완하기

하드웨어가 하면 안 되는 일:
- 앱 기능을 단순히 복제하기
- 비싼 장식품이 되기
- 휴대 부담만 만들기

## P8. Reveal Is the Reward

목적지 공개 순간은 UX의 보상 지점이다.

공개 순간에 필요한 것:
- 짧은 이유 설명
- 장소의 매력
- 저장/기록
- 공유 가능성
- 다시 탐험하기

## P9. Failure Should Be Recoverable

추천 실패는 완전히 피할 수 없다.  
대신 실패했을 때 회복 가능해야 한다.

회복 장치:
- 재선택
- 근처 대안
- 포기해도 불쾌하지 않은 UX
- 실패 기록을 유머/이야기로 전환
- 안전 우선 중단

## P10. Do Not Become a Better Map App

이 제품이 지도 앱과 같은 싸움을 하면 불리하다.

하지 말 것:
- 리뷰/평점 경쟁
- 최단 경로 경쟁
- 음식점 랭킹 경쟁
- 예약/웨이팅 플랫폼으로 초반 확장
- 지도 UI 중심화

해야 할 것:
- 숨김
- 따라가기
- 발견
- 회고
- 오프스크린 감각


---

# File: 10_PROTOTYPE_SPEC_FOR_CODEX.md

# Prototype Spec for Codex

생성일: 2026-07-07  
상태: v0.1

이 문서는 Codex가 1차 모바일 웹 프로토타입을 만들기 위한 명세다.

## 1. Prototype Goal

Build a simple mobile-first prototype for a hidden-destination compass adventure UX.

The goal is not to build a real navigation app.  
The goal is to test whether the core flow feels understandable, safe, and intriguing:

```text
Start → Hidden Destination → Follow Direction → Approach → Reveal
```

## 2. Core UX Hypothesis

The user does not know the destination.  
The app gives only minimal direction and distance cues.  
The user follows the cues and discovers the destination at the end.

## 3. Scope

### Include

- Start Adventure button
- Mock destination selection
- Hidden destination state
- Compass arrow or direction indicator
- Approximate distance
- Simulated movement
- Reveal button
- Give Up button
- Reroll button
- Arrival state
- Destination reveal screen
- Short post-experience rating

### Exclude for v0.1

- Real GPS
- Real map API
- User account
- Payment
- Recommendation algorithm
- Reviews/ratings from external services
- Reservation
- Social sharing
- Hardware connection

## 4. Recommended Tech

Use the simplest possible stack first.

Option A:
- HTML
- CSS
- JavaScript

Option B:
- React/Vite

Prefer Option A unless the project already uses React.

## 5. Folder Structure

```text
prototype/
  index.html
  style.css
  app.js
data/
  mock_destinations.json
docs/
  prototype_notes.md
```

## 6. Mock Destination Data

Create mock data like this:

```json
[
  {
    "id": "d001",
    "name": "Small Independent Bookstore",
    "category": "shop",
    "mood": "quiet discovery",
    "initialDistanceM": 720,
    "estimatedMinutes": 12,
    "safetyLevel": "safe",
    "hint": "A quiet place with paper and light"
  },
  {
    "id": "d002",
    "name": "Alley Cafe",
    "category": "cafe",
    "mood": "casual",
    "initialDistanceM": 480,
    "estimatedMinutes": 8,
    "safetyLevel": "safe",
    "hint": "A small warm pause nearby"
  },
  {
    "id": "d003",
    "name": "Tiny Local Gallery",
    "category": "culture",
    "mood": "curious",
    "initialDistanceM": 950,
    "estimatedMinutes": 16,
    "safetyLevel": "safe",
    "hint": "Something quiet to look at"
  }
]
```

## 7. Screen States

### S0. Idle

Elements:
- Product title
- One-line concept
- Start Adventure button
- Small safety note

Copy example:
- “Follow the unknown.”
- “Your destination will stay hidden until you arrive.”

### S1. Selecting

Elements:
- Loading animation
- “Choosing a safe nearby discovery…”

Duration:
- 1–2 seconds

### S2. Hidden Destination Ready

Elements:
- Destination hidden card
- Hint
- Approximate distance
- Estimated time
- Start following button

Do not show:
- Destination name
- Exact address
- Photo
- Review
- Rating

### S3. Following

Elements:
- Compass arrow
- Approximate distance
- Status text
- Reveal
- Give Up
- Reroll

Interaction:
- “Move closer” button for simulation
- Each tap decreases distance by random 60–140m
- Arrow direction changes slightly each step

Copy examples:
- “Keep going.”
- “You are getting warmer.”
- “The place is still hidden.”

### S4. Near

Trigger:
- Distance below 120m

Elements:
- Stronger approach feedback
- “Very close” status
- Optional reveal prompt

### S5. Arrived

Trigger:
- Distance below 30m

Elements:
- Arrival confirmation
- Reveal destination button

### S6. Revealed

Elements:
- Destination name
- Category
- Hint explanation
- Short description
- Save
- Rate
- Start Again

### S7. Give Up

Elements:
- Confirm give up
- Reveal destination anyway
- Restart

### S8. Reroll

Elements:
- Select a new hidden destination
- Keep previous one hidden or discard

## 8. Interaction Rules

1. Destination name must remain hidden until reveal.
2. Reveal must always be available for safety.
3. Reroll must not feel like failure.
4. Give Up must be neutral, not shameful.
5. UI must stay minimal.
6. Do not show a map.
7. Do not add route instructions.
8. Avoid visual clutter.

## 9. Visual Direction

Initial direction:
- Minimal
- Low-screen
- Compass-like
- Analog-inspired
- Calm, not gamified too heavily

Avoid:
- Full map UI
- Restaurant ranking UI
- Bright game UI unless explicitly requested
- Review-card layout

## 10. Success Criteria

The prototype is successful if it can answer these questions:

1. Does the hidden destination flow make sense?
2. Does the user understand what to do next?
3. Does the user feel safe enough because Reveal/Give Up exist?
4. Does the compass/distance flow feel different from a map app?
5. Does the reveal moment feel like a reward?

## 11. Codex Task Prompt

Use this prompt to start implementation:

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

## 12. Later Prototype Extensions

After v0.1:
- Real phone orientation sensor
- Real GPS
- Vibration feedback
- Hardware mock connection
- BLE prototype
- Physical compass form exploration
- Figma visual prototype
- User testing script


---

# File: 11_GPT_PROJECT_INSTRUCTIONS.md

# GPT Project Instructions

생성일: 2026-07-07  
상태: v0.1

아래 내용을 ChatGPT 프로젝트의 지침에 붙여 넣는다.

---

## Project Role

You are the planning, research, and critique partner for a product design project named “Blind Compass Discovery.”

The project explores a hidden-destination compass adventure UX:
The user does not know the destination, but follows minimal direction cues from a product/app and discovers the place at the end.

## Core Concept

This is not a better map app or a better restaurant recommendation app.  
The core experience is:

```text
Start → Hidden Destination → Follow Direction → Arrive → Reveal
```

The product value is off-screen discovery, safe uncertainty, and the emotional experience of following the unknown.

## Current Fixed Decisions

- The destination is initially hidden.
- The user receives minimal direction cues.
- The user follows the cue and discovers the destination.
- Destinations are not limited to restaurants.
- Hardware necessity is not yet confirmed.
- The product should not become a standard map app.

## How to Respond

When helping with this project:

1. Separate facts, assumptions, and design judgments.
2. Do not treat the current concept as proven.
3. Ask when a decision requires the user’s taste, priority, or project goal.
4. Keep the core UX focused on hidden destination discovery.
5. Challenge the idea when it risks becoming a normal map/recommendation app.
6. Maintain a clear distinction between app MVP and hardware product.
7. When using sources, cite them clearly.
8. When generating personas or user reactions, label them as hypotheses, not evidence.
9. When decisions are made, update the decision log.
10. When uncertainties remain, update the open questions list.

## Main Jobs

Act as:

- Product design lead
- UX critic
- Research planner
- Desk research assistant
- Concept editor
- Prototype reviewer
- Codex handoff writer

## Do Not

- Do not over-expand features.
- Do not add social/community functions unless asked.
- Do not assume restaurants are the main category.
- Do not assume hardware is automatically justified.
- Do not write as if AI-generated users are real research data.
- Do not optimize for pure efficiency.
- Do not turn the product into a review/ranking/search platform.

## Decision Rule

When evaluating an idea, ask:

1. Does it strengthen the hidden-destination adventure?
2. Does it reduce screen dependence?
3. Does it preserve safe uncertainty?
4. Does it give the hardware/app a clear role?
5. Does it avoid becoming a normal map app?

## Current Highest-Risk Questions

1. Is hidden destination exciting or uncomfortable?
2. Is a physical product necessary?
3. What destination categories fit best?
4. What level of hint is enough?
5. What safety controls are mandatory?
6. What gives users a reason to repeat the experience?

## Preferred Output Style

- Clear
- Structured
- Critical but constructive
- Korean by default
- Tables when comparing options
- Short summaries before detailed analysis


---

# File: 12_CODEX_HANDOFF_AGENTS.md

# AGENTS.md for Codex

생성일: 2026-07-07  
상태: v0.1

이 문서는 Codex 프로젝트의 `AGENTS.md`로 복사해서 사용할 수 있다.

---

# AGENTS.md

## Project Goal

Build and refine a mobile-first prototype for a hidden-destination compass adventure experience.

The user does not know the destination.
The app gives only minimal direction and distance cues.
The user follows the cues and discovers the destination at the end.

## Core Flow

```text
Start → Hidden Destination → Follow Direction → Approach → Arrive → Reveal
```

## Product Principle

This is not a standard map app.  
This is not a restaurant ranking app.  
This is an off-screen discovery experience.

## Do

- Keep the UI minimal.
- Hide the destination name until reveal.
- Prioritize the core flow: start, follow, reveal, reroll, give up.
- Use mock destination data first.
- Simulate movement before adding real GPS.
- Add safety controls.
- Document every major change in `docs/decision_log.md` or `docs/prototype_notes.md`.
- Keep the prototype mobile-first.
- Make state transitions easy to understand.
- Use simple code before adding frameworks.

## Do Not

- Do not add maps in v0.1.
- Do not add real APIs in v0.1.
- Do not show full destination details too early.
- Do not add restaurant ratings, reviews, or ranking UI.
- Do not add login/account systems.
- Do not add complex recommendation algorithms yet.
- Do not make product strategy decisions without marking them as hypotheses.
- Do not turn this into a normal navigation app.

## Required Prototype States

- Idle
- Selecting
- Hidden destination ready
- Following
- Near
- Arrived
- Revealed
- Give up
- Reroll

## Acceptance Criteria

The prototype must allow a reviewer to experience:

1. Starting an unknown destination adventure
2. Seeing that the destination is hidden
3. Following direction/distance cues
4. Getting closer through simulated movement
5. Revealing the destination
6. Giving up safely
7. Rerolling to another hidden destination

## Preferred Stack

Start with plain HTML, CSS, and JavaScript unless otherwise instructed.

## File Structure

```text
prototype/
  index.html
  style.css
  app.js
data/
  mock_destinations.json
docs/
  prototype_notes.md
```

## UX Copy Tone

- Minimal
- Calm
- Slightly mysterious
- Safe
- Not too game-like

Example copy:
- “Follow the unknown.”
- “Your destination is hidden.”
- “You are getting closer.”
- “Reveal whenever you need.”
- “Arrived. Ready to discover?”

## Testing Notes

When adding features, document what hypothesis the feature tests.

Example:
- Feature: reveal button
- Hypothesis: users need control to feel safe while the destination is hidden.



---

# File: 13_PROMPT_LIBRARY.md

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


---

# File: 14_SOURCE_BASIS.md

# Source Basis

생성일: 2026-07-07  
상태: v0.1

이 문서는 이 소스팩이 어떤 근거로 작성되었는지 정리한다.

## 1. 사용자가 직접 제시한 핵심 문장

현재 핵심 UX:

> 목적지를 모르지만 제품/앱을 따라 목적지를 향해 가는 모험.

사용자가 추가로 명시한 점:

- 목적지는 굳이 식당이 아니어도 된다.
- 여행지, 작은 가게 등으로 확장 가능하다.
- 인터뷰/설문이 당장 원활하지 않다.
- 먼저 제품 컨셉을 명확히 할 필요가 있다.
- GPT 프로젝트와 Codex의 협력을 최대화하고 싶다.

## 2. 기존 평가 PDF에서 반영한 내용

기존 평가 문서의 요지는 다음과 같이 반영했다.

- 아이디어의 본질은 “랜덤 맛집”이 아니라 목적지를 숨긴 오프스크린 탐색 경험이다.
- 지도/장소 추천 앱과 효율 경쟁을 하면 불리하다.
- 제품의 방어력은 추천 정확도보다 오프스크린 이동 경험에 있다.
- 먼저 앱 기반 가짜 나침반 UX를 검증하고, 이후 외형/하드웨어 프로토타입으로 넘어가는 방식이 적절하다.
- 안전장치, 공개/재선택, 위험지역 제외 같은 제약이 필요하다.

## 3. 이 문서 세트에서 새로 정리한 가정

아래 항목은 아직 실제 사용자 조사로 검증되지 않았다.

- 목적지 미공개가 재미로 작동할 수 있다.
- 여행/데이트/산책 상황에서 특히 강할 수 있다.
- 앱 단독보다 물리적 제품이 경험 가치를 높일 수 있다.
- 실패한 추천도 일부 상황에서는 이야기거리로 받아들여질 수 있다.
- 목적지 카테고리는 식당보다 넓게 잡는 편이 컨셉에 유리할 수 있다.

## 4. 아직 부족한 근거

다음은 이후 리서치가 필요하다.

- 실제 사용자 인터뷰
- 목적지 미공개 UX 테스트
- 앱 vs 하드웨어 비교 테스트
- 유사 서비스 최신 경쟁 조사
- 위치정보/안전/규제 검토
- 목적지 카테고리별 만족도 조사
- 반복 사용성 검증

## 5. 사용 지침

이 문서 세트는 최종 기획안이 아니라 **컨셉 정리와 검증 준비를 위한 작업 문서**다.  
앞으로 새로운 근거가 생기면 `04_DECISION_LOG.md`와 `03_ASSUMPTION_LOG.md`를 갱신해야 한다.
