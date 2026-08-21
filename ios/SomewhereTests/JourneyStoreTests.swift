import Combine
import XCTest
@testable import Somewhere

private actor FakeJourneyService: JourneyServiceProtocol {
    var response: JourneyProjection
    var commands: [JourneyCommand] = []
    init(response: JourneyProjection) { self.response = response }
    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        commands.append(command)
        return response
    }
    func capturedCommands() -> [JourneyCommand] { commands }
}

private actor SequenceConflictService: JourneyServiceProtocol {
    let response: JourneyProjection
    var commands: [JourneyCommand] = []
    init(response: JourneyProjection) { self.response = response }
    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        commands.append(command)
        if commands.count == 1 { throw JourneyStoreError.sequenceConflict }
        return response
    }
    func capturedCommands() -> [JourneyCommand] { commands }
}

private actor QueuedJourneyService: JourneyServiceProtocol {
    var responses: [JourneyProjection]
    var commands: [JourneyCommand] = []

    init(responses: [JourneyProjection]) { self.responses = responses }

    func perform(_ command: JourneyCommand, current: JourneyProjection?) async throws -> JourneyProjection? {
        commands.append(command)
        guard !responses.isEmpty else { throw JourneyStoreError.protocolViolation }
        return responses.removeFirst()
    }

    func capturedCommands() -> [JourneyCommand] { commands }
}

@MainActor
final class JourneyStoreTests: XCTestCase {
    func testReadyProjectionRemainsHidden() throws { XCTAssertNil(try projection(phase: "ready", revealed: false).reveal) }
    func testCommitUsesServerProjection() async throws {
        let store = try await store(phase: "committed")
        XCTAssertEqual(store.projection?.phase, .committed)
    }
    func testFollowingStartsGuidanceStateWithoutRevealAction() throws {
        let value = try projection(phase: "following", revealed: false)
        XCTAssertTrue(value.actions.contains(.stop))
        XCTAssertFalse(value.actions.contains(.reveal))
    }
    func testActiveUnrevealedProjectionCannotAdvertiseReveal() throws {
        for phase in ["ready", "committed", "following", "route-recovery", "near"] {
            let value = try projection(phase: phase, revealed: false)
            XCTAssertFalse(value.actions.contains(.reveal), phase)
        }
    }
    func testPausedSafetyRevealRemainsAvailable() throws {
        let value = try projection(phase: "paused", revealed: false)
        XCTAssertTrue(value.actions.contains(.reveal))
    }
    func testNearPreservesHiddenIdentity() throws { XCTAssertNil(try projection(phase: "near", revealed: false).reveal) }
    func testArrivedProjectionIsAlreadyRevealed() throws {
        let value = try projection(phase: "arrived", revealed: true)
        XCTAssertTrue(value.actions.isEmpty)
        XCTAssertNotNil(value.reveal)
    }
    func testRevealContainsIdentityOnlyAfterServerReveal() throws { XCTAssertNotNil(try projection(phase: "arrived", revealed: true).reveal) }
    func testStopPausesImmediately() async throws {
        let store = try await store(phase: "paused")
        store.requestStop()
        XCTAssertTrue(store.isGuidancePaused)
    }
    func testCancelStopResumesSameJourney() async throws {
        let store = try await store(phase: "following")
        XCTAssertEqual(store.projection?.phase, .following)
    }
    func testConfirmStopEndsGuidance() async throws {
        let store = try await store(phase: "stopped")
        XCTAssertEqual(store.projection?.phase, .stopped)
    }
    func testStopReasonCanBeSkipped() throws { XCTAssertTrue(try projection(phase: "stopped", revealed: false).actions.contains(.skipReason)) }
    func testRecoveryExistsOnlyAfterCompletion() throws { XCTAssertTrue(try projection(phase: "completed", revealed: true, recovery: true).actions.contains(.recovery)) }
    func testExpiredHasNoActions() throws { XCTAssertEqual(try projection(phase: "expired").actions, []) }
    func testRouteRecoveryDispatches() async throws {
        let following = try projection(phase: "following", revealed: false)
        let recovering = try projection(phase: "route-recovery", revealed: false)
        let service = FakeJourneyService(response: recovering)
        let store = JourneyStore(service: service)
        store.applyServerProjection(following)
        await store.recoverRoute()
        let commands = await service.capturedCommands()
        XCTAssertEqual(store.projection?.phase, .routeRecovery)
        XCTAssertEqual(commands, [.recoverRoute])
    }
    func testSequenceConflictRefreshesProjection() async throws {
        let completed = try projection(phase: "completed", revealed: true, recovery: true)
        let service = SequenceConflictService(response: completed)
        let store = JourneyStore(service: service)
        store.applyServerProjection(completed)
        await store.requestRecovery()
        let commands = await service.capturedCommands()
        XCTAssertEqual(commands, [.requestRecovery, .refresh])
        XCTAssertEqual(store.projection, completed)
    }
    func testGuardedReplacementRejectsActiveJourney() async throws {
        let following = try projection(phase: "following", revealed: false)
        let store = JourneyStore(service: FakeJourneyService(response: following))
        store.applyServerProjection(following)
        await store.requestRecovery()
        XCTAssertEqual(store.presentedError, .invalidTransition)
        XCTAssertFalse(store.showsRecoveryReview)
    }

