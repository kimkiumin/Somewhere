import Foundation
import Security

private struct SessionResponse: Decodable, Sendable {
    let contractVersion: Int
    let csrfToken: String
    let csrfExpiresAt: Int64
    let sessionExpiresAt: Int64
}

private struct ContractOnlyBody: Encodable, Sendable { let contractVersion = 1 }
private struct StopBody: Encodable, Sendable { let contractVersion = 1; let stopConfirmationId: String }
private struct RouteRecoveryBody: Encodable, Sendable { let choice = "recalibrate"; let contractVersion = 1 }
private struct ArrivalBody: Encodable, Sendable {
    let contractVersion = 1
    let endpointDistanceBand = "within-arrival-threshold"
    let accuracyBand = "good"
    let consecutiveSamples = NavigationPolicy.arrivalConsecutiveSamples
    let dwellMs = NavigationPolicy.arrivalMinimumDwellMs
    let routeConsistency = "consistent"
}
private struct ArrivalResponse: Decodable, Sendable {
    let contractVersion: Int
    let feedbackCapability: String
    let requestId: String
    let result: JourneyProjection
}
private struct RecoveryIntentResponse: Decodable, Sendable {
    let contractVersion: Int
    let expiresAt: Int64
    let recoveryIntentId: String
    let requiredReviewFields: [String]
}
private struct RecoveryGrantResponse: Decodable, Sendable {
    let contractVersion: Int
    let expiresAt: Int64
    let previousDestinationExcluded: Bool
    let recoveryCapability: String
}
private struct RecoveryConfirmBody: Encodable, Sendable {
    let constraints: CreateBody.Constraints
    let contractVersion = 1
    let recoveryIntentId: String
    let reviewedFields: [String]
}
private struct CreateBody: Encodable, Sendable {
    struct Constraints: Encodable, Sendable {
        let category: String
        let maxWalkMinutes: Int
        let budgetBand: String
        let dietary: [String] = []
        let accessibility: [String] = []
    }
    struct Origin: Encodable, Sendable {
        let latitude: Double
        let longitude: Double
        let accuracyM: Double
        let capturedAt: Int64
    }
    let contractVersion = 1
    let constraints: Constraints
    let origin: Origin
    let disclosureLevel = "standard"
    let recoveryCapability: String?
}

