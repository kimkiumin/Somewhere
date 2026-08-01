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

@MainActor
final class JourneyStoreTests: XCTestCase {
    func testReadyProjectionRemainsHidden() throws { XCTAssertNil(try projection(phase: "ready", revealed: false).reveal) }
    func testCommitUsesServerProjection() async throws { XCTAssertEqual(try await store(phase: "committed").projection?.phase, .committed) }
    func testFollowingStartsGuidanceState() throws { XCTAssertEqual(try projection(phase: "following", revealed: false).actions.first, .reveal) }
    func testNearPreservesHiddenIdentity() throws { XCTAssertNil(try projection(phase: "near", revealed: false).reveal) }
    func testArrivedRequiresExplicitReveal() throws { XCTAssertEqual(try projection(phase: "arrived", revealed: false).actions, [.reveal]) }
    func testRevealContainsIdentityOnlyAfterServerReveal() throws { XCTAssertNotNil(try projection(phase: "arrived", revealed: true).reveal) }
    func testStopPausesImmediately() async throws {
        let store = try await store(phase: "paused")
        store.requestStop()
        XCTAssertTrue(store.isGuidancePaused)
    }
    func testCancelStopResumesSameJourney() async throws { XCTAssertEqual(try await store(phase: "following").projection?.phase, .following) }
    func testConfirmStopEndsGuidance() async throws { XCTAssertEqual(try await store(phase: "stopped").projection?.phase, .stopped) }
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
