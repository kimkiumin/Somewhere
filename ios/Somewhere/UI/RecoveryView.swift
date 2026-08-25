import SwiftUI

struct RecoveryView: View {
    @ObservedObject var store: JourneyStore
    let projection: JourneyProjection
    @Environment(\.somewhereLayout) private var layout

    private let stopReasons: [(String, String, String)] = [
        ("safety-concern", "안전이 걱정돼요", "안내를 끝내고 안전을 먼저 챙겨요."),
        ("route-or-sensor", "길 안내가 불안정해요", "센서·경로 문제를 기록해요."),
        ("hard-condition", "조건과 맞지 않아요", "다음 추천 전에 조건을 다시 봐요."),
        ("venue-situation", "장소 상황이 달라요", "장소에서 생긴 문제를 기록해요."),
        ("changed-mind", "마음이 바뀌었어요", "안내를 끝내고 선택을 다시 생각해요."),
        ("schedule-changed", "일정이 바뀌었어요", "오늘의 여정을 마쳐요."),
    ]

    var body: some View {
        Group {
            if layout.isExhibition {
                adaptiveContent
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                ScrollView(showsIndicators: false) {
                    adaptiveContent
                        .padding(.vertical, 8)
                }
            }
        }
    }

    @ViewBuilder
    private var adaptiveContent: some View {
        if layout.isExhibition {
            HStack(alignment: .top, spacing: layout.columnSpacing) {
                primaryPane.frame(maxWidth: .infinity)
                secondaryPane.frame(maxWidth: .infinity)
            }
        } else {
            VStack(spacing: 18) {
                primaryPane
                secondaryPane
            }
        }
    }

    private var primaryPane: some View {
        VStack(spacing: 18) {
            header
            if projection.revealed == true {
                RevealView(projection: projection)
            } else {
                statusCard
            }
        }
    }

    @ViewBuilder
    private var secondaryPane: some View {
        VStack(spacing: 18) {
            if projection.phase == .stopped {
                stopReasonPanel
            } else {
                completionActions
            }
        }
    }