actor APIJourneyService: JourneyServiceProtocol {
    private let api: APIClient
    private var csrfExpiresAt: Int64 = 0
    private var sessionExpiresAt: Int64 = 0
    private var pendingRecoveryIntent: RecoveryIntentResponse?
    private(set) var feedbackCapability: String?

    init(api: APIClient) { self.api = api }

    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        if case .submitFeedback = command {
            // Feedback capabilities are deliberately independent from the journey cookie session.
        } else {
            try await ensureSession()
        }
        do {
            switch command {
            case let .create(category, maxWalkMinutes, budgetBand, origin):
                let body = CreateBody(
                    constraints: .init(category: category, maxWalkMinutes: maxWalkMinutes, budgetBand: budgetBand),
                    origin: .init(
                        latitude: origin.coordinate.latitude,
                        longitude: origin.coordinate.longitude,
                        accuracyM: origin.horizontalAccuracyM,
                        capturedAt: Int64(origin.capturedAt.timeIntervalSince1970 * 1000)
                    ),
                    recoveryCapability: nil
                )
                return try await requestProjection("POST", "/journeys", current: nil, body: body)
            case .commit:
                return try await mutation("/journeys/:journeyId/commit", current: current, body: ContractOnlyBody())
            case .cancelSelection:
                guard let current else { throw JourneyStoreError.invalidTransition }
                try await api.deleteJourney(
                    endpoint: try endpoint("DELETE", "/journeys/:journeyId"),
                    journeyId: current.journeyId,
                    expectedSequence: current.sequence,
                    idempotencyKey: try idempotencyKey()
                )
                pendingRecoveryIntent = nil
                return nil
            case .reveal:
                return try await mutation("/journeys/:journeyId/reveal", current: current, body: ContractOnlyBody())
            case .requestStop:
                return try await mutation("/journeys/:journeyId/stop/request", current: current, body: ContractOnlyBody())
            case .cancelStop:
                return try await mutation("/journeys/:journeyId/stop/cancel", current: current, body: StopBody(stopConfirmationId: try stopId(current)))
            case .confirmStop:
                return try await mutation("/journeys/:journeyId/stop/confirm", current: current, body: StopBody(stopConfirmationId: try stopId(current)))
            case .skipStopReason:
                struct Reason: Encodable, Sendable { let contractVersion = 1; let reason = "skip"; let reasonPolicyVersion = "stop-reasons-v1" }
                return try await mutation("/journeys/:journeyId/stop/reason", current: current, body: Reason())
            case .recoverRoute:
                return try await mutation("/journeys/:journeyId/route/recover", current: current, body: RouteRecoveryBody())
            case .refresh:
                return try await api.request(
                    endpoint: try endpoint("GET", "/journeys/:journeyId"),
                    pathParameters: ["journeyId": try journeyId(current)],
                    body: Optional<EmptyRequestBody>.none,
                    expectedSequence: nil,
                    idempotencyKey: nil
                )
            case .recordArrival:
                let endpoint = try endpoint("POST", "/journeys/:journeyId/arrival")
                let value: ArrivalResponse = try await api.request(
                    endpoint: endpoint,
                    pathParameters: ["journeyId": try journeyId(current)],
                    body: ArrivalBody(),
                    expectedSequence: current?.sequence,
                    idempotencyKey: try idempotencyKey()
                )
                feedbackCapability = value.feedbackCapability
                try FeedbackCapabilityStore.save(value.feedbackCapability)
                return value.result
            case .requestRecovery:
                let endpoint = try endpoint("POST", "/journeys/:journeyId/recovery")
                struct Recovery: Encodable, Sendable { let action = "new-recommendation"; let contractVersion = 1 }
                let value: RecoveryIntentResponse = try await api.request(
                    endpoint: endpoint,
                    pathParameters: ["journeyId": try journeyId(current)],
                    body: Recovery(),
                    expectedSequence: current?.sequence,
                    idempotencyKey: try idempotencyKey()
                )
                guard value.contractVersion == 1,
                      value.recoveryIntentId.range(of: #"^ri_v1\.[A-Za-z0-9_-]{22}$"#, options: .regularExpression) != nil,
                      value.expiresAt > Int64(Date().timeIntervalSince1970 * 1000),
                      value.requiredReviewFields == ["all-constraints"] else {
                    throw JourneyStoreError.protocolViolation
                }
                pendingRecoveryIntent = value
                guard let current else { throw JourneyStoreError.protocolViolation }
                return current
            case let .confirmRecovery(category, maxWalkMinutes, budgetBand, origin):
                guard let current,
                      let intent = pendingRecoveryIntent,
                      intent.expiresAt > Int64(Date().timeIntervalSince1970 * 1000) else {
                    throw JourneyStoreError.invalidTransition
                }
                let constraints = CreateBody.Constraints(
                    category: category,
                    maxWalkMinutes: maxWalkMinutes,
                    budgetBand: budgetBand
                )
                let grant: RecoveryGrantResponse = try await api.request(
                    endpoint: try endpoint("POST", "/journeys/:journeyId/recovery/confirm"),
                    pathParameters: ["journeyId": current.journeyId],
                    body: RecoveryConfirmBody(
                        constraints: constraints,
                        recoveryIntentId: intent.recoveryIntentId,
                        reviewedFields: intent.requiredReviewFields
                    ),
                    expectedSequence: current.sequence + 1,
                    idempotencyKey: try idempotencyKey()
                )
                guard grant.contractVersion == 1,
                      grant.previousDestinationExcluded,
                      grant.expiresAt > Int64(Date().timeIntervalSince1970 * 1000),
                      grant.recoveryCapability.range(of: #"^rc_v1\.[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil else {
                    throw JourneyStoreError.protocolViolation
                }
                pendingRecoveryIntent = nil
                let body = CreateBody(
                    constraints: constraints,
                    origin: .init(
                        latitude: origin.coordinate.latitude,
                        longitude: origin.coordinate.longitude,
                        accuracyM: origin.horizontalAccuracyM,
                        capturedAt: Int64(origin.capturedAt.timeIntervalSince1970 * 1000)
                    ),
                    recoveryCapability: grant.recoveryCapability
                )
                return try await requestProjection("POST", "/journeys", current: nil, body: body)
            case let .submitFeedback(reaction):
                guard let capability = feedbackCapability ?? FeedbackCapabilityStore.load(),
                      let prompt = try await api.eligibleFeedback(capability: capability),
                      prompt.actions.contains(reaction),
                      prompt.dueAt <= Int64(Date().timeIntervalSince1970 * 1000),
                      prompt.expiresAt > Int64(Date().timeIntervalSince1970 * 1000) else {
                    throw JourneyStoreError.invalidTransition
                }
                try await api.recordReaction(
                    capability: capability,
                    feedbackId: prompt.feedbackId,
                    reaction: reaction,
                    idempotencyKey: try idempotencyKey()
                )
                feedbackCapability = nil
                FeedbackCapabilityStore.clear()
                return nil
            }
        } catch let error as APIClientError {
            if case .contract(_, let code, _, _, _) = error {
                if code == "sequence_conflict" { throw JourneyStoreError.sequenceConflict }
                if code == "journey_expired" { throw JourneyStoreError.expired }
            }
            throw JourneyStoreError.unavailable
        }
    }

    private func ensureSession() async throws {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if csrfExpiresAt > now, sessionExpiresAt > now { return }
        let value: SessionResponse = try await api.request(
            endpoint: try endpoint("GET", "/session"),
            pathParameters: [:],
            body: Optional<EmptyRequestBody>.none,
            expectedSequence: nil,
            idempotencyKey: nil
        )
        guard value.contractVersion == 1 else { throw JourneyStoreError.protocolViolation }
        csrfExpiresAt = value.csrfExpiresAt
        sessionExpiresAt = value.sessionExpiresAt
        await api.setCSRFToken(value.csrfToken)
    }

    private func mutation<Body: Encodable & Sendable>(_ path: String, current: JourneyProjection?, body: Body) async throws -> JourneyProjection {
        try await requestProjection("POST", path, current: current, body: body)
    }

    private func requestProjection<Body: Encodable & Sendable>(_ method: String, _ path: String, current: JourneyProjection?, body: Body) async throws -> JourneyProjection {
        try await api.request(
            endpoint: try endpoint(method, path),
            pathParameters: current.map { ["journeyId": $0.journeyId] } ?? [:],
            body: body,
            expectedSequence: current?.sequence,
            idempotencyKey: try idempotencyKey()
        )
    }

    private func endpoint(_ method: String, _ path: String) throws -> APIEndpoint {
        guard let value = WireContractV1.endpoints.first(where: { $0.method == method && $0.path == path }) else {
            throw JourneyStoreError.protocolViolation
        }
        return value
    }
    private func journeyId(_ current: JourneyProjection?) throws -> String {
        guard let value = current?.journeyId else { throw JourneyStoreError.invalidTransition }
        return value
    }
    private func stopId(_ current: JourneyProjection?) throws -> String {
        guard let value = current?.stopConfirmationId else { throw JourneyStoreError.invalidTransition }
        return value
    }
    private func idempotencyKey() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw JourneyStoreError.unavailable
        }
        return "ik_v1." + Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
