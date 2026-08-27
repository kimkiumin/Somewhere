import Foundation

enum JourneyPhase: String, Codable, Sendable {
    case finding, ready, committed, following, near, paused, stopped, completed, arrived, expired
    case routeRecovery = "route-recovery"
}

enum JourneyAction: String, Codable, CaseIterable, Sendable {
    case poll = "poll"
    case cancel = "cancel"
    case commit = "commit"
    case reveal = "reveal"
    case stop = "stop"
    case arrival = "arrival"
    case `continue` = "continue"
    case recovery = "recovery"
    case routeRecover = "route-recover"
    case confirmStop = "confirm-stop"
    case recordReason = "record-reason"
    case skipReason = "skip-reason"
}

struct SafeDisclosure: Codable, Equatable, Sendable {
    let routeDistanceM: Double
    let routeDurationMinutes: Double
    let representativeCategories: [String]
    let priceBand: String
    let policyVersion: String
}

struct RevealedIdentity: Codable, Equatable, Sendable {
    let name: String
    let address: String
    let photoURL: String?
    let building: String?
    let floorUnit: String?
    let recommendationReason: String?
    let reviewSummary: String?
}

struct RouteGuidance: Codable, Equatable, Sendable {
    let kind: String
    let encodedPolyline: String?
    let routeDigest: String?
    let routeVersion: String?
    let expiresAt: Int64?
    let reason: String?
    // Optional provider enrichment. The current server contract does not
    // require these fields, but the native surface can render the same
    // next-maneuver cue as the vNext prototype when a reviewed provider
    // starts returning it.
    let nextStep: RouteNavigationStep?
}

struct RouteNavigationStep: Codable, Equatable, Sendable {
    let maneuver: String?
    let instruction: String?
    let distanceM: Double?
    let road: String?
}

struct StopConfirmation: Codable, Equatable, Sendable {
    let copyVersion: String
}

struct RouteRepair: Codable, Equatable, Sendable {
    let status: String
    let choice: String?
    let routeVersion: String?
    let reason: String?
}

enum ProjectionContractError: Error, Equatable {
    case unsupportedContractVersion
    case invalidRevealBoundary
    case invalidActionCombination
    case invalidPhasePayload
}

