import XCTest
@testable import Somewhere

final class SomewhereCompassTests: XCTestCase {
    func testNeedleRemainsVisibleUntilGuidanceIsPaused() {
        XCTAssertTrue(SomewhereCompassPresentationPolicy.showsNeedle(for: .ready))
        XCTAssertTrue(SomewhereCompassPresentationPolicy.showsNeedle(for: .searching))
        XCTAssertTrue(SomewhereCompassPresentationPolicy.showsNeedle(for: .pointing(45)))
        XCTAssertFalse(SomewhereCompassPresentationPolicy.showsNeedle(for: .paused))
    }

    func testHubCorrectionMovesMeasuredHubToTheRotationCenter() {
        let correction = SomewhereCompassMotionPolicy.hubCorrection(displaySize: 286, frameScale: 0.44)
        XCTAssertEqual(correction.width, -0.10, accuracy: 0.02)
        XCTAssertEqual(correction.height, -37.43, accuracy: 0.05)
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

    func testDirectionCueUsesRelativeMovementSectors() {
        let cases: [(Double, String, String)] = [
            (0, "arrow.up", "앞"),
            (45, "arrow.up.right", "오른쪽 앞"),
            (90, "arrow.right", "오른쪽"),
            (135, "arrow.down.right", "오른쪽 뒤"),
            (180, "arrow.down", "뒤"),
            (225, "arrow.down.left", "왼쪽 뒤"),
            (270, "arrow.left", "왼쪽"),
            (315, "arrow.up.left", "왼쪽 앞"),
        ]

        for (degrees, symbolName, label) in cases {
            let cue = CompassDirectionCue(bearingDegrees: degrees)
            XCTAssertEqual(cue.symbolName, symbolName, "\(degrees)° symbol")
            XCTAssertEqual(cue.label, label, "\(degrees)° label")
        }
    }

    func testDirectionCueNormalizesAnglesAndUsesStableSectorBoundaries() {
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: -45).label, "왼쪽 앞")
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: 405).label, "오른쪽 앞")
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: 22.49).label, "앞")
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: 22.5).label, "오른쪽 앞")
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: 337.49).label, "왼쪽 앞")
        XCTAssertEqual(CompassDirectionCue(bearingDegrees: 337.5).label, "앞")
    }

    func testNeedleArtworkRemainsInsideSecondGenerationIPadDial() {
        let dial = CGFloat(490)
        let needleFrame = dial * 0.44
        let correction = SomewhereCompassMotionPolicy.hubCorrection(
            displaySize: dial,
            frameScale: 0.44
        )
        XCTAssertLessThan(abs(correction.width) + needleFrame / 2, dial / 2)
        XCTAssertLessThan(abs(correction.height) + needleFrame / 2, dial / 2)
    }
}
