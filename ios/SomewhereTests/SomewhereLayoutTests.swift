import XCTest
@testable import Somewhere

final class SomewhereLayoutTests: XCTestCase {
    func testIPhone13UsesCompactMetrics() {
        let value = SomewhereLayoutMetrics.resolve(width: 390, height: 844, isAccessibilitySize: false)
        XCTAssertEqual(value.mode, .compact)
        XCTAssertEqual(value.contentMaxWidth, 350)
        XCTAssertEqual(value.horizontalPadding, 20)
        XCTAssertEqual(value.compassDiameter, 350)
    }

    func testSecondGenerationElevenInchIPadUsesExhibitionMetrics() {
        let value = SomewhereLayoutMetrics.resolve(width: 834, height: 1_194, isAccessibilitySize: false)
        XCTAssertEqual(value.mode, .exhibition)
        XCTAssertEqual(value.contentMaxWidth, 762)
        XCTAssertEqual(value.horizontalPadding, 36)
        XCTAssertGreaterThanOrEqual(value.compassDiameter, 410)
        XCTAssertLessThanOrEqual(value.compassDiameter, 520)
        XCTAssertEqual(value.sheetMaxWidth, 620)
    }

    func testNarrowIPadWindowFallsBackToCompact() {
        let value = SomewhereLayoutMetrics.resolve(width: 680, height: 1_000, isAccessibilitySize: false)
        XCTAssertEqual(value.mode, .compact)
    }

    func testAccessibilityTextUsesCompactPresentationOnIPad() {
        let value = SomewhereLayoutMetrics.resolve(width: 834, height: 1_194, isAccessibilitySize: true)
        XCTAssertEqual(value.mode, .compact)
        XCTAssertLessThanOrEqual(value.compassDiameter, 360)
    }
}
