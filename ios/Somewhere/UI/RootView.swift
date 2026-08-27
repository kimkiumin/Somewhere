import SwiftUI

struct RootView: View {
    @ObservedObject var store: JourneyStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        GeometryReader { proxy in
            let layout = SomewhereLayoutMetrics.resolve(
                width: proxy.size.width,
                height: proxy.size.height,
                isAccessibilitySize: dynamicTypeSize.isAccessibilitySize
            )

            ZStack {
                SomewhereBackground()
                SomewhereBoundedSurface { rootContent }
                    .padding(.horizontal, layout.horizontalPadding)
                    .padding(.vertical, 18)
                    .safeAreaInset(edge: .top, spacing: 8) {
                        if let error = store.presentedError {
                            errorBanner(error)
                                .frame(maxWidth: layout.contentMaxWidth)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 8)
                        }
                    }
            }
            .environment(\.somewhereLayout, layout)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("somewhere.layout.\(layout.mode.rawValue)")
            .sheet(isPresented: $store.showsStopConfirmation) {
                SomewhereBoundedSheet {
                    StopConfirmationView(store: store)
                }
                .environment(\.somewhereLayout, layout)
            }
            .sheet(isPresented: $store.showsFeedback) {
                SomewhereBoundedSheet {
                    FeedbackView(store: store)
                }
                .environment(\.somewhereLayout, layout)
            }
            .sheet(isPresented: $store.showsRevealReason) {
                SomewhereBoundedSheet {
                    RevealReasonView(store: store)
                }
                .environment(\.somewhereLayout, layout)
            }
            .sheet(isPresented: $store.showsExternalMapWarning) {
                SomewhereBoundedSheet {
                    ExternalMapWarningView(store: store)
                }
                .environment(\.somewhereLayout, layout)
            }
            .sheet(isPresented: $store.showsProfileSetup) {
                SomewhereBoundedSheet {
                    ProfileSettingsView(profile: store.profile) { dietary, allergies in
                        store.saveProfile(dietary: dietary, allergies: allergies)
                    }
                }
                .environment(\.somewhereLayout, layout)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    store.notificationController.refreshFallback()
                    if let projection = store.projection { store.locationController.apply(phase: projection.phase) }
                } else {
                    store.applicationDidEnterBackground()
                }
            }
            // The V2 surface is intentionally a warm, light canvas. On a device
            // configured for Dark Mode, SwiftUI's default text color becomes white
            // while this custom background remains light, making the UI unreadable.
            .preferredColorScheme(.light)
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        if store.showsNoFit {
            NoFitView(store: store)
        } else if let projection = store.projection {
            journey(projection)
        } else if store.isOnboardingRequired {
            OnboardingView { store.completeOnboarding() }
        } else {
            ConstraintView(store: store)
        }
    }

    private func errorBanner(_ error: JourneyStoreError) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(errorMessage(error))
                .font(.footnote)
                .multilineTextAlignment(.leading)
                .accessibilityLabel("여정 오류: \(errorMessage(error))")
                .accessibilityIdentifier("somewhere.error-message")
            Spacer(minLength: 0)
            Button("닫기") { store.dismissError() }
                .frame(minHeight: 44)
                .accessibilityLabel("오류 안내 닫기")
                .accessibilityIdentifier("somewhere.error-dismiss")
        }
        .padding(.horizontal, 16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.8), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("somewhere.error")
    }

    private func errorMessage(_ error: JourneyStoreError) -> String {
        switch error {
        case .unavailable: "연결이나 위치를 확인하고 다시 시도해 주세요."
        case .invalidTransition: "지금은 이 동작을 진행할 수 없어요."
        case .sequenceConflict: "최신 여정 상태로 다시 맞췄어요."
        case .expired: "여정이 만료되었어요."
        case .protocolViolation: "안전한 응답을 확인하지 못했어요."
        case .noFit: "현재 조건에 맞는 장소를 찾지 못했어요."
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
            ArrivalView(store: store, projection: projection)
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
