import XCTest
@testable import Somewhere

final class GuidanceEngineTests: XCTestCase {
    func testGuidanceUsesRouteLookAheadAndRejectsPoorAccuracy() throws {
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
        var engine = GuidanceEngine()
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
        guard case .credible(let reading) = engine.update(location: location, heading: heading, route: route, now: now) else {
            return XCTFail("expected credible route guidance")
        }
        XCTAssertLessThan(reading.arrowDegrees, 10)

        let poor = LocationSample(
            coordinate: location.coordinate,
            horizontalAccuracyM: 50,
            capturedAt: now
        )
        XCTAssertEqual(engine.update(location: poor, heading: heading, route: route, now: now), .suppressed(.poorLocationAccuracy))
    }

    func testArrivalRequiresFourSamplesAndTwelveSeconds() {
        let start = Date(timeIntervalSince1970: 1_000)
        var gate = ArrivalGate()
        for offset in [0.0, 4.0, 8.0] {
            XCTAssertFalse(gate.advance(sample: qualifyingSample(at: start.addingTimeInterval(offset))))
        }
        XCTAssertTrue(gate.advance(sample: qualifyingSample(at: start.addingTimeInterval(12))))
        XCTAssertTrue(gate.arrived)
    }

    func testArrivalResetsOnPoorAccuracyAndLatchesAfterArrival() {
        let start = Date(timeIntervalSince1970: 2_000)
        var gate = ArrivalGate()
        XCTAssertFalse(gate.advance(sample: qualifyingSample(at: start)))
        XCTAssertFalse(gate.advance(sample: ArrivalSample(
            endpointDistanceM: 10,
            accuracyM: 30,
            finalCorridorDeviationM: 5,
            capturedAt: start.addingTimeInterval(4),
            routeIsFresh: true,
            progressIsCredible: true
        )))
        XCTAssertEqual(gate.qualifyingTimes, [])
    }

    private func qualifyingSample(at date: Date) -> ArrivalSample {
        ArrivalSample(
            endpointDistanceM: 10,
            accuracyM: 5,
            finalCorridorDeviationM: 5,
            capturedAt: date,
            routeIsFresh: true,
            progressIsCredible: true
        )
    }
}
