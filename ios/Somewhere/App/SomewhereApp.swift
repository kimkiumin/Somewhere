import SwiftUI

private actor UnconfiguredJourneyService: JourneyServiceProtocol {
    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        throw JourneyStoreError.unavailable
    }
}

@main
struct SomewhereApp: App {
    @StateObject private var store: JourneyStore

    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-test-reset-preferences") {
            SomewherePreferencesPersistence.resetJourneyPreferencesForTesting()
        }
        #endif
        let service: any JourneyServiceProtocol
        if let value = Bundle.main.object(forInfoDictionaryKey: "SomewhereAPIOrigin") as? String,
           let origin = URL(string: value),
           let api = try? APIClient(origin: origin) {
            service = APIJourneyService(api: api)
        } else {
            service = UnconfiguredJourneyService()
        }
        #if DEBUG
        let suppressNotifications = ProcessInfo.processInfo.arguments.contains("--ui-test-no-notifications")
        #else
        let suppressNotifications = false
        #endif
        let notificationController = NotificationController(suppressScheduling: suppressNotifications)
        let physicalCompass: any PhysicalCompassClient
        let physicalCompassHostEnabled: Bool?
        #if DEBUG
        if let testState = Self.uiTestPhysicalCompassState() {
            physicalCompass = UITestPhysicalCompassClient(
                state: testState,
                action: Self.uiTestPhysicalCompassAction()
            )
            physicalCompassHostEnabled = true
        } else if Self.isUITestHarness() {
            physicalCompass = UITestPhysicalCompassClient(state: .disabled, action: nil)
            physicalCompassHostEnabled = false
        } else {
            physicalCompass = PhysicalCompassController()
            physicalCompassHostEnabled = nil
        }
        #else
        physicalCompass = PhysicalCompassController()
        physicalCompassHostEnabled = nil
        #endif
        let value = JourneyStore(
            service: service,
            notificationController: notificationController,
            physicalCompass: physicalCompass,
            physicalCompassHostEnabled: physicalCompassHostEnabled
        )
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-test-private") {
            var preferences = value.preferences
            preferences.disclosure = .privateMode
            value.updatePreferences(preferences)
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-category-cafe") {
            var preferences = value.preferences
            preferences.category = "cafe"
            value.updatePreferences(preferences)
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-no-fit") {
            value.presentNoFitForTesting()
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-recovery-review") {
            value.presentRecoveryReviewForTesting()
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-feedback") {
            value.presentFeedbackForTesting()
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-profile-settings") {
            value.showsProfileSetup = true
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-error") {
            value.presentErrorForTesting()
        }
        if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--ui-test-state"),
           ProcessInfo.processInfo.arguments.indices.contains(index + 1),
           let projection = UITestProjectionFactory.make(ProcessInfo.processInfo.arguments[index + 1]) {
            value.applyServerProjection(projection)
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-test-credible-guidance") {
            value.presentGuidanceForTesting()
        }
        #endif
        _store = StateObject(wrappedValue: value)
    }

    #if DEBUG
    private static func isUITestHarness() -> Bool {
        ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("--ui-test-") }
    }

    private static func uiTestPhysicalCompassState() -> PhysicalCompassConnectionState? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--ui-test-board-state"),
              arguments.indices.contains(index + 1) else { return nil }
        return switch arguments[index + 1] {
        case "disabled": .disabled
        case "unavailable": .unavailable
        case "disconnected": .disconnected
        case "scanning": .scanning
        case "connecting": .connecting
        case "stale": .stale
        case "connected": .connected
        default: nil
        }
    }

    private static func uiTestPhysicalCompassAction() -> PhysicalCompassAction? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--ui-test-board-event"),
              arguments.indices.contains(index + 1) else { return nil }
        return PhysicalCompassAction(rawValue: arguments[index + 1])
    }
    #endif

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
        }
    }
}

#if DEBUG
@MainActor
private final class UITestPhysicalCompassClient: PhysicalCompassClient {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)?
    var onEvent: ((PhysicalCompassEvent) -> Void)?
    var onSnapshotSent: ((Int) -> Void)?

    private var state: PhysicalCompassConnectionState
    private var pendingAction: PhysicalCompassAction?

    init(state: PhysicalCompassConnectionState, action: PhysicalCompassAction?) {
        self.state = state
        self.pendingAction = action
    }

    func start() {
        onConnectionState?(state)
    }

    func stop() {
        state = .disabled
        onConnectionState?(.disabled)
    }

    func send(_ snapshot: PhysicalCompassSnapshot) {
        guard state == .connected || state == .stale else { return }
        onSnapshotSent?(snapshot.sequence)
        if state == .stale {
            state = .connected
            onConnectionState?(.connected)
        }
        guard state == .connected,
              let action = pendingAction,
              snapshot.actions.contains(action) else { return }
        pendingAction = nil
        onEvent?(.action(action, sequence: snapshot.sequence))
    }
}
#endif

