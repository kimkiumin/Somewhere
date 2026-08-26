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
private final class RecordingPhysicalCompassClient: PhysicalCompassClient {
    var onConnectionState: ((PhysicalCompassConnectionState) -> Void)?
    var onEvent: ((PhysicalCompassEvent) -> Void)?
    var onSnapshotSent: ((Int) -> Void)?
    var automaticallyConfirmSnapshots = true
    private(set) var sentSnapshots: [PhysicalCompassSnapshot] = []
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func start() { startCount += 1 }
    func stop() { stopCount += 1 }
    func send(_ snapshot: PhysicalCompassSnapshot) {
        sentSnapshots.append(snapshot)
        if automaticallyConfirmSnapshots {
            onSnapshotSent?(snapshot.sequence)
        }
    }

    func confirmDelivery(of sequence: Int) {
        onSnapshotSent?(sequence)
    }

    func emit(_ event: PhysicalCompassEvent) {
        onEvent?(event)
    }

    func emitConnection(_ state: PhysicalCompassConnectionState) {
        onConnectionState?(state)
    }
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
    func testRequestLocationAccessPreservesExistingError() {
        let store = JourneyStore(
            service: FakeJourneyService(response: try! projection(phase: "following", revealed: false)),
            notificationController: NotificationController(suppressScheduling: true)
        )
        store.presentedError = .invalidTransition

        store.requestLocationAccess()

        XCTAssertEqual(store.presentedError, .invalidTransition)
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

    func testPhysicalCompassProjectionContainsOnlySafeGuidanceFields() throws {
        let following = try projection(phase: "following", revealed: false)
        let compass = RecordingPhysicalCompassClient()
        let store = JourneyStore(
            service: FakeJourneyService(response: following),
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )

        store.applyServerProjection(following)

        let snapshot = try XCTUnwrap(compass.sentSnapshots.last)
        XCTAssertEqual(snapshot.phase, "following")
        XCTAssertNil(snapshot.bearingDegrees)
        XCTAssertFalse(snapshot.revealed)
        XCTAssertLessThanOrEqual(snapshot.menus.count, 2)
        XCTAssertEqual(snapshot.actions, [.stop])
    }

    func testPhysicalCompassReceivesCrediblePhoneGuidance() throws {
        let following = try projection(phase: "following", revealed: false)
        let compass = RecordingPhysicalCompassClient()
        let store = JourneyStore(
            service: FakeJourneyService(response: following),
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        store.applyServerProjection(following)

        store.presentGuidanceForTesting(bearing: 315, remainingM: 420)

        let snapshot = try XCTUnwrap(compass.sentSnapshots.last)
        XCTAssertEqual(snapshot.bearingDegrees, 315)
        XCTAssertEqual(snapshot.remainingDistanceM, 420)
        XCTAssertEqual(snapshot.confidence, "credible")
        XCTAssertFalse(snapshot.revealed)
    }

    func testPhysicalCompassStopEventDispatchesGuardedJourneyCommand() async throws {
        let following = try projection(phase: "following", revealed: false)
        let paused = try projection(phase: "paused", revealed: false)
        let service = FakeJourneyService(response: paused)
        let compass = RecordingPhysicalCompassClient()
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        compass.emitConnection(.connected)
        store.applyServerProjection(following)
        let snapshot = try XCTUnwrap(compass.sentSnapshots.last)

        compass.emit(.action(.stop, sequence: snapshot.sequence))
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertTrue(store.isGuidancePaused)
        let commands = await service.capturedCommands()
        XCTAssertEqual(commands, [.requestStop])
    }

    func testPhysicalCompassIgnoresStaleEventSequence() async throws {
        let following = try projection(phase: "following", revealed: false)
        let service = FakeJourneyService(response: try projection(phase: "paused", revealed: false))
        let compass = RecordingPhysicalCompassClient()
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        compass.emitConnection(.connected)
        store.applyServerProjection(following)
        let snapshot = try XCTUnwrap(compass.sentSnapshots.last)

        compass.emit(.action(.stop, sequence: snapshot.sequence - 1))
        try await Task.sleep(for: .milliseconds(50))

        let commands = await service.capturedCommands()
        XCTAssertEqual(commands, [])
        XCTAssertFalse(store.isGuidancePaused)
    }

    func testBoardAuthorityAdvancesOnlyAfterTheNewSnapshotIsFullyDelivered() async throws {
        let following = try projection(phase: "following", revealed: false)
        let paused = try projection(phase: "paused", revealed: false)
        let service = FakeJourneyService(response: paused)
        let compass = RecordingPhysicalCompassClient()
        compass.automaticallyConfirmSnapshots = false
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        compass.emitConnection(.connected)
        store.applyServerProjection(following)
        let delivered = try XCTUnwrap(compass.sentSnapshots.last)
        compass.confirmDelivery(of: delivered.sequence)

        store.presentGuidanceForTesting(bearing: 315, remainingM: 420)
        let pending = try XCTUnwrap(compass.sentSnapshots.last)
        XCTAssertGreaterThan(pending.sequence, delivered.sequence)

        compass.emit(.action(.stop, sequence: pending.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let commandsBeforeDelivery = await service.capturedCommands()
        XCTAssertEqual(commandsBeforeDelivery, [])

        compass.emit(.action(.stop, sequence: delivered.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let commandsAfterDeliveredEvent = await service.capturedCommands()
        XCTAssertEqual(commandsAfterDeliveredEvent, [.requestStop])
    }

    func testBLEBackpressurePreservesTheInFlightAuthorityRecordWhileCoalescingUpdates() async throws {
        let following = try projection(phase: "following", revealed: false)
        let paused = try projection(phase: "paused", revealed: false)
        let service = FakeJourneyService(response: paused)
        let compass = RecordingPhysicalCompassClient()
        compass.automaticallyConfirmSnapshots = false
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        compass.emitConnection(.connected)
        store.applyServerProjection(following)
        let inFlight = try XCTUnwrap(compass.sentSnapshots.first)

        for update in 1...10 {
            store.presentGuidanceForTesting(
                bearing: Double(update * 10),
                remainingM: 420 - Double(update)
            )
        }

        XCTAssertGreaterThanOrEqual(compass.sentSnapshots.count, 9)
        compass.confirmDelivery(of: inFlight.sequence)
        compass.emit(.action(.stop, sequence: inFlight.sequence))
        try await Task.sleep(for: .milliseconds(50))

        let commands = await service.capturedCommands()
        XCTAssertEqual(commands, [.requestStop])
    }

    func testDisconnectAndDisableClearPreviouslyDeliveredBoardAuthority() async throws {
        let following = try projection(phase: "following", revealed: false)
        let paused = try projection(phase: "paused", revealed: false)
        let service = FakeJourneyService(response: paused)
        let compass = RecordingPhysicalCompassClient()
        compass.automaticallyConfirmSnapshots = false
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        compass.emitConnection(.connected)
        store.applyServerProjection(following)
        let delivered = try XCTUnwrap(compass.sentSnapshots.last)
        compass.confirmDelivery(of: delivered.sequence)

        compass.emitConnection(.disconnected)
        compass.emitConnection(.connected)
        compass.emit(.action(.stop, sequence: delivered.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let commandsAfterDisconnect = await service.capturedCommands()
        XCTAssertEqual(commandsAfterDisconnect, [])

        store.presentGuidanceForTesting(bearing: 35, remainingM: 350)
        let deliveredBeforeStale = try XCTUnwrap(compass.sentSnapshots.last)
        compass.confirmDelivery(of: deliveredBeforeStale.sequence)
        compass.emitConnection(.stale)
        compass.emitConnection(.connected)
        compass.emit(.action(.stop, sequence: deliveredBeforeStale.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let commandsAfterStale = await service.capturedCommands()
        XCTAssertEqual(commandsAfterStale, [])

        store.presentGuidanceForTesting(bearing: 70, remainingM: 280)
        let deliveredBeforeDisable = try XCTUnwrap(compass.sentSnapshots.last)
        compass.confirmDelivery(of: deliveredBeforeDisable.sequence)
        compass.emitConnection(.disabled)
        compass.emitConnection(.connected)
        compass.emit(.action(.stop, sequence: deliveredBeforeDisable.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let commandsAfterDisable = await service.capturedCommands()
        XCTAssertEqual(commandsAfterDisable, [])
    }

    func testPhysicalCompassHostIsOptInAndPersistsExplicitOwnership() throws {
        let following = try projection(phase: "following", revealed: false)
        let compass = RecordingPhysicalCompassClient()
        let suiteName = "JourneyStoreTests.\(UUID().uuidString)"
        let suite = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { suite.removePersistentDomain(forName: suiteName) }
        let store = JourneyStore(
            service: FakeJourneyService(response: following),
            physicalCompass: compass,
            physicalCompassDefaults: suite
        )

        XCTAssertFalse(store.isPhysicalCompassHostEnabled)
        XCTAssertEqual(store.physicalCompassConnectionState, .disabled)
        XCTAssertEqual(compass.startCount, 0)

        store.setPhysicalCompassHostEnabled(true)
        XCTAssertTrue(store.isPhysicalCompassHostEnabled)
        XCTAssertTrue(PhysicalCompassHostPersistence.load(defaults: suite))
        XCTAssertEqual(compass.startCount, 1)

        store.setPhysicalCompassHostEnabled(false)
        XCTAssertFalse(PhysicalCompassHostPersistence.load(defaults: suite))
        XCTAssertEqual(compass.stopCount, 1)
        XCTAssertEqual(store.physicalCompassConnectionState, .disabled)
    }

    func testReconnectStaleStateRequiresFreshSnapshotBeforeBoardEvents() async throws {
        let following = try projection(phase: "following", revealed: false)
        let paused = try projection(phase: "paused", revealed: false)
        let service = FakeJourneyService(response: paused)
        let compass = RecordingPhysicalCompassClient()
        let store = JourneyStore(
            service: service,
            physicalCompass: compass,
            physicalCompassHostEnabled: true
        )
        store.applyServerProjection(following)
        let beforeReconnect = try XCTUnwrap(compass.sentSnapshots.last)

        compass.emitConnection(.stale)
        let fresh = try XCTUnwrap(compass.sentSnapshots.last)
        XCTAssertGreaterThan(fresh.sequence, beforeReconnect.sequence)

        compass.emit(.action(.stop, sequence: beforeReconnect.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let staleCommands = await service.capturedCommands()
        XCTAssertEqual(staleCommands, [])

        compass.emitConnection(.connected)
        compass.emit(.action(.stop, sequence: fresh.sequence))
        try await Task.sleep(for: .milliseconds(50))
        let freshCommands = await service.capturedCommands()
        XCTAssertEqual(freshCommands, [.requestStop])
    }

    func testBoardActionRequiresBothSnapshotAdvertisementAndCurrentJourneyPermission() {
        XCTAssertFalse(PhysicalCompassActionAuthority.allows(
            .stop,
            advertised: [],
            journey: [.stop]
        ))
        XCTAssertFalse(PhysicalCompassActionAuthority.allows(
            .stop,
            advertised: [.stop],
            journey: []
        ))
        XCTAssertTrue(PhysicalCompassActionAuthority.allows(
            .stop,
            advertised: [.stop],
            journey: [.stop]
        ))
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
