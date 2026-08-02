import SwiftUI

struct CompassView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection

    var body: some View {
        VStack(spacing: 24) {
            Text(projection.phase == .near ? "거의 다 왔어요" : "방향을 따라 걸어보세요")
                .font(.headline)
            Spacer()
            arrow
            if case .credible(let reading) = store.guidance {
                Text("약 \(Int(reading.remainingM))m")
                    .font(.title2.monospacedDigit())
                    .accessibilityLabel("남은 경로 약 \(Int(reading.remainingM))미터")
            } else if let disclosure = projection.disclosure {
                Text("약 \(Int(disclosure.routeDistanceM))m · \(Int(disclosure.routeDurationMinutes))분")
                    .font(.title2.monospacedDigit())
                Text(disclosure.representativeCategories.joined(separator: " · "))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 12) {
                if projection.actions.contains(.commit) {
                    Button("안내 시작") { Task { await store.commit() } }
                        .buttonStyle(.borderedProminent)
                        .frame(minHeight: 44)
                        .accessibilityLabel("숨은 목적지 안내 시작")
                }
                if projection.actions.contains(.cancel) {
                    Button("선택 취소") { Task { await store.cancelSelection() } }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityLabel("숨은 목적지 선택 취소")
                }
                if projection.actions.contains(.stop) {
                    Button("멈춤") { store.requestStop() }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityLabel("여정 즉시 멈춤")
                }
                if projection.actions.contains(.reveal) {
                    Button("공개") { Task { await store.reveal() } }
                        .buttonStyle(.borderedProminent)
                        .frame(minHeight: 44)
                        .accessibilityLabel("목적지 공개")
                }
                if projection.actions.contains(.routeRecover) {
                    Button("안내 복구") { Task { await store.recoverRoute() } }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                        .accessibilityLabel("경로 안내 다시 계산")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("경로 나침반 안내")
    }

    @ViewBuilder private var arrow: some View {
        switch store.guidance {
        case .credible(let reading):
            Image(systemName: "location.north.fill")
                .font(.system(size: 96, weight: .light))
                .rotationEffect(.degrees(reading.arrowDegrees))
                .animation(.easeOut(duration: 0.25), value: reading.arrowDegrees)
                .accessibilityLabel("신뢰 가능한 진행 방향")
        case .suppressed:
            Image(systemName: "location.slash")
                .font(.system(size: 72, weight: .light))
                .foregroundStyle(.secondary)
                .accessibilityLabel("방향 신뢰도 낮음, 잠시 멈춰 확인하세요")
        }
    }
}
