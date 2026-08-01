import SwiftUI

struct RootView: View {
    @ObservedObject var store: JourneyStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Color(red: 0.95, green: 0.92, blue: 0.86).ignoresSafeArea()
            Group {
                if let projection = store.projection {
                    journey(projection)
                } else {
                    ConstraintView(store: store)
                }
            }
            .padding(24)
        }
        .accessibilityLabel("Somewhere 여정")
        .overlay(alignment: .top) {
            if let error = store.presentedError {
                HStack {
                    Text(errorMessage(error)).font(.footnote)
                    Button("닫기") { store.dismissError() }
                        .frame(minHeight: 44)
                        .accessibilityLabel("오류 안내 닫기")
                }
                .padding(.horizontal, 16)
                .background(.regularMaterial, in: Capsule())
                .padding(.top, 8)
                .accessibilityLabel("여정 오류: \(errorMessage(error))")
            }
        }
        .sheet(isPresented: $store.showsStopConfirmation) {
            StopConfirmationView(store: store)
        }
        .sheet(isPresented: $store.showsFeedback) {
            FeedbackView(store: store)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                store.notificationController.refreshFallback()
                if let projection = store.projection { store.locationController.apply(phase: projection.phase) }
            } else {
                store.locationController.applicationDidEnterBackground()
            }
        }
    }

    private func errorMessage(_ error: JourneyStoreError) -> String {
        switch error {
        case .unavailable: "연결이나 위치를 확인하고 다시 시도해 주세요."
        case .invalidTransition: "지금은 이 동작을 진행할 수 없어요."
        case .sequenceConflict: "최신 여정 상태로 다시 맞췄어요."
        case .expired: "여정이 만료되었어요."
        case .protocolViolation: "안전한 응답을 확인하지 못했어요."
        }
    }

    @ViewBuilder
    private func journey(_ projection: JourneyProjection) -> some View {
        switch projection.phase {
        case .finding, .ready, .committed, .following, .routeRecovery, .near, .paused:
            CompassView(store: store, projection: projection)
        case .stopped, .completed:
            RecoveryView(store: store, projection: projection)
        case .arrived:
            if projection.revealed == true { RevealView(projection: projection) }
            else { CompassView(store: store, projection: projection) }
        case .expired:
            VStack(spacing: 20) {
                Text("여정이 만료되었어요.").font(.title2)
                Button("처음으로") { store.resetLocal() }
                    .frame(minHeight: 44)
                    .accessibilityLabel("새 여정 시작")
            }
        }
    }
}