    private var header: some View {
        HStack {
            Button {
                if projection.actions.contains(.reveal) { store.requestReveal() }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                    .frame(width: 42, height: 42)
                    .background(SomewherePalette.cardStrong, in: Circle())
                    .overlay { Circle().stroke(SomewherePalette.border, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("뒤로가기")
            .accessibilityIdentifier("somewhere.back")
            .disabled(!projection.actions.contains(.reveal))
            VStack(alignment: .leading, spacing: 3) {
                Text(RollCompassBrand.name)
                    .font(RollCompassBrand.wordmarkFont(size: 22))
                Text(projection.phase == .stopped ? "안전하게 종료됨" : "여정 완료")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
            Spacer()
            SomewhereSignalPill(
                icon: projection.revealed == true ? "eye.fill" : "eye.slash.fill",
                title: projection.revealed == true ? "공개됨" : "보물 숨김",
                tint: projection.revealed == true ? SomewherePalette.success : SomewherePalette.accent
            )
        }
    }

    private var statusCard: some View {
        SomewhereCard(padding: 22) {
            VStack(spacing: 12) {
                Image(systemName: projection.phase == .completed ? "flag.checkered" : "pause.circle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(SomewherePalette.accent)
                Text(projection.phase == .completed ? "여정이 끝났어요" : "안전하게 멈췄어요")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                Text(projection.phase == .completed
                    ? "필요한 순간에 멈출 수 있도록 설계된 여정이에요."
                    : "답하지 않아도 바로 나갈 수 있어요. 이유는 다음 추천을 더 안전하게 만드는 데만 사용해요.")
                    .font(.subheadline)
                    .foregroundStyle(SomewherePalette.mutedInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var stopReasonPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("중단한 이유가 있나요?")
                .font(.title3.weight(.bold))
                .foregroundStyle(SomewherePalette.ink)
            Text("선택하지 않고 건너뛰어도 바로 나갈 수 있어요.")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
            if layout.isExhibition {
                ScrollView(showsIndicators: true) {
                    stopReasonList
                }
                .frame(maxHeight: 390)
            } else {
                stopReasonList
            }
            skipStopReasonButton
        }
    }

    @ViewBuilder
    private var stopReasonList: some View {
        ForEach(stopReasons, id: \.0) { reason in
            Button {
                SomewhereHaptics.impact()
                Task { await store.submitStopReason(reason.0) }
            } label: {
                HStack(spacing: 11) {
                    Image(systemName: "circle")
                        .foregroundStyle(SomewherePalette.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(reason.1).font(.subheadline.weight(.semibold))
                        Text(reason.2).font(.caption).foregroundStyle(SomewherePalette.mutedInk)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(SomewherePalette.ink)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SomewherePalette.cardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SomewherePalette.border, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("중단 이유 \(reason.1)")
            .accessibilityIdentifier("somewhere.stop-reason.\(reason.0)")
        }
    }

    private var skipStopReasonButton: some View {
        Button("건너뛰기") {
            Task { await store.skipStopReason() }
        }
        .buttonStyle(SomewhereSecondaryButtonStyle())
        .accessibilityLabel("멈춘 이유 건너뛰기")
        .accessibilityIdentifier("somewhere.skip-stop-reason")
    }

    private var completionActions: some View {
        VStack(spacing: 10) {
            if projection.actions.contains(.reveal) {
                Button("목적지 확인") {
                    SomewhereHaptics.success()
                    store.requestReveal()
                }
                .buttonStyle(SomewherePrimaryButtonStyle())
                .accessibilityLabel("종료된 목적지 공개")
                .accessibilityIdentifier("somewhere.recovery-reveal")
            }
            if projection.revealed == true {
                Button("외부 지도 열기") { store.requestExternalMap() }
                    .buttonStyle(SomewhereSecondaryButtonStyle())
                    .accessibilityIdentifier("somewhere.external-map")
            }
            if projection.actions.contains(.recovery) {
                if store.showsRecoveryReview {
                    SomewhereCard(padding: 15) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("조건을 다시 확인해요")
                                .font(.headline.weight(.bold))
                            Text("최근 안내 종료: \(stopReasonTitle)")
                                .font(.subheadline.weight(.semibold))
                            Text(recoverySummary)
                                .font(.subheadline)
                                .foregroundStyle(SomewherePalette.mutedInk)
                            Text("이전 장소는 제외하고 새 목적지 한 곳을 찾아요.")
                                .font(.caption)
                                .foregroundStyle(SomewherePalette.mutedInk)
                            recoveryReviewToggle
                        }
                    }
                    Button("확인하고 다시 찾기") {
                        SomewhereHaptics.impact()
                        Task { await store.confirmRecovery() }
                    }
                    .buttonStyle(SomewherePrimaryButtonStyle())
                    .disabled(!store.recoveryReviewAcknowledged)
                    .opacity(store.recoveryReviewAcknowledged ? 1 : 0.55)
                    .accessibilityLabel("조건 확인 후 새 추천 요청")
                    .accessibilityIdentifier("somewhere.confirm-recovery")
                    Button("취소") { store.cancelRecoveryReview() }
                        .buttonStyle(SomewhereSecondaryButtonStyle())
                        .accessibilityIdentifier("somewhere.cancel-recovery")
                } else {
                    Button("새 추천 검토") {
                        SomewhereHaptics.impact()
                        Task { await store.requestRecovery() }
                    }
                    .buttonStyle(SomewherePrimaryButtonStyle())
                    .accessibilityLabel("종료 후 새 추천 검토")
                    .accessibilityIdentifier("somewhere.request-recovery")
                }
            }
        }
    }

    @ViewBuilder
    private var recoveryReviewToggle: some View {
        if layout.isExhibition {
            HStack(spacing: 12) {
                Text("종료 이유와 새 조건을 확인했어요")
                    .font(.body)
                Spacer(minLength: 12)
                Toggle("", isOn: $store.recoveryReviewAcknowledged)
                    .labelsHidden()
                    .tint(SomewherePalette.accent)
                    .accessibilityLabel("종료 이유와 새 조건을 확인했어요")
                    .accessibilityIdentifier("somewhere.recovery-reviewed")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Toggle("종료 이유와 새 조건을 확인했어요", isOn: $store.recoveryReviewAcknowledged)
                .tint(SomewherePalette.accent)
                .accessibilityIdentifier("somewhere.recovery-reviewed")
        }
    }

    private var recoverySummary: String {
        let value = store.preferences
        let budget = value.budgetTitle
        return "\(value.partySize == 5 ? "5명 이상" : "\(value.partySize)명") · 최대 \(value.maxWalkMinutes)분 · \(budget)"
    }

    private var stopReasonTitle: String {
        switch store.lastStopReason {
        case "safety-concern": return "안전 문제"
        case "route-or-sensor": return "경로 또는 센서 문제"
        case "hard-condition": return "필수 조건 불일치"
        case "venue-situation": return "장소 현장 문제"
        case "changed-mind": return "단순 변심"
        case "schedule-changed": return "일정 변경"
        case "skip": return "이유 건너뜀"
        default: return "종료 이유 확인 필요"
        }
    }
}
