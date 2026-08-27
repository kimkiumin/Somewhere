import XCTest
@testable import Somewhere

final class PhysicalCompassWireTests: XCTestCase {
    func testCredibleStateIsCompactAndFramed() throws {
        let snapshot = try makeSnapshot(
            remainingDistanceM: 420,
            targetTrueBearingDegrees: 315,
            magneticDeclinationDegreesEast: -8.2,
            confidence: "credible",
            actions: [.stop]
        )

        let frame = try PhysicalCompassWire.encodeState(snapshot)
        XCTAssertEqual(frame.last, 0x0A)
        XCTAssertLessThanOrEqual(frame.count, PhysicalCompassBLE.maxFrameBytes)
        XCTAssertTrue(String(decoding: frame, as: UTF8.self).contains("\"d\":420"))
        XCTAssertTrue(String(decoding: frame, as: UTF8.self).contains("\"v\":2"))
        XCTAssertTrue(String(decoding: frame, as: UTF8.self).contains("\"tb\":315"))
        XCTAssertTrue(String(decoding: frame, as: UTF8.self).contains("\"md\":-8.2"))
        XCTAssertFalse(String(decoding: frame, as: UTF8.self).contains("\"b\":"))
        XCTAssertFalse(String(decoding: frame, as: UTF8.self).contains("name"))
    }

    func testSuppressedStateOmitsUnsafeDirection() throws {
        let snapshot = try makeSnapshot(
            remainingDistanceM: nil,
            targetTrueBearingDegrees: nil,
            magneticDeclinationDegreesEast: nil,
            confidence: GuidanceSuppression.offRoute.rawValue,
            menus: ["한식 국물 요리", "조용한 식사"],
            priceBand: "medium",
            actions: [.stop, .reveal]
        )

        let frame = try PhysicalCompassWire.encodeState(snapshot)
        let json = String(decoding: frame, as: UTF8.self)
        XCTAssertFalse(json.contains("\"tb\""))
        XCTAssertFalse(json.contains("\"md\""))
        XCTAssertTrue(json.contains("offRoute"))
        XCTAssertLessThanOrEqual(frame.count, PhysicalCompassBLE.maxFrameBytes)
    }

    func testEveryBoardActionRoundTrips() throws {
        for action in PhysicalCompassAction.allCases {
            let frame = try PhysicalCompassWire.encodeEvent(action, sequence: 9)
            XCTAssertEqual(try PhysicalCompassWire.decodeEvent(frame), .action(action, sequence: 9))
        }
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
        for version in [1, 3] {
            let unknownVersion = Data("{\"v\":\(version),\"type\":\"event\",\"action\":\"stop\",\"seq\":1}\n".utf8)
            XCTAssertThrowsError(try PhysicalCompassWire.decodeEvent(unknownVersion)) { error in
                XCTAssertEqual(error as? PhysicalCompassWireError, .invalidVersion)
            }
        }

        let unknownAction = Data("{\"v\":2,\"type\":\"event\",\"action\":\"erase\",\"seq\":1}\n".utf8)
        XCTAssertThrowsError(try PhysicalCompassWire.decodeEvent(unknownAction)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidAction)
        }

        XCTAssertThrowsError(try makeSnapshot(remainingDistanceM: -.ulpOfOne)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidNumber)
        }
        XCTAssertThrowsError(try makeSnapshot(targetTrueBearingDegrees: .infinity)) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidNumber)
        }
    }

    func testDirectionFieldsMustAppearTogether() {
        XCTAssertThrowsError(try makeSnapshot(
            targetTrueBearingDegrees: 315,
            magneticDeclinationDegreesEast: nil
        )) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidPayload)
        }
        XCTAssertThrowsError(try makeSnapshot(
            targetTrueBearingDegrees: nil,
            magneticDeclinationDegreesEast: -8.2
        )) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidPayload)
        }
    }

    func testDisplayTextUsesTheSameUnicodeScalarLimitAsTheBoard() throws {
        let koreanAtLimit = String(repeating: "가", count: PhysicalCompassBLE.maxDisplayCharacters)
        XCTAssertNoThrow(try makeSnapshot(menus: [koreanAtLimit]))

        let combiningText = String(repeating: "e\u{301}", count: 21)
        XCTAssertEqual(combiningText.count, 21)
        XCTAssertEqual(combiningText.unicodeScalars.count, 42)
        XCTAssertThrowsError(try makeSnapshot(menus: [combiningText])) { error in
            XCTAssertEqual(error as? PhysicalCompassWireError, .invalidPayload)
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
        targetTrueBearingDegrees: Double? = 315,
        magneticDeclinationDegreesEast: Double? = 0,
        confidence: String = "credible",
        menus: [String] = ["한식 국물 요리"],
        priceBand: String? = "medium",
        actions: [PhysicalCompassAction] = [.stop]
    ) throws -> PhysicalCompassSnapshot {
        try PhysicalCompassSnapshot(
            sequence: 14,
            phase: "following",
            remainingDistanceM: remainingDistanceM,
            targetTrueBearingDegrees: targetTrueBearingDegrees,
            magneticDeclinationDegreesEast: magneticDeclinationDegreesEast,
            confidence: confidence,
            menus: menus,
            priceBand: priceBand,
            actions: actions,
            revealed: false,
            timestampMs: 1_787_659_200_000
        )
    }
}
