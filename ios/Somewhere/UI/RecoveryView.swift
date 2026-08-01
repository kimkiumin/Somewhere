import SwiftUI

struct RecoveryView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection

    var body: some View {
        VStack(spacing: 20) {
            Text(projection.phase == .completed ? "여정이 끝났어요" : "안전하게 멈췄어요")
                .font(.title2.weight(.semibold))
            if projection.actions.contains(.reveal) {
                Button("목적지 공개") { Task { await store.reveal() } }
                    .frame(minHeight: 44)
                    .accessibilityLabel("종료된 목적지 공개")
            }
            if projection.phase == .stopped {
                Button("이유 건너뛰기") { Task { await store.skipStopReason() } }
                    .frame(minHeight: 44)
                    .accessibilityLabel("멈춘 이유 건너뛰기")
            }
            if projection.actions.contains(.recovery) {
                if store.showsRecoveryReview {
                    Text("카테고리 · 걷는 시간 · 예산을 다시 확인하고, 이전 장소를 제외한 새 추천을 요청해요.")
                        .font(.body)
                        .accessibilityLabel("새 추천 전 모든 조건 다시 확인")
                    Button("확인하고 다시 찾기") { Task { await store.confirmRecovery() } }
                        .buttonStyle(.borderedProminent)
                        .frame(minHeight: 44)
                        .accessibilityLabel("조건 확인 후 새 추천 요청")
                    Button("취소") { store.cancelRecoveryReview() }
                        .frame(minHeight: 44)
                        .accessibilityLabel("새 추천 검토 취소")
                } else {
                    Button("새 추천 검토") { Task { await store.requestRecovery() } }
                        .buttonStyle(.borderedProminent)
                        .frame(minHeight: 44)
                        .accessibilityLabel("종료 후 새 추천 검토")
                }
            }
        }
        .accessibilityLabel("여정 종료와 복구")
    }
}
