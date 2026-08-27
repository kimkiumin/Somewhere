import SwiftUI

struct RevealReasonView: View {
    @ObservedObject var store: JourneyStore
    @Environment(\.somewhereLayout) private var layout

    private let reasons: [(String, String, String)] = [
        ("safety", "안전 확인", "지금 위치를 확인해야 해요."),
        ("route_difficulty", "길이 어려워요", "목적지 정보를 보고 이동을 판단해요."),
        ("sensor_problem", "방향 신호가 불안정해요", "다른 방식으로 경로를 확인해요."),
        ("condition_check", "조건을 확인하고 싶어요", "장소 정보를 먼저 확인해요."),
        ("companion_check", "일행과 상의할게요", "함께 목적지를 확인해요."),
        ("curiosity", "그냥 궁금해요", "목적지를 지금 공개해요."),
    ]

    var body: some View {
        SomewhereBoundedSheet {
            NavigationStack {
                Group {
                    if layout.isExhibition {
                        existingContent
                    } else {
                        ScrollView {
                            existingContent
                        }
                    }
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
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("somewhere.reveal-reason-surface")
            }
        }
        .tint(SomewherePalette.accent)
    }

    @ViewBuilder
    private var existingContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SomewhereSignalPill(icon: "eye.fill", title: "목적지 확인", tint: SomewherePalette.accent)
            Text("왜 확인할까요?")
                .font(.system(size: 30, weight: .bold, design: .serif))
                .foregroundStyle(SomewherePalette.ink)
            Text("목적지 이름과 주소가 공개돼요. 안내는 계속할 수 있어요.")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
            if layout.isExhibition {
                VStack(spacing: 10) {
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10),
                        ],
                        spacing: 10
                    ) {
                        ForEach(reasons, id: \.0) { reason in
                            reasonButton(reason, compact: true)
                        }
                    }
                    skipReasonButton
                }
            } else {
                VStack(spacing: 10) {
                    ForEach(reasons, id: \.0) { reason in
                        reasonButton(reason, compact: false)
                    }
                    skipReasonButton
                }
            }
        }
        .padding(20)
    }

    private func reasonButton(_ reason: (String, String, String), compact: Bool) -> some View {
        Button {
            SomewhereHaptics.impact()
            Task { await store.submitRevealReason(reason.0) }
        } label: {
            HStack(spacing: compact ? 9 : 12) {
                Image(systemName: "arrow.up.right.circle")
                    .foregroundStyle(SomewherePalette.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(reason.1)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                    Text(reason.2)
                        .font(.caption)
                        .foregroundStyle(SomewherePalette.mutedInk)
                        .lineLimit(compact ? 1 : 2)
                        .minimumScaleFactor(0.82)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(SomewherePalette.mutedInk)
            }
            .padding(compact ? 12 : 15)
            .frame(maxWidth: .infinity, minHeight: compact ? 68 : nil, alignment: .leading)
            .background(SomewherePalette.cardStrong, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(SomewherePalette.border, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("공개 사유 \(reason.1)")
        .accessibilityIdentifier("somewhere.reveal-reason.\(reason.0)")
    }

    private var skipReasonButton: some View {
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

struct ExternalMapWarningView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        SomewhereBoundedSheet {
            existingContent
                .padding(28)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("somewhere.external-map-warning-surface")
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private var existingContent: some View {
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
    }
}

struct RouteRecoveryView: View {
    @ObservedObject var store: JourneyStore
    var compact = false

    var body: some View {
        SomewhereCard(padding: compact ? 13 : 18) {
            VStack(alignment: .leading, spacing: compact ? 8 : 12) {
                if !compact {
                    SomewhereSignalPill(icon: "location.slash.fill", title: "안내 복구", tint: SomewherePalette.accent)
                }
                Text(compact ? "복구 방법" : "어떻게 이어갈까요?")
                    .font(compact ? .headline.weight(.bold) : .title3.weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                if !compact {
                    Text("선택하기 전에는 방향을 표시하지 않아요.")
                        .font(.subheadline)
                        .foregroundStyle(SomewherePalette.mutedInk)
                }
                recoveryButton(compact ? "나침반 맞추기" : "나침반 다시 맞추기", icon: "safari", choice: "recalibrate")
                recoveryButton(compact ? "새 경로 찾기" : "경로 다시 찾기", icon: "arrow.triangle.2.circlepath", choice: "reroute")
                recoveryButton(compact ? "기존 경로 계속" : "확인된 경로 이어가기", icon: "point.topleft.down.to.point.bottomright.curvepath", choice: "cached-route")
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
