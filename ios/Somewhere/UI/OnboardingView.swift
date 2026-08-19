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
                Text("길은 보여주고,\n도착지는 숨겨둘게요.")
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundStyle(SomewherePalette.ink)
                    .multilineTextAlignment(.center)
                Text("방향과 거리만 따라가세요.\n도착하면 그곳을 공개해요.")
                    .font(.body)
                    .foregroundStyle(SomewherePalette.mutedInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            SomewhereCard(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Label("이름과 주소는 기본으로 숨겨요", systemImage: "eye.slash.fill")
                    Label("안전할 때 언제든 멈추거나 확인할 수 있어요", systemImage: "hand.raised.fill")
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
