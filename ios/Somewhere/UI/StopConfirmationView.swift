import SwiftUI

struct StopConfirmationView: View {
    @ObservedObject var store: JourneyStore

    var body: some View {
        VStack(spacing: 20) {
            SomewhereSignalPill(icon: "pause.circle.fill", title: "SAFETY PAUSE", tint: SomewherePalette.accent)
            Image(systemName: "figure.walk.motion")
                .font(.system(size: 42))
                .foregroundStyle(SomewherePalette.accent)
            Text("정말 중단할까요?")
                .font(.title2.weight(.bold))
            Text("계속하면 같은 여정을 이어가고, 끝내면 방향 안내가 즉시 종료돼요.")
                .foregroundStyle(SomewherePalette.mutedInk)
                .multilineTextAlignment(.center)
            Button("계속하기") {
                SomewhereHaptics.impact()
                Task { await store.cancelStop() }
            }
                .buttonStyle(SomewherePrimaryButtonStyle())
                .accessibilityLabel("같은 여정 계속하기")
                .accessibilityIdentifier("somewhere.continue-journey")
            Button("목적지 정보 확인") {
                store.showsStopConfirmation = false
                store.requestReveal()
            }
            .buttonStyle(SomewhereSecondaryButtonStyle())
            .accessibilityLabel("중단 화면에서 목적지 정보 확인")
            .accessibilityIdentifier("somewhere.paused-reveal")
            Button("여정 끝내기", role: .destructive) {
                SomewhereHaptics.impact()
                Task { await store.confirmStop() }
            }
                .buttonStyle(SomewhereSecondaryButtonStyle())
                .accessibilityLabel("여정 종료 확인")
                .accessibilityIdentifier("somewhere.confirm-stop")
        }
        .padding(28)
    }
}
