import XCTest
@testable import Somewhere

final class PhysicalCompassWireTests: XCTestCase {
    func testCredibleStateIsCompactAndFramed() throws {
        let snapshot = try makeSnapshot(
            remainingDistanceM: 420,
            bearingDegrees: 315,
            confidence: "credible",
            actions: [.stop]
        )

        let frame = try PhysicalCompassWire.encodeState(snapshot)
        XCTAssertEqual(frame.last, 0x0A)
        XCTAssertLessThanOrEqual(frame.count, PhysicalCompassBLE.maxFrameBytes)
        XCTAssertTrue(String(decoding: frame, as: UTF8.self).contains("\"d\":420"))
        XCTAssertFalse(String(decoding: frame, as: UTF8.self).contains("name"))
    }

    func testSuppressedStateOmitsUnsafeDirection() throws {
        let snapshot = try makeSnapshot(
            remainingDistanceM: nil,
            bearingDegrees: nil,
            confidence: GuidanceSuppression.offRoute.rawValue,
            menus: ["한식 국물 요리", "조용한 식사"],
            priceBand: "medium",
            actions: [.stop, .reveal]
        )

        let frame = try PhysicalCompassWire.encodeState(snapshot)
        let json = String(decoding: frame, as: UTF8.self)
        XCTAssertFalse(json.contains("\"b\""))
        XCTAssertTrue(json.contains("offRoute"))
        XCTAssertLessThanOrEqual(frame.count, PhysicalCompassBLE.maxFrameBytes)
    }

    func testEveryBoardActionRoundTrips() throws {
        XCTAssertFalse(PhysicalCompassAction.allCases.map(\.rawValue).contains("review"))
        for action in PhysicalCompassAction.allCases {
            let frame = try PhysicalCompassWire.encodeEvent(action, sequence: 9)
            XCTAssertEqual(try PhysicalCompassWire.decodeEvent(frame), .action(action, sequence: 9))
        }
    }

