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
        let conditionsLink = app.buttons["somewhere.conditions-link"]
        XCTAssertTrue(conditionsLink.waitForExistence(timeout: 5))
        XCTAssertTrue(conditionsLink.isHittable)
        let back = app.buttons["somewhere.conditions-back"]
        XCTAssertTrue(tap(conditionsLink, until: back, timeout: 8))
        XCTAssertTrue(app.sliders["somewhere.budget-slider"].exists)
        XCTAssertTrue(app.buttons["somewhere.start-journey-conditions"].isHittable)
        back.tap()
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
        let arrivedWindow = arrived.windows.firstMatch
        let revealedName = arrived.staticTexts["somewhere.revealed-name"]
        let externalMap = arrived.buttons["somewhere.external-map"]
        XCTAssertTrue(revealedName.waitForExistence(timeout: 3))
        XCTAssertTrue(revealedName.isHittable)
        XCTAssertTrue(externalMap.waitForExistence(timeout: 3))
        XCTAssertTrue(externalMap.isHittable)
        if UIDevice.current.userInterfaceIdiom == .pad {
            XCTAssertTrue(arrivedWindow.frame.contains(revealedName.frame))
            XCTAssertTrue(arrivedWindow.frame.contains(externalMap.frame))
            XCTAssertEqual(arrived.scrollViews.count, 0)
        }
        arrived.terminate()

        let stopped = launchHarness("stopped")
        let stoppedWindow = stopped.windows.firstMatch
        let skip = stopped.buttons["somewhere.skip-stop-reason"]
        let safetyReason = stopped.buttons["somewhere.stop-reason.safety-concern"]
        XCTAssertTrue(safetyReason.waitForExistence(timeout: 3))
        XCTAssertTrue(safetyReason.isHittable)
        XCTAssertTrue(skip.waitForExistence(timeout: 3))
        if UIDevice.current.userInterfaceIdiom == .phone {
            let reasonList = stopped.scrollViews.firstMatch
            XCTAssertTrue(reasonList.waitForExistence(timeout: 3))
            for _ in 0..<6 where !skip.isHittable {
                reasonList.swipeUp()
            }
        }
        XCTAssertTrue(skip.isHittable)
        if UIDevice.current.userInterfaceIdiom == .pad {
            XCTAssertEqual(stopped.scrollViews.count, 0)
            for identifier in [
                "safety-concern",
                "route-or-sensor",
                "hard-condition",
                "venue-situation",
                "changed-mind",
                "schedule-changed",
            ] {
                let reason = stopped.buttons["somewhere.stop-reason.\(identifier)"]
                XCTAssertTrue(reason.isHittable, identifier)
                XCTAssertTrue(stoppedWindow.frame.contains(reason.frame), identifier)
            }
            XCTAssertTrue(stoppedWindow.frame.contains(skip.frame))
        }
    }

    func testProfileUsesBoundedSettingsSurface() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("Two-column profile assertions are iPad-specific")
        }
        let app = launchStartSurface()
        app.buttons["somewhere.profile-menu"].tap()
        app.buttons["식이·알레르기 설정"].tap()
        let window = app.windows.firstMatch
        let dietarySearch = app.textFields["somewhere.profile-search-dietary"]
        let allergySearch = app.textFields["somewhere.profile-search-allergies"]
        let dietaryList = app.scrollViews["somewhere.profile-list-dietary"]
        let allergyList = app.scrollViews["somewhere.profile-list-allergies"]
        XCTAssertTrue(dietarySearch.waitForExistence(timeout: 3))
        XCTAssertTrue(allergySearch.waitForExistence(timeout: 3))
        XCTAssertTrue(dietarySearch.isHittable)
        XCTAssertTrue(allergySearch.isHittable)
        XCTAssertLessThan(dietarySearch.frame.maxX, allergySearch.frame.minX)
        XCTAssertTrue(window.frame.contains(dietarySearch.frame))
        XCTAssertTrue(window.frame.contains(allergySearch.frame))
        XCTAssertEqual(app.scrollViews.count, 2)
        XCTAssertTrue(dietaryList.waitForExistence(timeout: 3))
        XCTAssertTrue(allergyList.waitForExistence(timeout: 3))
        XCTAssertTrue(dietaryList.isHittable)
        XCTAssertTrue(allergyList.isHittable)
        XCTAssertTrue(window.frame.contains(dietaryList.frame))
        XCTAssertTrue(window.frame.contains(allergyList.frame))
        XCTAssertTrue(app.switches["somewhere.profile-dietary-none"].exists)
        XCTAssertTrue(app.switches["somewhere.profile-allergies-none"].exists)

        let finalAllergy = app.switches["somewhere.profile-allergies-tree_nut"]
        XCTAssertTrue(finalAllergy.waitForExistence(timeout: 3))
        for _ in 0..<10 where !finalAllergy.isHittable {
            allergyList.swipeUp()
        }
        XCTAssertTrue(finalAllergy.isHittable)

        let save = app.buttons["somewhere.profile-save"]
        XCTAssertTrue(save.isHittable)
        XCTAssertTrue(window.frame.contains(save.frame))
    }

    func testBoundedSheetsStayWithinIPadFrame() {
        let noFit = XCUIApplication()
        noFit.launchArguments = ["--ui-test-no-fit", "--ui-test-no-notifications"]
        noFit.launch()
        assertBoundedSurface(
            noFit,
            identifier: "somewhere.no-fit-surface",
            actionIdentifier: "somewhere.no-fit-review",
            maxWidth: 762
        )
        noFit.terminate()

        let stopped = launchHarness("following")
        stopped.buttons["somewhere.stop"].tap()
        assertBoundedSurface(
            stopped,
            identifier: "somewhere.stop-confirmation-surface",
            actionIdentifier: "somewhere.continue-journey",
            maxWidth: 620
        )
        stopped.terminate()

        let revealReason = launchHarness("following")
        revealReason.buttons["somewhere.stop"].tap()
        revealReason.buttons["somewhere.paused-reveal"].tap()
        assertBoundedSurface(
            revealReason,
            identifier: "somewhere.reveal-reason-surface",
            actionIdentifier: "somewhere.reveal-reason.safety",
            maxWidth: 620
        )
        revealReason.terminate()

        let externalMap = launchHarness("following")
        externalMap.buttons["somewhere.stop"].tap()
        externalMap.buttons["somewhere.paused-external-map"].tap()
        assertBoundedSurface(
            externalMap,
            identifier: "somewhere.external-map-warning-surface",
            actionIdentifier: "somewhere.external-map-confirm",
            maxWidth: 620
        )
    }

    func testCaptureApprovedExhibitionStates() {
        let states = [
            ("finding", "somewhere.phase.finding"),
            ("ready", "somewhere.commit"),
            ("following", "somewhere.stop"),
            ("following-next-step", "somewhere.stop"),
            ("near", "somewhere.stop"),
            ("route-recovery", "somewhere.route-recovery.recalibrate"),
            ("paused", "somewhere.guidance-compass"),
            ("stopped", "somewhere.skip-stop-reason"),
            ("completed", "somewhere.recovery-reveal"),
            ("arrived-rich", "somewhere.external-map"),
            ("expired", "여정이 만료되었어요."),
        ]

        for (state, requiredElement) in states {
            let credible = state.hasPrefix("following") || state == "near"
            let app = launchHarness(state, credibleGuidance: credible)
            XCTAssertTrue(
                app.descendants(matching: .any)[requiredElement].waitForExistence(timeout: 3)
            )
            keepScreenshot(named: "\(UIDevice.current.model)-\(state)")
            terminateAndWait(app)
        }
    }

    func testCaptureLaunchConditionsSettingsNoFitFeedbackAndError() {
        let start = launchStartSurface()
        keepScreenshot(named: "\(UIDevice.current.model)-launch")
        let conditionsLink = start.buttons["somewhere.conditions-link"]
        XCTAssertTrue(conditionsLink.waitForExistence(timeout: 5))
        XCTAssertTrue(conditionsLink.isHittable)
        let back = start.buttons["somewhere.conditions-back"]
        XCTAssertTrue(tap(conditionsLink, until: back, timeout: 8))
        keepScreenshot(named: "\(UIDevice.current.model)-conditions")
        back.tap()
        terminateAndWait(start)

        let settings = XCUIApplication()
        settings.launchArguments = ["--ui-test-profile-settings", "--ui-test-no-notifications"]
        settings.launch()
        XCTAssertTrue(settings.buttons["somewhere.profile-save"].waitForExistence(timeout: 3))
        keepScreenshot(named: "\(UIDevice.current.model)-settings")
        terminateAndWait(settings)

        for (argument, required, name) in [
            ("--ui-test-no-fit", "somewhere.no-fit-review", "no-fit"),
            ("--ui-test-feedback", "somewhere.feedback.like", "feedback"),
        ] {
            let app = XCUIApplication()
            app.launchArguments = [argument, "--ui-test-no-notifications"]
            app.launch()
            let element = app.descendants(matching: .any)[required]
            XCTAssertTrue(element.waitForExistence(timeout: 3))
            keepScreenshot(named: "\(UIDevice.current.model)-\(name)")
            terminateAndWait(app)
        }

        let paused = launchHarness("following", credibleGuidance: true)
        paused.buttons["somewhere.stop"].tap()
        XCTAssertTrue(paused.buttons["somewhere.continue-journey"].waitForExistence(timeout: 3))
        keepScreenshot(named: "\(UIDevice.current.model)-stop-confirmation")
        terminateAndWait(paused)
    }

    func testCaptureErrorUsesIndependentAccessibleBanner() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-error",
            "--ui-test-state", "ready",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let error = app.descendants(matching: .any)["somewhere.error"]
        let message = app.descendants(matching: .any)["somewhere.error-message"]
        let dismiss = app.buttons["somewhere.error-dismiss"]
        let header = app.buttons["somewhere.back"]
        let primary = app.buttons["somewhere.commit"]
        let window = app.windows.firstMatch

        XCTAssertTrue(error.waitForExistence(timeout: 3))
        XCTAssertTrue(message.waitForExistence(timeout: 3))
        XCTAssertTrue(dismiss.waitForExistence(timeout: 3))
        XCTAssertTrue(header.waitForExistence(timeout: 3))
        XCTAssertTrue(primary.waitForExistence(timeout: 3))
        XCTAssertTrue(message.isHittable)
        XCTAssertTrue(dismiss.isHittable)
        XCTAssertTrue(window.frame.contains(error.frame))
        XCTAssertFalse(error.frame.intersects(header.frame))
        XCTAssertFalse(error.frame.intersects(primary.frame))
        keepScreenshot(named: "\(UIDevice.current.model)-error")
        terminateAndWait(app)
    }

    private func launchHarness(_ state: String, credibleGuidance: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = credibleGuidance
            ? ["--ui-test-state", state, "--ui-test-credible-guidance", "--ui-test-no-notifications"]
            : ["--ui-test-state", state, "--ui-test-no-notifications"]
        app.launch()
        return app
    }

    private func keepScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func terminateAndWait(_ app: XCUIApplication) {
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 5))
    }

    private func tap(
        _ element: XCUIElement,
        until destination: XCUIElement,
        timeout: TimeInterval
    ) -> Bool {
        element.tap()
        if destination.waitForExistence(timeout: timeout / 2) { return true }
        guard element.exists && element.isHittable else { return false }
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        return destination.waitForExistence(timeout: timeout / 2)
    }

    private func launchStartSurface() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-no-notifications"]
        app.launch()
        let onboarding = app.buttons["somewhere.onboarding-continue"]
        if onboarding.waitForExistence(timeout: 5) {
            onboarding.tap()
            let save = app.buttons["somewhere.profile-save"]
            if save.waitForExistence(timeout: 5) { save.tap() }
        }
        let save = app.buttons["somewhere.profile-save"]
        if save.waitForExistence(timeout: 2) { save.tap() }
        XCTAssertTrue(app.buttons["somewhere.start-journey"].waitForExistence(timeout: 5))
        return app
    }

    private func assertBoundedSurface(
        _ app: XCUIApplication,
        identifier: String,
        actionIdentifier: String,
        maxWidth: CGFloat
    ) {
        let window = app.windows.firstMatch
        let surface = app.descendants(matching: .any)[identifier]
        let action = app.buttons[actionIdentifier]
        let renderingTolerance: CGFloat = 8

        XCTAssertTrue(surface.waitForExistence(timeout: 3))
        XCTAssertTrue(window.frame.contains(surface.frame))
        XCTAssertLessThanOrEqual(surface.frame.width, maxWidth + renderingTolerance)
        XCTAssertGreaterThanOrEqual(surface.frame.minY, window.frame.minY - renderingTolerance)
        XCTAssertLessThanOrEqual(surface.frame.maxY, window.frame.maxY + renderingTolerance)
        XCTAssertTrue(action.isHittable)
    }
}
