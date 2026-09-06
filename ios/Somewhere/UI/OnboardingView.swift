import SwiftUI

struct OnboardingView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 18)
            Text(RollCompassBrand.name)
                .font(RollCompassBrand.wordmarkFont(size: 38))
                .foregroundStyle(SomewherePalette.ink)
                .accessibilityLabel("Roll the compass")
            SomewhereCompass(mode: .ready, size: 236)
                .accessibilityLabel("출발 전 나침반")
            VStack(spacing: 12) {
                Text("목적지는 마지막에 만나요.")
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundStyle(SomewherePalette.ink)
                    .multilineTextAlignment(.center)
                Text("이름과 지도 대신,\n방향과 거리만 따라가요.")
                    .font(.body)
                    .foregroundStyle(SomewherePalette.mutedInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            SomewhereCard(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Label("이름과 주소는 도착할 때까지 숨겨요", systemImage: "eye.slash.fill")
                    Label("필요하면 언제든 멈추고 확인할 수 있어요", systemImage: "hand.raised.fill")
                    Label("도착 후 한 번만 장소를 물어봐요", systemImage: "bubble.left.fill")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SomewherePalette.mutedInk)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("목적지 이름과 주소는 기본으로 숨기고, 안전하게 멈추거나 확인할 수 있으며, 도착 후 장소 평가를 한 번만 요청해요")
            Spacer()
            Button("나침반 준비하기", action: onContinue)
                .buttonStyle(SomewherePrimaryButtonStyle())
                .accessibilityLabel("Roll the compass 시작하기")
                .accessibilityIdentifier("somewhere.onboarding-continue")
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 12)
    }
}
