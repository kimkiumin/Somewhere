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
        let service: any JourneyServiceProtocol
        if let value = Bundle.main.object(forInfoDictionaryKey: "SomewhereAPIOrigin") as? String,
           let origin = URL(string: value),
           let api = try? APIClient(origin: origin) {
            service = APIJourneyService(api: api)
        } else {
            service = UnconfiguredJourneyService()
        }
        let value = JourneyStore(service: service)
        #if DEBUG
        if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--ui-test-state"),
           ProcessInfo.processInfo.arguments.indices.contains(index + 1),
           let projection = UITestProjectionFactory.make(ProcessInfo.processInfo.arguments[index + 1]) {
            value.applyServerProjection(projection)
        }
        #endif
        _store = StateObject(wrappedValue: value)
    }

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
        }
    }
}

#if DEBUG
private enum UITestProjectionFactory {
    static func make(_ state: String) -> JourneyProjection? {
        let common = #""contractVersion":1,"journeyId":"j_v1.AAAAAAAAAAAAAAAAAAAAAA","sequence":1"#
        let disclosure = #""disclosure":{"routeDistanceM":700,"routeDurationMinutes":10,"representativeCategories":["cafe"],"priceBand":"medium","policyVersion":"policy-v1"}"#
        let json: String
        switch state {
        case "following":
            json = "{\(common),\(disclosure),\"phase\":\"following\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000},\"actions\":[\"reveal\",\"stop\",\"route-recover\",\"arrival\"]}"
        case "arrived-unrevealed":
            json = "{\(common),\(disclosure),\"phase\":\"arrived\",\"revealed\":false,\"feedbackDueAt\":4102444800000,\"actions\":[\"reveal\"]}"
        case "expired":
            json = "{\(common),\"phase\":\"expired\",\"actions\":[]}"
        default: return nil
        }
        return try? JSONDecoder().decode(JourneyProjection.self, from: Data(json.utf8))
    }
}
#endif
