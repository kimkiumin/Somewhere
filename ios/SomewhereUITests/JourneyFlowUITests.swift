import XCTest

@MainActor
final class JourneyFlowUITests: XCTestCase {
    func testStartSurfaceHidesDestinationIdentity() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-no-notifications"]
        app.launch()
        let onboarding = app.buttons["somewhere.onboarding-continue"]
        if onboarding.waitForExistence(timeout: 2) {
            onboarding.tap()
            let profileSave = app.buttons["somewhere.profile-save"]
            if profileSave.waitForExistence(timeout: 2) { profileSave.tap() }
        }
        let profileSave = app.buttons["somewhere.profile-save"]
        if profileSave.exists { profileSave.tap() }
        XCTAssertTrue(app.buttons["somewhere.start-journey"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["somewhere.logo"].exists)
        XCTAssertFalse(app.staticTexts["Revealed venue"].exists)
    }

    func testStopControlIsImmediatelyAvailableDuringGuidance() {
        let app = launchHarness("following")
        let stop = app.buttons["somewhere.stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: 2))
        stop.tap()
        XCTAssertTrue(app.buttons["somewhere.continue-journey"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.confirm-stop"].exists)
    }

    func testCredibleGuidanceDrivesTheAnimatedCompassWithoutRevealControl() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let compass = app.otherElements["somewhere.guidance-compass"]
        XCTAssertTrue(compass.waitForExistence(timeout: 2))
        XCTAssertEqual(compass.label, "진행 방향 315도")
        XCTAssertTrue(app.staticTexts["남은 경로 약 420미터"].exists)
        XCTAssertFalse(app.buttons["somewhere.reveal"].exists)
    }

    func testBackControlIsVisibleDuringGuidance() {
        let app = launchHarness("following")
        XCTAssertTrue(app.buttons["somewhere.back"].waitForExistence(timeout: 2))
    }

    func testGuidanceContinuesAfterSafetyReveal() {
        let app = launchHarness("following-revealed")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.stop"].exists)
    }

    func testArrivalAutomaticallyShowsDestination() {
        let app = launchHarness("arrived-rich")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["somewhere.arrival-reveal"].exists)
    }

    func testRevealReasonSheetPrecedesDisclosure() {
        let app = launchHarness("following")
        XCTAssertFalse(app.buttons["somewhere.reveal"].exists)
        let stop = app.buttons["somewhere.stop"]
        XCTAssertTrue(stop.waitForExistence(timeout: 2))
        stop.tap()
        let reveal = app.buttons["somewhere.paused-reveal"]
        XCTAssertTrue(reveal.waitForExistence(timeout: 2))
        reveal.tap()
        XCTAssertTrue(app.buttons["somewhere.reveal-reason.curiosity"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.reveal-reason-skipped"].exists)
    }

    func testRouteRecoveryOffersReviewedChoices() {
        let app = launchHarness("route-recovery")
        XCTAssertTrue(app.buttons["somewhere.route-recovery.recalibrate"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.route-recovery.reroute"].exists)
        XCTAssertTrue(app.buttons["somewhere.route-recovery.cached-route"].exists)
        XCTAssertTrue(app.buttons["somewhere.external-map"].exists)
    }

    func testStopReasonKeepsSkipExitAvailable() {
        let app = launchHarness("stopped")
        XCTAssertTrue(app.buttons["somewhere.stop-reason.safety-concern"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.skip-stop-reason"].exists)
    }

    func testRichArrivalHierarchyIsRendered() {
        let app = launchHarness("arrived-rich")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["해빛가 빌딩"].exists)
        XCTAssertTrue(app.staticTexts["2층 201호"].exists)
        XCTAssertTrue(app.staticTexts["도보 시간과 조건 충돌이 적은 곳이에요."].exists)
    }

    func testPrivateModeKeepsOnlyDirectionAndDistance() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-state", "following", "--ui-test-private", "--ui-test-no-notifications"]
        app.launch()
        XCTAssertTrue(app.staticTexts["예상 여정"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["보통 가격대"].exists)
    }

    func testNoFitShowsAffectedConditionsBeforeReturning() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-no-fit", "--ui-test-no-notifications"]
        app.launch()
        XCTAssertTrue(app.buttons["somewhere.no-fit-review"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["예산"].exists)
        XCTAssertTrue(app.staticTexts["식이 조건"].exists)
    }

    func testGuardedRecoveryRequiresExplicitReview() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "completed",
            "--ui-test-recovery-review",
            "--ui-test-no-notifications",
        ]
        app.launch()
        let confirm = app.buttons["somewhere.confirm-recovery"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 2))
        XCTAssertFalse(confirm.isEnabled)
        let reviewed = app.switches["somewhere.recovery-reviewed"]
        XCTAssertTrue(reviewed.exists)
        reviewed.tap()
        XCTAssertTrue(confirm.isEnabled)
    }

    func testExternalMapHandoffRequiresWarning() {
        let app = launchHarness("following-revealed")
        let externalMap = app.buttons["somewhere.external-map"]
        XCTAssertTrue(externalMap.waitForExistence(timeout: 2))
        externalMap.tap()
        XCTAssertTrue(app.buttons["somewhere.external-map-confirm"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.external-map-cancel"].exists)
    }

    func testPlaceReactionSheetOffersAllPrototypeReactions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-feedback", "--ui-test-no-notifications"]
        app.launch()
        XCTAssertTrue(app.buttons["somewhere.feedback.love"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.feedback.dislike"].exists)
        XCTAssertTrue(app.buttons["somewhere.feedback.like"].exists)
        XCTAssertTrue(app.buttons["somewhere.feedback.did_not_visit"].exists)
    }

    func testProfilePickerIsReachableFromLaunchSurface() {
        let app = launchStartSurface()
        let profile = app.buttons["somewhere.profile-settings"]
        XCTAssertTrue(profile.waitForExistence(timeout: 2))
        profile.tap()
        XCTAssertTrue(app.textFields["somewhere.profile-search-dietary"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.switches["somewhere.profile-dietary-none"].exists)
        XCTAssertTrue(app.switches["somewhere.profile-allergies-none"].exists)
    }

    func testHarnessCanShowRevealedDestination() {
        let app = launchHarness("arrived-revealed")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["somewhere.revealed-address"].exists)
    }

    func testHarnessCanShowGuardedRecovery() {
        let app = launchHarness("completed")
        XCTAssertTrue(app.buttons["somewhere.request-recovery"].waitForExistence(timeout: 2))
    }

    func testHarnessKeepsRevealedDestinationVisibleAfterStop() {
        let app = launchHarness("stopped-revealed")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["somewhere.revealed-address"].exists)
    }

    func testExpiredJourneyDoesNotPoint() {
        let app = launchHarness("expired")
        XCTAssertTrue(app.staticTexts["여정이 만료되었어요."].waitForExistence(timeout: 2))
        XCTAssertFalse(app.images["신뢰 가능한 진행 방향"].exists)
    }

    private func launchHarness(_ state: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-state", state, "--ui-test-no-notifications"]
        app.launch()
        return app
    }

    private func launchStartSurface() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-no-notifications"]
        app.launch()
        let onboarding = app.buttons["somewhere.onboarding-continue"]
        if onboarding.waitForExistence(timeout: 2) {
            onboarding.tap()
            let profileSave = app.buttons["somewhere.profile-save"]
            if profileSave.waitForExistence(timeout: 2) { profileSave.tap() }
        }
        let profileSave = app.buttons["somewhere.profile-save"]
        if profileSave.exists { profileSave.tap() }
        return app
    }
}
