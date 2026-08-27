# 도보 턴바이턴 경로 API 검증 기록

검증일: 2026-08-12

범위: 목적지 이름·주소를 숨긴 상태에서 현재 방향, 다음 행동, 행동까지 거리, 전체 남은 거리를 제공할 수 있는지 확인한다. 아래 내용은 공식 1차 문서의 capability·가격·제한을 정리한 것이며 실제 키 발급, 로그인, 계약, 결제, API 호출은 수행하지 않았다.

## 결론

API가 제공하는 경로 단계 데이터를 이용해 화면을 구현할 수 있다. 프로토타입은 키 없는 고정 목업을 사용하고, 실제 서비스에서는 서버가 목적지 좌표와 제공자 자격증명을 보관하는 route broker를 둔다. 앱에는 현재 단계와 다음 단계에 필요한 최소 정보만 전달한다.

## 제공자 매트릭스

| 제공자 | 경로·단계 데이터 | 인증·운영 조건 | 제품 판단 |
|---|---|---|---|
| Apple MapKit | `MKDirections`의 walking route, `MKRoute.steps`, 단계별 `instructions`와 `distance` | iOS 앱의 MapKit·네트워크 사용. `MKDirections`는 서버 기반이며 과도한 요청 시 throttling 가능 | iOS 실기기 1차 spike에 적합. 목적지 비공개가 중요하면 전체 좌표를 앱에 보유하지 않는 서버 중계를 별도 설계 |
| Google Routes API | `travelMode: WALK`; `routes.legs.steps.navigationInstruction.maneuver/instructions`, step `distanceMeters`, route `distanceMeters` | 프로젝트에서 Routes API 활성화, API key 또는 OAuth, billing 필요. Compute Routes 3,000 QPM. 보행 모드는 beta이며 보행로 누락 가능성 경고 필수 | 다중 플랫폼 서버 어댑터 후보. 최초 경로·단계 전환·off-route 때만 호출하고 field mask로 필요한 필드만 요청 |
| Kakao Mobility Walking Directions | 상세 보행 경로, origin 1·destination 1·최대 5 waypoint | REST API key, 앱 등록과 파트너 승인 절차 필요 | 국내 상용 후보이나 계약·승인 gate가 먼저 필요 |
| NAVER Cloud Maps Directions 5 | 공식 개요·Directions 5 문서에서 현재 운전 경로와 waypoint 중심 확인 | Ncloud API Gateway 인증과 key ID/key 필요 | 보행 단계 API capability가 이 기록만으로 충분히 확인되지 않아 1순위에서 보류 |

## Google Routes API 요청 설계

최초 route broker 요청은 다음 필드를 사용한다.

```http
POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-Api-Key: <server-side key>
X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.localizedValues,routes.legs.steps.startLocation,routes.legs.steps.endLocation
```

```json
{
  "origin": { "location": { "latLng": { "latitude": 37.0, "longitude": 127.0 } } },
  "destination": { "location": { "latLng": { "latitude": 37.01, "longitude": 127.01 } } },
  "travelMode": "WALK",
  "languageCode": "ko",
  "units": "METRIC",
  "routeModifiers": { "avoidIndoor": true }
}
```

서버는 제공자 응답을 다음 내부 계약으로 정규화한다.

```js
{
  id,
  distanceM,
  steps: [{
    id,
    maneuver,
    instruction,
    distanceM,
    heading,
    road
  }]
}
```

앱에 보내는 guidance window는 `currentHeading`, `nextStep`, `distanceToNextM`, `remainingDistanceM`, `routeStatus`뿐이다. 목적지 좌표·전체 polyline·제공자 원본 응답은 앱으로 보내지 않는다. 위치 샘플마다 route API를 호출하지 않고, 최초 계산, 현재 단계 완료, 오프루트 판정, 경로 stale 만료 때만 재계산한다.

## 비용·쿼터 확인

Google 공식 가격표(2026-08-12 확인)는 Routes: Compute Routes Essentials에 월 10,000건 free usage cap, 이후 100,000건까지 1,000건당 5달러를 표시한다. 실제 비용 SKU는 요청 기능에 따라 Essentials/Pro/Enterprise로 달라질 수 있다. 공식 usage 문서는 Compute Routes 3,000 queries per minute와 intermediate waypoint 최대 25개를 명시한다. 프로젝트는 일일 quota를 별도로 설정해 비용을 제한해야 한다.

Apple 공식 문서는 일반적인 앱·개발자 ID별 고정 요청 한도를 제시하지 않지만, 짧은 시간에 과도하게 요청하면 `MKErrorLoadingThrottled`가 발생할 수 있다고 안내한다. 따라서 Apple 경로도 위치 변화마다 재요청하지 않는다.

## 개인정보·보안·약관 gate

- API key는 채팅, Git, 정적 브라우저 코드에 넣지 않는다.
- 서버 key는 API 제한과 애플리케이션 제한을 설정하고 일일 quota·비용 알림을 둔다.
- 목적지 좌표와 provider response는 서버 세션에만 보관하고 앱 로그·분석 이벤트에 기록하지 않는다.
- Google·Kakao·Apple의 지도/경로 데이터 표시, 저장, 캐시, attribution, 위치정보 약관은 실제 계약 전에 별도 확인한다.
- 보행 경로가 보도·보행로를 완전히 보장하지 않는 경우 방향을 안전 보장처럼 표현하지 않고 경로 신뢰도 상태를 표시한다.

## 공식 출처

- Apple, [MKDirections](https://developer.apple.com/documentation/mapkit/mkdirections), [MKRoute.steps](https://developer.apple.com/documentation/mapkit/mkroute/steps), [MKRoute.Step instructions/distance](https://developer.apple.com/documentation/mapkit/mkroute/step)
- Google, [Compute Routes overview](https://developers.google.com/maps/documentation/routes/compute-route-over), [route response steps and navigationInstruction](https://developers.google.com/maps/documentation/routes/understand-route-response), [WALK travel mode warning](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode), [usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing), [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing), [API key security guidance](https://codelabs.developers.google.com/api-key-management)
- Kakao Mobility, [Walking Directions](https://developers.kakaomobility.com/affiliate-en/walking/directions), [Getting Started and partner approval](https://developers.kakaomobility.com/affiliate-en/walking/start.html)
- NAVER Cloud, [Maps API overview](https://api.ncloud-docs.com/docs/en/ainaverapi-maps-overview), [Directions 5](https://api.ncloud-docs.com/docs/en/ai-naver-mapsdirections-driving)
