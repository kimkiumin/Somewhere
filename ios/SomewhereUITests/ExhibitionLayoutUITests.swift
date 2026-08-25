import UIKit
import XCTest

@MainActor
final class ExhibitionLayoutUITests: XCTestCase {
    func testTargetDeviceUsesExpectedResponsiveLayout() {
        let app = launchStartSurface()
        let expected = UIDevice.current.userInterfaceIdiom == .pad
            ? "somewhere.layout.exhibition"
            : "somewhere.layout.compact"
        XCTAssertTrue(app.otherElements[expected].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["somewhere.start-journey"].isHittable)
        XCTAssertEqual(app.scrollViews.count, 0)
    }

    func testConditionsAreAnExplicitSurfaceWithWorkingBackControl() {
        let app = launchStartSurface()
        app.buttons["somewhere.conditions-link"].tap()
        XCTAssertTrue(app.buttons["somewhere.conditions-back"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.sliders["somewhere.budget-slider"].exists)
        XCTAssertTrue(app.buttons["somewhere.start-journey-conditions"].isHittable)
        app.buttons["somewhere.conditions-back"].tap()
        XCTAssertTrue(app.buttons["somewhere.start-journey"].waitForExistence(timeout: 3))
    }

    func testGuidanceFitsIPadAndKeepsStopVisible() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following-next-step",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let compass = app.otherElements["somewhere.guidance-compass"]
        let direction = app.descendants(matching: .any)["somewhere.direction-summary"]
        let stop = app.buttons["somewhere.stop"]
        XCTAssertTrue(compass.waitForExistence(timeout: 3))
        XCTAssertTrue(direction.exists)
        XCTAssertTrue(stop.isHittable)
        XCTAssertEqual(app.scrollViews.count, 0)
        XCTAssertTrue(app.windows.firstMatch.frame.contains(compass.frame))
        XCTAssertTrue(app.windows.firstMatch.frame.contains(stop.frame))
    }

    func testPausedGuidanceKeepsNeedleHiddenOnIPad() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-state", "paused", "--ui-test-no-notifications"]
        app.launch()
        let compass = app.otherElements["somewhere.guidance-compass"]
        XCTAssertTrue(compass.waitForExistence(timeout: 3))
        XCTAssertEqual(compass.label, "방향이 숨겨진 나침반")
    }

    func testArrivalAndRecoveryPrimaryActionsAreVisible() {
        let arrived = launchHarness("arrived-rich")
        XCTAssertTrue(arrived.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 3))
        XCTAssertTrue(arrived.buttons["somewhere.external-map"].isHittable)
        arrived.terminate()

        let stopped = launchHarness("stopped")
        XCTAssertTrue(stopped.buttons["somewhere.skip-stop-reason"].waitForExistence(timeout: 3))
        XCTAssertTrue(stopped.buttons["somewhere.skip-stop-reason"].isHittable)
    }

    func testProfileUsesBoundedSettingsSurface() {
        let app = launchStartSurface()
        app.buttons["somewhere.profile-menu"].tap()
        app.buttons["식이·알레르기 설정"].tap()
        XCTAssertTrue(app.textFields["somewhere.profile-search-dietary"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.switches["somewhere.profile-dietary-none"].exists)
        XCTAssertTrue(app.switches["somewhere.profile-allergies-none"].exists)
        XCTAssertTrue(app.buttons["somewhere.profile-save"].isHittable)
    }

    private func launchHarness(_ state: String, credibleGuidance: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-state", state, "--ui-test-no-notifications"]
        if credibleGuidance { app.launchArguments.append("--ui-test-credible-guidance") }
        app.launch()
        return app
    }

    private func launchStartSurface() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-no-notifications"]
        app.launch()
        let onboarding = app.buttons["somewhere.onboarding-continue"]
        if onboarding.waitForExistence(timeout: 3) {
            onboarding.tap()
            let save = app.buttons["somewhere.profile-save"]
            if save.waitForExistence(timeout: 3) { save.tap() }
        }
        let save = app.buttons["somewhere.profile-save"]
        if save.exists { save.tap() }
        return app
    }
}
