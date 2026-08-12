# 턴바이턴 도보 안내 UI 설계

상태: 사용자 수정 요청 반영 설계 (2026-08-12)

## 결정

현재 vNext 브라우저 프로토타입의 대각선 나침반 바늘 안내를 다음 행동 중심의 턴바이턴 안내로 바꾼다. 목적지 이름·주소·건물 정보는 도착 전까지 계속 숨기지만, 이동에 필요한 방향과 거리는 제한하지 않는다.

## 공개 정보 계약

Following, following_revealed, near 화면에는 다음 정보를 표시한다.

- 현재 이동 방향: 예를 들어 `동쪽`
- 다음 행동: 직진, 좌회전, 우회전, 유턴, 도착
- 다음 행동까지 남은 거리: 예를 들어 `120m 뒤`
- 제공자 원문에서 안전하게 정규화된 안내 문구와 도로·랜드마크
- 목적지까지의 전체 남은 거리: 예를 들어 `680m`
- 안내 상태: 안내 중, 목적지 근처, 경로 재계산 중, 일시정지
- 기존 공개 수준이 허용하는 대표 메뉴·가격대

다음 정보는 계속 비공개다.

- 목적지 상호명
- 정확한 주소와 좌표
- 건물명·층·입구 정보

경로 신뢰도가 낮거나 위치가 오래되면 마지막 회전 지시를 재사용하지 않는다. `경로를 다시 계산하고 있어요`와 마지막으로 확인된 남은 거리만 표시하고, 새로운 방향을 추정하지 않는다.

## UI 구조

나침반 껍데기 대신 다음 순서의 한 화면 레이아웃을 사용한다.

```text
현재 방향       동쪽
다음 행동       120m 뒤 오른쪽
안내 문구       오른쪽으로 돌아 테스트길로 들어가요
전체 남은 거리  680m
대표 메뉴       국수
가격대          중간
안내 멈추기
```

다음 행동은 큰 텍스트와 방향 화살표로 먼저 읽히고, 현재 방향과 전체 남은 거리는 별도 요약 영역으로 항상 보인다. 지도는 넣지 않는다. Stop은 기존처럼 안내를 즉시 일시정지시키며, 일시정지 중에는 행동 지시와 방향을 활성 상태로 표시하지 않는다.

## 정규화 경로 모델

상태 내부의 `route`는 제공자별 응답을 다음 형태로 정규화한다.

```js
{
  id: "route-1",
  distanceM: 850,
  bearingDeg: 40,
  steps: [
    {
      id: "step-1",
      maneuver: "STRAIGHT",
      instruction: "현재 길로 180m 직진해요",
      distanceM: 180,
      heading: "동쪽",
      road: "테스트로"
    }
  ]
}
```

`distanceM`은 최초 경로의 전체 길이이고, 현재 남은 거리는 기존 `state.distanceM`을 계속 사용한다. 공개 뷰는 전체 `steps`를 노출하지 않고, 신뢰 가능한 경우 현재 방향·현재 단계·단계까지 거리·전체 남은 거리만 계산해 노출한다.

## 실제 API 연결 방향

프로토타입은 목업 `steps`를 사용한다. 실제 서비스는 제공자 키와 목적지 좌표를 앱에 넣지 않고 서버 경로 어댑터에서 처리한다.

```text
hidden destination session
→ backend route broker
→ provider walking route
→ provider response normalization
→ current/next step window + remaining distance
→ iOS guidance client
```

Google Routes API는 `WALK` 경로와 `legs.steps.navigationInstruction.maneuver/instructions`, 단계 거리 필드를 제공한다. Compute Routes는 필요한 필드만 field mask로 요청해야 하며, 보행 모드는 베타이고 보행로 누락 가능성 경고가 필요하다. 현재 공식 사용량 문서에는 Compute Routes 분당 3,000쿼리 제한이 있으며, 위치 샘플마다 호출하지 않고 최초 계산·단계 전환·오프루트 때만 재계산한다.

Apple `MKDirections`는 iOS에서 보행 `MKRoute.steps`와 단계별 `instructions`·`distance`를 제공하므로 실기기 1차 검증에 사용한다. 다만 목적지 비공개를 유지하려면 앱이 목적지 좌표와 전체 경로를 직접 보유하지 않는 서버 중계가 우선이다.

Kakao Mobility 보행 API는 상세 보행 경로와 최대 5개 경유지를 제공하지만 REST 키와 파트너 승인 절차가 필요하다. NAVER Cloud Directions 5 공식 문서는 현재 운전 경로 중심으로 확인되어 보행 경로 1순위로 확정하지 않는다.

공식 자료 확인일: 2026-08-12.

- [Apple MKDirections](https://developer.apple.com/documentation/mapkit/mkdirections)
- [Apple MKRoute.steps](https://developer.apple.com/documentation/mapkit/mkroute/steps)
- [Google Routes route response](https://developers.google.com/maps/documentation/routes/understand-route-response)
- [Google walking travel mode](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode)
- [Google Routes usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- [Kakao Mobility walking directions](https://developers.kakaomobility.com/affiliate-en/walking/directions)
- [Kakao Mobility getting started](https://developers.kakaomobility.com/affiliate-en/walking/start.html)
- [NAVER Cloud Maps overview](https://api.ncloud-docs.com/docs/en/ainaverapi-maps-overview)

## 오류·안전 동작

- 위치·heading·route confidence가 준비되지 않으면 회전 지시를 숨긴다.
- 오프루트 또는 오래된 단계는 다음 회전으로 보정하지 않고 재계산 상태로 전환한다.
- Stop은 항상 보이고 즉시 일시정지한다.
- 목적지 비공개는 회전·거리 공개와 독립적으로 유지한다.
- 실제 API 키 발급, 계정 생성, 약관 동의, 결제 설정, 공급자 승인 요청은 이 구현 범위에 포함하지 않는다.

## 검증 기준

- Following과 near에 나침반 바늘 대신 턴바이턴 정보가 표시된다.
- 현재 방향·다음 행동·다음 행동까지 거리·전체 남은 거리가 함께 표시된다.
- 공개 뷰와 HTML에 목적지 이름·주소가 나타나지 않는다.
- route recovery·recomputing·paused에는 새로운 회전 지시가 나타나지 않는다.
- 목업 보행으로 다음 단계와 전체 남은 거리가 감소한다.
- 320px 폭에서도 텍스트가 잘리지 않고 Stop이 보인다.
- 기존 Stop·Reveal·arrival 흐름과 전체 테스트가 유지된다.
