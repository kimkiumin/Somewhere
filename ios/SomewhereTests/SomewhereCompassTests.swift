import XCTest
@testable import Somewhere

final class SomewhereCompassTests: XCTestCase {
    func testHubCorrectionMovesMeasuredHubToTheRotationCenter() {
        let correction = SomewhereCompassMotionPolicy.hubCorrection(displaySize: 286, frameScale: 0.68)
        XCTAssertEqual(correction.width, -0.08, accuracy: 0.02)
        XCTAssertEqual(correction.height, -14.12, accuracy: 0.05)
    }

    func testShortestDeltaCrossesNorthClockwise() {
        XCTAssertEqual(SomewhereCompassMotionPolicy.shortestSignedDelta(from: 359, to: 1), 2, accuracy: 0.001)
        XCTAssertEqual(SomewhereCompassMotionPolicy.unwrappedTarget(from: 359, to: 1), 361, accuracy: 0.001)
    }

    func testShortestDeltaCrossesNorthCounterClockwise() {
        XCTAssertEqual(SomewhereCompassMotionPolicy.shortestSignedDelta(from: 1, to: 359), -2, accuracy: 0.001)
        XCTAssertEqual(SomewhereCompassMotionPolicy.unwrappedTarget(from: 1, to: 359), -1, accuracy: 0.001)
    }

    func testOppositeAnglesUseAStableBoundedDelta() {
        let delta = SomewhereCompassMotionPolicy.shortestSignedDelta(from: 170, to: -170)
        XCTAssertEqual(abs(delta), 20, accuracy: 0.001)
    }
}