struct JourneyProjection: Codable, Equatable, Sendable {
    let contractVersion: Int
    let journeyId: String
    let sequence: Int
    let phase: JourneyPhase
    let revealed: Bool?
    let disclosure: SafeDisclosure?
    let reveal: RevealedIdentity?
    let guidance: RouteGuidance?
    let pollAfterSeconds: Int?
    let phaseBeforePause: JourneyPhase?
    let stopConfirmationId: String?
    let stopConfirmation: StopConfirmation?
    let routeRepair: RouteRepair?
    let stopReasonState: String?
    let recoveryExpiresAt: Int64?
    let feedbackDueAt: Int64?
    let actions: [JourneyAction]

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = try values.decode(Int.self, forKey: .contractVersion)
        journeyId = try values.decode(String.self, forKey: .journeyId)
        sequence = try values.decode(Int.self, forKey: .sequence)
        phase = try values.decode(JourneyPhase.self, forKey: .phase)
        revealed = try values.decodeIfPresent(Bool.self, forKey: .revealed)
        disclosure = try values.decodeIfPresent(SafeDisclosure.self, forKey: .disclosure)
        reveal = try values.decodeIfPresent(RevealedIdentity.self, forKey: .reveal)
        guidance = try values.decodeIfPresent(RouteGuidance.self, forKey: .guidance)
        pollAfterSeconds = try values.decodeIfPresent(Int.self, forKey: .pollAfterSeconds)
        phaseBeforePause = try values.decodeIfPresent(JourneyPhase.self, forKey: .phaseBeforePause)
        stopConfirmationId = try values.decodeIfPresent(String.self, forKey: .stopConfirmationId)
        stopConfirmation = try values.decodeIfPresent(StopConfirmation.self, forKey: .stopConfirmation)
        routeRepair = try values.decodeIfPresent(RouteRepair.self, forKey: .routeRepair)
        stopReasonState = try values.decodeIfPresent(String.self, forKey: .stopReasonState)
        recoveryExpiresAt = try values.decodeIfPresent(Int64.self, forKey: .recoveryExpiresAt)
        feedbackDueAt = try values.decodeIfPresent(Int64.self, forKey: .feedbackDueAt)
        actions = try values.decode([JourneyAction].self, forKey: .actions)
        let raw = try decoder.container(keyedBy: AnyCodingKey.self)
        let allowedKeys = Set(CodingKeys.allCases.map(\.stringValue))
        guard Set(raw.allKeys.map(\.stringValue)).isSubset(of: allowedKeys) else {
            throw ProjectionContractError.invalidPhasePayload
        }
        try validateContract()
    }

    func validateContract() throws {
        guard contractVersion == 1, sequence >= 1 else {
            throw ProjectionContractError.unsupportedContractVersion
        }
        if revealed == true {
            guard reveal != nil else { throw ProjectionContractError.invalidRevealBoundary }
        } else if reveal != nil {
            throw ProjectionContractError.invalidRevealBoundary
        }

        let expected: [JourneyAction]
        switch (phase, revealed, recoveryExpiresAt != nil) {
        case (.finding, nil, _): expected = [.poll, .cancel]
        case (.ready, false?, _): expected = [.commit, .stop]
        case (.ready, true?, _): expected = [.commit, .stop]
        case (.committed, false?, _): expected = [.poll, .stop]
        case (.committed, true?, _): expected = [.poll, .stop]
        case (.following, false?, _), (.near, false?, _): expected = [.stop, .routeRecover, .arrival]
        case (.following, true?, _), (.near, true?, _): expected = [.stop, .routeRecover, .arrival]
        case (.routeRecovery, false?, _): expected = [.stop, .routeRecover]
        case (.routeRecovery, true?, _): expected = [.stop, .routeRecover]
        case (.paused, false?, _): expected = [.continue, .routeRecover, .confirmStop, .reveal]
        case (.paused, true?, _): expected = [.continue, .routeRecover, .confirmStop]
        case (.stopped, false?, _): expected = [.recordReason, .skipReason, .reveal]
        case (.stopped, true?, _): expected = [.recordReason, .skipReason]
        case (.completed, false?, true): expected = [.reveal, .recovery]
        case (.completed, true?, true): expected = [.recovery]
        case (.completed, false?, false): expected = [.reveal]
        case (.completed, true?, false), (.arrived, true?, _), (.expired, nil, _): expected = []
        default: throw ProjectionContractError.invalidPhasePayload
        }
        guard actions == expected else { throw ProjectionContractError.invalidActionCombination }
        if phase == .finding || phase == .expired {
            guard revealed == nil, disclosure == nil, guidance == nil else {
                throw ProjectionContractError.invalidPhasePayload
            }
        } else {
            guard let disclosure, revealed != nil,
                  disclosure.routeDistanceM.isFinite, disclosure.routeDistanceM >= 0,
                  disclosure.routeDurationMinutes.isFinite, disclosure.routeDurationMinutes >= 0,
                  (1...2).contains(disclosure.representativeCategories.count),
                  !disclosure.representativeCategories.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
                throw ProjectionContractError.invalidPhasePayload
            }
        }
        switch phase {
        case .committed:
            guard pollAfterSeconds != nil, guidance?.kind == "unavailable", guidance?.reason == "route-pending" else {
                throw ProjectionContractError.invalidPhasePayload
            }
        case .following, .near:
            guard validRouteGuidance(guidance) else { throw ProjectionContractError.invalidPhasePayload }
        case .routeRecovery:
            guard guidance?.kind == "unavailable", guidance?.reason != nil, guidance?.reason != "route-pending" else {
                throw ProjectionContractError.invalidPhasePayload
            }
        case .paused:
            guard phaseBeforePause != nil, stopConfirmationId != nil,
                  stopConfirmation != nil, routeRepair != nil else {
                throw ProjectionContractError.invalidPhasePayload
            }
        case .stopped:
            guard stopReasonState == "required-or-skip" else { throw ProjectionContractError.invalidPhasePayload }
        case .completed:
            guard stopReasonState == "recorded" || stopReasonState == "skipped" else {
                throw ProjectionContractError.invalidPhasePayload
            }
        case .arrived:
            guard feedbackDueAt != nil else { throw ProjectionContractError.invalidPhasePayload }
        default: break
        }
    }

    private func validRouteGuidance(_ value: RouteGuidance?) -> Bool {
        guard let value else { return false }
        return value.kind == "route" &&
            !(value.encodedPolyline ?? "").isEmpty &&
            value.routeDigest?.range(of: #"^sha256:[a-f0-9]{64}$"#, options: .regularExpression) != nil &&
            !(value.routeVersion ?? "").isEmpty &&
            value.expiresAt != nil && value.reason == nil
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case contractVersion, journeyId, sequence, phase, revealed, disclosure, reveal, guidance
        case pollAfterSeconds, phaseBeforePause, stopConfirmationId, stopConfirmation, routeRepair
        case stopReasonState, recoveryExpiresAt, feedbackDueAt, actions
    }
}

private struct AnyCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { self.intValue = intValue; stringValue = String(intValue) }
}
