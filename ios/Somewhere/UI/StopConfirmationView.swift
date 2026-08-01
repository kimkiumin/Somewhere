import SwiftUI

struct StopConfirmationView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 20) {
            Text("안내를 멈췄어요").font(.title2.weight(.semibold))
            Text("같은 여정을 계속하거나 안전하게 끝낼 수 있어요.")
                .multilineTextAlignment(.center)
            Button("계속하기") { Task { await store.cancelStop() } }
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
                .accessibilityLabel("같은 여정 계속하기")
            Button("여정 끝내기", role: .destructive) { Task { await store.confirmStop() } }
                .frame(minHeight: 44)
                .accessibilityLabel("여정 종료 확인")
        }
        .padding(28)
        .accessibilityLabel("멈춤 확인")
    }
}
