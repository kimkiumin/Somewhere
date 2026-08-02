import SwiftUI

struct FeedbackView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 16) {
            Text("그곳은 어땠나요?").font(.title2)
            ForEach([("별로예요", "dislike"), ("좋아요", "like"), ("아주 좋아요", "love"), ("가지 않았어요", "did_not_visit")], id: \.1) { label, value in
                Button(label) { Task { await store.submitFeedback(value) } }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .accessibilityLabel("피드백 \(label)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("도착지 피드백")
    }
}
