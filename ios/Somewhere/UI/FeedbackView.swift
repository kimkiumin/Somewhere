import SwiftUI

struct FeedbackView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 16) {
            SomewhereSignalPill(icon: "bubble.left.and.bubble.right.fill", title: "ONE LAST SIGNAL", tint: SomewherePalette.accent)
            Text("그곳은 어땠나요?")
                .font(.title2.weight(.bold))
            Text("다음 숨은 목적지를 더 잘 고르는 데만 사용해요.")
                .font(.subheadline)
                .foregroundStyle(SomewherePalette.mutedInk)
                .multilineTextAlignment(.center)
            ForEach([("별로예요", "dislike"), ("좋아요", "like"), ("아주 좋아요", "love"), ("가지 않았어요", "did_not_visit")], id: \.1) { label, value in
                Button(label) {
                    SomewhereHaptics.impact()
                    Task { await store.submitFeedback(value) }
                }
                    .buttonStyle(SomewhereSecondaryButtonStyle())
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("피드백 \(label)")
                    .accessibilityIdentifier("somewhere.feedback.\(value)")
            }
        }
    }
}
