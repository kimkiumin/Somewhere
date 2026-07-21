import XCTest
@testable import SensorSpike

final class LocationHeadingModelTests: XCTestCase {
    func testBearingDeltaWrapsAcrossNorth() {
        let delta = LocationHeadingModel.bearingDelta(from: 355.0, to: 5.0)

        XCTAssertEqual(delta, 10.0, accuracy: 0.001)
    }
}
