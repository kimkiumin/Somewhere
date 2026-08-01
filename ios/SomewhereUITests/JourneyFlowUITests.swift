import XCTest

final class JourneyFlowUITests: XCTestCase {
    func testStartSurfaceHidesDestinationIdentity() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["숨은 목적지 여정 시작"].exists)
        XCTAssertFalse(app.staticTexts["Revealed venue"].exists)
    }

    func testStopControlIsImmediatelyAvailableDuringGuidance() {
        let app = launchHarness("following")
        XCTAssertTrue(app.buttons["여정 즉시 멈춤"].waitForExistence(timeout: 2))
    }

    func testRevealRequiresExplicitControl() {
        let app = launchHarness("arrived-unrevealed")
        XCTAssertTrue(app.buttons["목적지 공개"].waitForExistence(timeout: 2))
    }

    func testExpiredJourneyDoesNotPoint() {
        let app = launchHarness("expired")
        XCTAssertTrue(app.staticTexts["여정이 만료되었어요."].waitForExistence(timeout: 2))
        XCTAssertFalse(app.images["신뢰 가능한 진행 방향"].exists)
    }

    private func launchHarness(_ state: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-state", state]
        app.launch()
        return app
    }
}