#if DEBUG
private enum UITestProjectionFactory {
    static func make(_ state: String) -> JourneyProjection? {
        let common = #""contractVersion":1,"journeyId":"j_v1.AAAAAAAAAAAAAAAAAAAAAA","sequence":1"#
        let disclosure = #""disclosure":{"routeDistanceM":700,"routeDurationMinutes":10,"representativeCategories":["한식 국물 요리"],"priceBand":"medium","policyVersion":"policy-v1"}"#
        let reveal = #""reveal":{"name":"소문난성수감자탕","address":"서울특별시 성동구 연무장길 45"}"#
        let json: String
        switch state {
        case "finding":
            json = "{\(common),\"phase\":\"finding\",\"pollAfterSeconds\":2,\"actions\":[\"poll\",\"cancel\"]}"
        case "ready":
            json = "{\(common),\(disclosure),\"phase\":\"ready\",\"revealed\":false,\"actions\":[\"commit\",\"stop\"]}"
        case "following":
            json = "{\(common),\(disclosure),\"phase\":\"following\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
        case "following-next-step":
            json = "{\(common),\(disclosure),\"phase\":\"following\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000,\"nextStep\":{\"maneuver\":\"TURN_RIGHT\",\"instruction\":\"오른쪽으로 이동\",\"distanceM\":180,\"road\":\"테스트로\"}},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
        case "following-next-step-unknown":
            json = "{\(common),\(disclosure),\"phase\":\"following\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000,\"nextStep\":{\"maneuver\":\"UNKNOWN\",\"instruction\":\"테스트로에서 우회전\",\"distanceM\":180,\"road\":\"테스트로\"}},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
        case "following-revealed":
            json = "{\(common),\(disclosure),\"phase\":\"following\",\"revealed\":true,\(reveal),\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
        case "near":
            json = "{\(common),\(disclosure),\"phase\":\"near\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
        case "route-recovery":
            json = "{\(common),\(disclosure),\"phase\":\"route-recovery\",\"revealed\":false,\"guidance\":{\"kind\":\"unavailable\",\"reason\":\"provider\"},\"actions\":[\"stop\",\"route-recover\"]}"
        case "arrived-revealed":
            json = "{\(common),\(disclosure),\"phase\":\"arrived\",\"revealed\":true,\(reveal),\"feedbackDueAt\":4102444800000,\"actions\":[]}"
        case "arrived-rich":
            json = "{\(common),\(disclosure),\"phase\":\"arrived\",\"revealed\":true,\(reveal),\"feedbackDueAt\":4102444800000,\"actions\":[]}"
        case "paused":
            json = "{\(common),\(disclosure),\"phase\":\"paused\",\"phaseBeforePause\":\"following\",\"stopConfirmationId\":\"sc_v1.AAAAAAAAAAAAAAAAAAAAAA\",\"stopConfirmation\":{\"copyVersion\":\"v1\"},\"routeRepair\":{\"status\":\"idle\"},\"revealed\":false,\"actions\":[\"continue\",\"route-recover\",\"confirm-stop\",\"reveal\"]}"
        case "stopped":
            json = "{\(common),\(disclosure),\"phase\":\"stopped\",\"stopReasonState\":\"required-or-skip\",\"revealed\":false,\"actions\":[\"record-reason\",\"skip-reason\",\"reveal\"]}"
        case "stopped-revealed":
            json = "{\(common),\(disclosure),\"phase\":\"stopped\",\"stopReasonState\":\"required-or-skip\",\"revealed\":true,\(reveal),\"actions\":[\"record-reason\",\"skip-reason\"]}"
        case "completed":
            json = "{\(common),\(disclosure),\"phase\":\"completed\",\"stopReasonState\":\"recorded\",\"recoveryExpiresAt\":4102444800000,\"revealed\":false,\"actions\":[\"reveal\",\"recovery\"]}"
        case "completed-revealed":
            json = "{\(common),\(disclosure),\"phase\":\"completed\",\"stopReasonState\":\"recorded\",\"recoveryExpiresAt\":4102444800000,\"revealed\":true,\(reveal),\"actions\":[\"recovery\"]}"
        case "expired":
            json = "{\(common),\"phase\":\"expired\",\"actions\":[]}"
        default: return nil
        }
        return try? JSONDecoder().decode(JourneyProjection.self, from: Data(json.utf8))
    }
}
#endif
