import SwiftUI

struct RevealReasonView: View {
    @ObservedObject var store: JourneyStore

    private let reasons: [(String, String, String)] = [
        ("safety", "안전 확인", "지금 위치를 확인해야 해요."),
        ("route_difficulty", "길이 어려워요", "목적지 정보를 보고 이동을 판단해요."),
        ("sensor_problem", "방향 신호가 불안정해요", "다른 방식으로 경로를 확인해요."),
        ("condition_check", "조건을 확인하고 싶어요", "장소 정보를 먼저 확인해요."),
        ("companion_check", "일행과 상의할게요", "함께 목적지를 확인해요."),
        ("curiosity", "그냥 궁금해요", "목적지를 지금 공개해요."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SomewhereSignalPill(icon: "eye.fill", title: "목적지 확인", tint: SomewherePalette.accent)
                    Text("왜 확인할까요?")
                        .font(.system(size: 30, weight: .bold, design: .serif))
                        .foregroundStyle(SomewherePalette.ink)
                    Text("목적지 이름과 주소가 공개돼요. 안내는 계속할 수 있어요.")
                        .font(.subheadline)
                        .foregroundStyle(SomewherePalette.mutedInk)
                    VStack(spacing: 10) {
                        ForEach(reasons, id: \.0) { reason in
                            Button {
                                SomewhereHaptics.impact()
                                Task { await store.submitRevealReason(reason.0) }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "arrow.up.right.circle")
                                        .foregroundStyle(SomewherePalette.accent)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(reason.1).font(.subheadline.weight(.semibold))
                                        Text(reason.2).font(.caption).foregroundStyle(SomewherePalette.mutedInk)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(SomewherePalette.mutedInk)
                                }
                                .padding(15)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(SomewherePalette.cardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SomewherePalette.border, lineWidth: 1) }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("공개 사유 \(reason.1)")
                            .accessibilityIdentifier("somewhere.reveal-reason.\(reason.0)")
                        }
                        Button {
                            SomewhereHaptics.impact()
                            Task { await store.submitRevealReason("skipped") }
                        } label: {
                            Text("사유를 건너뛰고 확인")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(SomewhereSecondaryButtonStyle())
                        .accessibilityLabel("공개 사유를 건너뛰고 목적지 확인")
                        .accessibilityIdentifier("somewhere.reveal-reason-skipped")
                    }
                }
                .padding(20)
            }
            .background(SomewherePalette.canvas.opacity(0.35))
            .navigationTitle("목적지 확인")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("취소") { store.showsRevealReason = false }
                        .accessibilityIdentifier("somewhere.reveal-reason-cancel")
                }
            }
        }
        .tint(SomewherePalette.accent)
    }
}

struct ExternalMapWarningView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 18) {
            SomewhereSignalPill(icon: "map.fill", title: "외부 지도", tint: SomewherePalette.accent)
            Image(systemName: "map.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(SomewherePalette.accent)
            Text("외부 지도를 열까요?")
                .font(.title2.weight(.bold))
                .foregroundStyle(SomewherePalette.ink)
            Text("외부 지도로 이동하면 목적지 이름과 위치가 공개돼요. Roll the compass!의 안내는 여기서 잠시 멈춰요.")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
                .multilineTextAlignment(.center)
            Button("지도 열고 목적지 공개") {
                SomewhereHaptics.impact()
                Task { await store.confirmExternalMapHandoff() }
            }
            .buttonStyle(SomewherePrimaryButtonStyle())
            .accessibilityLabel("외부 지도를 열고 목적지 공개")
            .accessibilityIdentifier("somewhere.external-map-confirm")
            Button("취소") { store.showsExternalMapWarning = false }
                .buttonStyle(SomewhereSecondaryButtonStyle())
                .accessibilityIdentifier("somewhere.external-map-cancel")
        }
        .padding(28)
        .presentationDetents([.medium])
    }
}

struct RouteRecoveryView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        SomewhereCard(padding: 18) {
            VStack(alignment: .leading, spacing: 12) {
                SomewhereSignalPill(icon: "location.slash.fill", title: "GUIDANCE RECOVERY", tint: SomewherePalette.accent)
                Text("어떻게 이어갈까요?")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                Text("선택하기 전에는 방향을 표시하지 않아요.")
                    .font(.subheadline)
                    .foregroundStyle(SomewherePalette.mutedInk)
                recoveryButton("나침반 다시 맞추기", icon: "safari", choice: "recalibrate")
                recoveryButton("경로 다시 찾기", icon: "arrow.triangle.2.circlepath", choice: "reroute")
                recoveryButton("확인된 경로 이어가기", icon: "point.topleft.down.to.point.bottomright.curvepath", choice: "cached-route")
            }
        }
    }

    private func recoveryButton(_ title: String, icon: String, choice: String) -> some View {
        Button {
            SomewhereHaptics.impact()
            Task { await store.recoverRoute(choice: choice) }
        } label: {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(SomewhereSecondaryButtonStyle())
        .accessibilityLabel(title)
        .accessibilityIdentifier("somewhere.route-recovery.\(choice)")
    }
}