    func testOneTapStartAutomaticallyCommitsReadyJourney() async throws {
        let ready = try projection(phase: "ready", revealed: false)
        let following = try projection(phase: "following", revealed: false)
        let service = QueuedJourneyService(responses: [ready, following])
        let locationController = LocationController()
        locationController.injectForTesting(location: LocationSample(
            coordinate: Coordinate(latitude: 37.54385, longitude: 127.03695),
            horizontalAccuracyM: 5,
            capturedAt: Date()
        ))
        let store = JourneyStore(service: service, locationController: locationController)

        await store.start(preferences: .defaults)

        let commands = await service.capturedCommands()
        XCTAssertEqual(commands.count, 2)
        guard case .createWithPreferences = commands[0] else {
            return XCTFail("first command must create the journey")
        }
        XCTAssertEqual(commands[1], .commit)
        XCTAssertEqual(store.projection?.phase, .following)
    }

    func testPrototypePreferencesSnapBudgetAndPreserveProfileTaxonomy() {
        var value = SomewherePreferences.defaults
        XCTAssertEqual(value.maxWalkMinutes, 25)
        value.budgetAmount = 11_000
        value.dietary = ["lacto-ovo"]
        let normalized = value.normalized
        XCTAssertEqual(normalized.budgetAmount, 10_000)
        XCTAssertEqual(normalized.dietary, ["lacto_ovo"])
        XCTAssertTrue(SomewherePreferences.dietaryOptions.contains { $0.id == "pollo_pesco" })
        XCTAssertEqual(SomewherePreferences.allergyOptions.count, 20)
    }

    func testPreferencesAlwaysUseRestaurantAsTheOnlyDiscoveryCategory() {
        var value = SomewherePreferences.defaults
        value.category = "cafe"

        XCTAssertEqual(value.normalized.category, "restaurant")
    }

    func testEquivalentGuidanceDoesNotRepublish() throws {
        let now = Date(timeIntervalSince1970: 3_000)
        let route = TrustedRoute(
            geometry: [
                Coordinate(latitude: 37.5440, longitude: 127.0370),
                Coordinate(latitude: 37.5450, longitude: 127.0370),
                Coordinate(latitude: 37.5450, longitude: 127.0380),
            ],
            routeDigest: "sha256:" + String(repeating: "a", count: 64),
            routeVersion: "test-v1",
            expiresAt: now.addingTimeInterval(600),
            receivedAt: now
        )
        let location = LocationSample(
            coordinate: Coordinate(latitude: 37.5442, longitude: 127.0370),
            horizontalAccuracyM: 5,
            capturedAt: now
        )
        let heading = HeadingSample(
            trueHeadingDegrees: 0,
            magneticHeadingDegrees: 0,
            magneticDeclinationDegreesEast: nil,
            accuracyDegrees: 5,
            capturedAt: now
        )
        let store = JourneyStore(
            service: FakeJourneyService(response: try projection(phase: "following", revealed: false)),
            notificationController: NotificationController(suppressScheduling: true)
        )
        var publications: [GuidanceResult] = []
        let cancellable = store.$guidance.dropFirst().sink { publications.append($0) }

        store.updateGuidance(location: location, heading: heading, route: route, now: now)
        store.updateGuidance(location: location, heading: heading, route: route, now: now)

        XCTAssertEqual(publications.count, 1)
        withExtendedLifetime(cancellable) {}
    }

    private func store(phase: String) async throws -> JourneyStore {
        let value = try projection(phase: phase, revealed: phase == "stopped" ? false : nil)
        let store = JourneyStore(service: FakeJourneyService(response: value))
        store.applyServerProjection(value)
        return store
    }

    private func projection(phase: String, revealed: Bool? = nil, recovery: Bool = false) throws -> JourneyProjection {
        let fixture = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "Fixtures/projection-examples-v1.json")
        let values = try JSONDecoder().decode([JourneyProjection].self, from: Data(contentsOf: fixture))
        return try XCTUnwrap(values.first {
            $0.phase.rawValue == phase && (revealed == nil || $0.revealed == revealed) &&
                (!recovery || $0.recoveryExpiresAt != nil)
        })
    }
}