    func testEventSequenceMustBePositive() throws {
        XCTAssertThrowsError(try PhysicalCompassWire.encodeEvent(.stop, sequence: 0)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidSequence)
        }
        let zero = Data("{\"v\":1,\"type\":\"event\",\"action\":\"stop\",\"seq\":0}\n".utf8)
        XCTAssertThrowsError(try PhysicalCompassWire.decodeEvent(zero)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidSequence)
        }
    }

    func testDisplayLimitsUseUTF8BytesAndTruncateAtGraphemeBoundaries() throws {
        let oversizedKorean = String(repeating: "가", count: 14)
        XCTAssertGreaterThan(oversizedKorean.utf8.count, PhysicalCompassBLE.maxDisplayBytes)
        XCTAssertThrowsError(try makeSnapshot(menus: [oversizedKorean])) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidPayload)
        }

        let truncated = PhysicalCompassWire.truncateDisplayText(oversizedKorean)
        XCTAssertLessThanOrEqual(truncated.utf8.count, PhysicalCompassBLE.maxDisplayBytes)
        XCTAssertTrue(oversizedKorean.hasPrefix(truncated))
        XCTAssertNoThrow(try makeSnapshot(menus: [truncated]))
    }

    func testTransportQueueFinishesInFlightFrameAndCoalescesOnlyQueuedFrame() throws {
        var queue = PhysicalCompassFrameQueue()
        let first = Data("first\n".utf8)
        let replaced = Data("second\n".utf8)
        let latest = Data("latest\n".utf8)

        queue.enqueue(first, sequence: 11)
        let firstChunk = try XCTUnwrap(queue.nextChunk(maxLength: 3))
        XCTAssertEqual(firstChunk.data, Data("fir".utf8))
        XCTAssertFalse(firstChunk.completesFrame)
        XCTAssertNil(firstChunk.completedSequence)

        queue.enqueue(replaced, sequence: 12)
        queue.enqueue(latest, sequence: 13)

        var emitted = firstChunk.data
        var completedSequences: [Int] = []
        while let chunk = queue.nextChunk(maxLength: 3) {
            emitted.append(chunk.data)
            if let sequence = chunk.completedSequence { completedSequences.append(sequence) }
        }

        XCTAssertEqual(emitted, first + latest)
        XCTAssertEqual(completedSequences, [11, 13])
        XCTAssertTrue(queue.isEmpty)
    }

    func testTransportQueueCanBeClearedAcrossReconnectEpochs() throws {
        var queue = PhysicalCompassFrameQueue()
        queue.enqueue(Data("stale-state\n".utf8), sequence: 21)
        _ = queue.nextChunk(maxLength: 2)

        queue.removeAll()

        XCTAssertTrue(queue.isEmpty)
        XCTAssertNil(queue.nextChunk(maxLength: 20))
    }

    func testPeripheralEpochRejectsLateCallbacksWithinAnActiveCentralSession() {
        var epoch = PhysicalCompassConnectionEpoch()
        let first = epoch.begin()

        epoch.invalidate()
        let second = epoch.begin()

        XCTAssertNotEqual(first, second)
        XCTAssertFalse(epoch.accepts(first))
        XCTAssertTrue(epoch.accepts(second))
    }

    func testDiscoveryGateRejectsEveryInactiveLifecycleBoundary() {
        XCTAssertTrue(PhysicalCompassDiscoveryGate.accepts(
            running: true,
            isCurrentCentral: true,
            centralIsPoweredOn: true,
            awaitsCentralRefresh: false,
            hasPeripheral: false
        ))

        let rejected: [(Bool, Bool, Bool, Bool, Bool)] = [
            // stopped, retired central, powered off, power-cycle refresh pending, already connecting
            (false, true, true, false, false),
            (true, false, true, false, false),
            (true, true, false, false, false),
            (true, true, true, true, false),
            (true, true, true, false, true),
            // A late discovery delivered during a power cycle must remain rejected even if
            // CoreBluetooth has already flipped the central back to powered-on.
            (true, true, true, true, false),
        ]

        for lifecycle in rejected {
            XCTAssertFalse(PhysicalCompassDiscoveryGate.accepts(
                running: lifecycle.0,
                isCurrentCentral: lifecycle.1,
                centralIsPoweredOn: lifecycle.2,
                awaitsCentralRefresh: lifecycle.3,
                hasPeripheral: lifecycle.4
            ))
        }
    }

    func testEveryConnectionStateHasDeterministicKoreanStatusCopy() {
        let states: [PhysicalCompassConnectionState] = [
            .disabled, .unavailable, .disconnected, .scanning, .connecting, .stale, .connected,
        ]

        XCTAssertEqual(states.map { PhysicalCompassStatusPresentation(state: $0).title }, [
            "꺼짐",
            "Bluetooth 사용 불가",
            "연결 끊김",
            "나침반 찾는 중",
            "연결 중",
            "새 안내 동기화 중",
            "연결됨",
        ])
        XCTAssertTrue(states.allSatisfy { !PhysicalCompassStatusPresentation(state: $0).detail.isEmpty })
    }

    func testChunkReassemblyHandlesBLEWrites() throws {
        let frame = try PhysicalCompassWire.encodeEvent(.confirmStop, sequence: 31)
        var buffer = Data()
        var frames: [Data] = []
        for chunk in stride(from: 0, to: frame.count, by: 4) {
            let end = min(chunk + 4, frame.count)
            frames.append(contentsOf: PhysicalCompassWire.appendChunk(Data(frame[chunk..<end]), to: &buffer))
        }

        XCTAssertEqual(frames, [frame])
        XCTAssertEqual(try PhysicalCompassWire.decodeEvent(try XCTUnwrap(frames.first)), .action(.confirmStop, sequence: 31))
        XCTAssertTrue(buffer.isEmpty)
    }

    func testRejectsUnknownVersionActionAndInvalidNumbers() throws {
        let unknownVersion = Data("{\"v\":2,\"type\":\"event\",\"action\":\"stop\",\"seq\":1}\n".utf8)
        XCTAssertThrowsError(try PhysicalCompassWire.decodeEvent(unknownVersion)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidVersion)
        }

        let unknownAction = Data("{\"v\":1,\"type\":\"event\",\"action\":\"erase\",\"seq\":1}\n".utf8)
        XCTAssertThrowsError(try PhysicalCompassWire.decodeEvent(unknownAction)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidAction)
        }

        XCTAssertThrowsError(try makeSnapshot(remainingDistanceM: -.ulpOfOne)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidNumber)
        }
        XCTAssertThrowsError(try makeSnapshot(bearingDegrees: .infinity)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidNumber)
        }
    }

    func testSnapshotNeverCarriesDestinationIdentity() throws {
        let snapshot = try makeSnapshot(menus: ["한식 국물 요리"])
        let frame = try PhysicalCompassWire.encodeState(snapshot)
        let json = String(decoding: frame, as: UTF8.self)
        XCTAssertFalse(json.contains("소문난성수감자탕"))
        XCTAssertFalse(json.contains("서울특별시"))
        XCTAssertFalse(json.contains("address"))
    }

    private func makeSnapshot(
        remainingDistanceM: Double? = 420,
        bearingDegrees: Double? = 315,
        confidence: String = "credible",
        menus: [String] = ["한식 국물 요리"],
        priceBand: String? = "medium",
        actions: [PhysicalCompassAction] = [.stop]
    ) throws -> PhysicalCompassSnapshot {
        try PhysicalCompassSnapshot(
            sequence: 14,
            phase: "following",
            remainingDistanceM: remainingDistanceM,
            bearingDegrees: bearingDegrees,
            confidence: confidence,
            menus: menus,
            priceBand: priceBand,
            actions: actions,
            revealed: false,
            timestampMs: 1_787_659_200_000
        )
    }
}
