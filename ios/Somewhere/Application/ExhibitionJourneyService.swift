#if DEBUG
import CryptoKit
import Foundation

enum ExhibitionDemoRuntime {
    static var enabled: Bool {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--exhibition-demo") { return true }
        if arguments.contains(where: { $0.hasPrefix("--ui-test-") }) { return false }
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SomewhereExhibitionDemo") else {
            return false
        }
        return ["1", "true", "yes"].contains(String(describing: raw).lowercased())
    }
}

actor ExhibitionJourneyService: JourneyServiceProtocol {
    private var sequence = 0

    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        switch command {
        case .create, .createWithPreferences:
            guard current == nil else { throw JourneyStoreError.invalidTransition }
            return try make(.ready)
        case .commit:
            guard current?.phase == .ready else { throw JourneyStoreError.invalidTransition }
            return try make(.following)
        case .requestStop:
            guard let current, [.ready, .committed, .following, .near, .routeRecovery].contains(current.phase) else {
                throw JourneyStoreError.invalidTransition
            }
            return try make(.paused, revealed: current.revealed == true)
        case .cancelStop:
            guard let current, current.phase == .paused else { throw JourneyStoreError.invalidTransition }
            return try make(.following, revealed: current.revealed == true)
        case .confirmStop:
            guard let current, current.phase == .paused else { throw JourneyStoreError.invalidTransition }
            return try make(.stopped, revealed: current.revealed == true)
        case .reveal:
            guard let current, [.paused, .stopped, .completed].contains(current.phase) else {
                throw JourneyStoreError.invalidTransition
            }
            return try make(current.phase, revealed: true)
        case .skipStopReason, .recordStopReason:
            guard let current, current.phase == .stopped else { throw JourneyStoreError.invalidTransition }
            return try make(.completed, revealed: current.revealed == true)
        case .recoverRoute, .recoverRouteWithChoice:
            guard let current, [.following, .near, .paused, .routeRecovery].contains(current.phase) else {
                throw JourneyStoreError.invalidTransition
            }
            return try make(.following, revealed: current.revealed == true)
        case .recordArrival:
            guard let current, [.following, .near].contains(current.phase) else {
                throw JourneyStoreError.invalidTransition
            }
            return try make(.arrived, revealed: true)
        case .requestRecovery:
            guard let current, current.phase == .completed else { throw JourneyStoreError.invalidTransition }
            return try make(.completed, revealed: current.revealed == true)
        case .confirmRecovery, .confirmRecoveryWithPreferences:
            guard current?.phase == .completed else { throw JourneyStoreError.invalidTransition }
            return try make(.ready)
        case .refresh:
            guard let current else { throw JourneyStoreError.invalidTransition }
            return current
        case .cancelSelection, .submitFeedback:
            return nil
        }
    }

    private func make(_ phase: JourneyPhase, revealed: Bool = false) throws -> JourneyProjection {
        sequence += 1
        return try ExhibitionProjectionFactory.make(phase: phase, sequence: sequence, revealed: revealed)
    }
}

private enum ExhibitionProjectionFactory {
    private static let journeyId = "j_v1.RkVTVElWQUxERU1PSU9TQg"
    private static let stopConfirmationId = "sc_v1.RkVTVElWQUxERU1PSU9TQg"

    static func make(phase: JourneyPhase, sequence: Int, revealed: Bool) throws -> JourneyProjection {
        var payload: [String: Any] = [
            "contractVersion": 1,
            "journeyId": journeyId,
            "sequence": sequence,
            "phase": phase.rawValue,
            "revealed": revealed,
            "disclosure": [
                "routeDistanceM": 1_650,
                "routeDurationMinutes": 22,
                "representativeCategories": ["따뜻한 한식"],
                "priceBand": "medium",
                "policyVersion": "exhibition-v1",
            ],
        ]

        if revealed {
            payload["reveal"] = [
                "name": "소문난성수감자탕",
                "address": "서울특별시 성동구 연무장길 45",
                "building": "성수동 골목 안쪽",
                "floorUnit": "1층",
                "recommendationReason": "따뜻한 한 끼와 전시 무드에 어울리는 동네 식당",
                "reviewSummary": "오래 머물기보다 든든하게 식사하기 좋은 곳",
            ]
        }

        switch phase {
        case .ready:
            payload["actions"] = [JourneyAction.commit.rawValue, JourneyAction.stop.rawValue]
        case .following, .near:
            payload["guidance"] = try routeGuidance()
            payload["actions"] = [
                JourneyAction.stop.rawValue,
                JourneyAction.routeRecover.rawValue,
                JourneyAction.arrival.rawValue,
            ]
        case .paused:
            payload["phaseBeforePause"] = JourneyPhase.following.rawValue
            payload["stopConfirmationId"] = stopConfirmationId
            payload["stopConfirmation"] = ["copyVersion": "v1"]
            payload["routeRepair"] = ["status": "idle"]
            payload["actions"] = revealed
                ? [JourneyAction.continue.rawValue, JourneyAction.routeRecover.rawValue, JourneyAction.confirmStop.rawValue]
                : [JourneyAction.continue.rawValue, JourneyAction.routeRecover.rawValue, JourneyAction.confirmStop.rawValue, JourneyAction.reveal.rawValue]
        case .stopped:
            payload["stopReasonState"] = "required-or-skip"
            payload["actions"] = revealed
                ? [JourneyAction.recordReason.rawValue, JourneyAction.skipReason.rawValue]
                : [JourneyAction.recordReason.rawValue, JourneyAction.skipReason.rawValue, JourneyAction.reveal.rawValue]
        case .completed:
            payload["stopReasonState"] = "skipped"
            payload["recoveryExpiresAt"] = milliseconds(fromNow: 24 * 60 * 60)
            payload["actions"] = revealed
                ? [JourneyAction.recovery.rawValue]
                : [JourneyAction.reveal.rawValue, JourneyAction.recovery.rawValue]
        case .arrived:
            payload["feedbackDueAt"] = milliseconds(fromNow: 60 * 60)
            payload["actions"] = []
        default:
            throw JourneyStoreError.invalidTransition
        }

        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        return try JSONDecoder().decode(JourneyProjection.self, from: data)
    }

    private static func routeGuidance() throws -> [String: Any] {
        let coordinates = PhysicalFieldRouteReplay.coordinates
        guard let endpoint = coordinates.last else { throw JourneyStoreError.protocolViolation }
        let vertices = coordinates.map { [$0.longitude, $0.latitude] }
        let data = try JSONEncoder().encode(vertices)
        let encoded = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let canonical = String(
            format: "%.6f,%.6f",
            locale: Locale(identifier: "en_US_POSIX"),
            endpoint.latitude,
            endpoint.longitude
        )
        let digest = SHA256.hash(data: Data(canonical.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return [
            "kind": "route",
            "encodedPolyline": encoded,
            "routeDigest": "sha256:\(digest)",
            "routeVersion": "exhibition-v1",
            "expiresAt": milliseconds(fromNow: 24 * 60 * 60),
        ]
    }

    private static func milliseconds(fromNow seconds: TimeInterval) -> Int64 {
        Int64(Date().addingTimeInterval(seconds).timeIntervalSince1970 * 1_000)
    }
}
#endif
