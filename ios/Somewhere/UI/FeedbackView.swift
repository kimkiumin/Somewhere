import SwiftUI

struct FeedbackView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 18)
            VStack(spacing: 14) {
                Text(RollCompassBrand.name)
                    .font(RollCompassBrand.wordmarkFont(size: 25))
                    .foregroundStyle(SomewherePalette.ink)
                    .accessibilityLabel("Roll the compass")
                    .accessibilityIdentifier("somewhere.feedback-brand")
                SomewhereCompass(mode: .ready, size: 92)
                    .accessibilityHidden(true)
                SomewhereSignalPill(icon: "bubble.left.and.bubble.right.fill", title: "마지막 신호", tint: SomewherePalette.accent)
                Text("그곳은 어땠나요?")
                    .font(.system(.title2, design: .serif).weight(.bold))
                    .foregroundStyle(SomewherePalette.ink)
                Text("다음 숨은 목적지를 더 잘 고르는 데만 사용해요.")
                    .font(.subheadline)
                    .foregroundStyle(SomewherePalette.mutedInk)
                    .multilineTextAlignment(.center)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        reactionButtons
                    }
                    VStack(spacing: 10) {
                        reactionButtons
                    }
                }
                Button("방문하지 않았어요") {
                    SomewhereHaptics.impact()
                    Task { await store.submitFeedback("did_not_visit") }
                }
                .buttonStyle(SomewhereSecondaryButtonStyle())
                .frame(maxWidth: .infinity)
                .accessibilityLabel("피드백 방문하지 않았어요")
                .accessibilityIdentifier("somewhere.feedback.did_not_visit")
            }
            Spacer(minLength: 18)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SomewherePalette.canvas)
        .presentationBackground(SomewherePalette.canvas)
    }

    @ViewBuilder
    private var reactionButtons: some View {
        reactionButton(label: "별로예요", value: "dislike", icon: "hand.thumbsdown.fill", tint: SomewherePalette.accent)
        reactionButton(label: "좋아요", value: "like", icon: "hand.thumbsup.fill", tint: SomewherePalette.success)
    }

    private func reactionButton(label: String, value: String, icon: String, tint: Color) -> some View {
        Button {
            SomewhereHaptics.impact()
            Task { await store.submitFeedback(value) }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2.weight(.semibold))
                Text(label)
            }
        }
        .buttonStyle(SomewhereReactionButtonStyle(tint: tint))
        .accessibilityLabel("피드백 \(label)")
        .accessibilityIdentifier("somewhere.feedback.\(value)")
    }
}
