import UIKit
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

    func testCredibleGuidanceUsesRelativeCueWithoutScrollableCoreContent() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let summary = app.descendants(matching: .any)["somewhere.direction-summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 2))
        XCTAssertTrue(summary.label.contains("왼쪽 앞"))
        XCTAssertTrue(app.staticTexts["목적지 숨김"].exists)
        XCTAssertFalse(app.staticTexts["보물 숨김"].exists)
        XCTAssertEqual(app.scrollViews.count, 0)
        XCTAssertTrue(app.buttons["somewhere.stop"].isHittable)
    }

    func testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following-next-step",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let summary = app.descendants(matching: .any)["somewhere.direction-summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 2))
        XCTAssertTrue(summary.label.contains("왼쪽 앞 방향으로 이동"))
        XCTAssertTrue(summary.label.contains("다음 동작"))
        XCTAssertTrue(summary.label.contains("우회전"))
        XCTAssertFalse(summary.label.contains("테스트로"))
    }

    func testUnknownNextStepUsesOnlySafeRelativeDetail() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following-next-step-unknown",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let summary = app.descendants(matching: .any)["somewhere.direction-summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 2))
        XCTAssertTrue(summary.label.contains("다음 동작"))
        XCTAssertTrue(summary.label.contains("약 180m 뒤"))
        XCTAssertFalse(summary.label.contains("테스트로"))
        XCTAssertFalse(summary.label.contains("테스트로에서 우회전"))
        XCTAssertFalse(summary.label.contains("우회전"))
    }

    func testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "ready",
            "--ui-test-error",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let error = app.descendants(matching: .any)["somewhere.error"]
        let message = app.descendants(matching: .any)["somewhere.error-message"]
        let dismiss = app.buttons["somewhere.error-dismiss"]
        let header = app.buttons["somewhere.back"]
        let primary = app.buttons["somewhere.commit"]
        let window = app.windows.firstMatch

        XCTAssertTrue(error.waitForExistence(timeout: 2))
        XCTAssertTrue(message.waitForExistence(timeout: 2))
        XCTAssertTrue(dismiss.waitForExistence(timeout: 2))
        XCTAssertTrue(header.waitForExistence(timeout: 2))
        XCTAssertTrue(primary.waitForExistence(timeout: 2))
        XCTAssertTrue(message.isHittable)
        XCTAssertTrue(dismiss.isHittable)
        XCTAssertTrue(window.frame.contains(error.frame))
        XCTAssertFalse(error.frame.intersects(header.frame))
        XCTAssertFalse(error.frame.intersects(primary.frame))
    }

    func testDefaultLaunchSurfaceKeepsErrorBannerAccessible() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-error",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let onboarding = app.buttons["somewhere.onboarding-continue"]
        if onboarding.waitForExistence(timeout: 2) {
            onboarding.tap()
            let profileSave = app.buttons["somewhere.profile-save"]
            if profileSave.waitForExistence(timeout: 2) { profileSave.tap() }
        }
        let profileSave = app.buttons["somewhere.profile-save"]
        if profileSave.exists { profileSave.tap() }

        let error = app.descendants(matching: .any)["somewhere.error"]
        let message = app.descendants(matching: .any)["somewhere.error-message"]
        let dismiss = app.buttons["somewhere.error-dismiss"]
        let header = app.buttons["somewhere.profile-menu"]
        let primary = app.buttons["somewhere.conditions-link"]
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
    }

    func testAccessibilityTextKeepsStopVisibleWithoutScrolling() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
            "-UIPreferredContentSizeCategoryName",
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue,
        ]
        app.launch()

        XCTAssertTrue(app.buttons["somewhere.stop"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.stop"].isHittable)
        XCTAssertTrue(app.images["somewhere.hidden-status"].exists)
        XCTAssertFalse(app.staticTexts["목적지 숨김"].exists)
        XCTAssertFalse(app.staticTexts["한식 국물 요리"].exists)
        XCTAssertFalse(app.staticTexts["나침반 바늘과 남은 거리만 확인하세요."].exists)
        XCTAssertEqual(app.scrollViews.count, 0)
    }

    func testIPadGuidanceUsesVerticalDirectionCompassInformationStopOrder() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("The proportional guidance composition is iPad-specific")
        }

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following-next-step",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let direction = app.descendants(matching: .any)["somewhere.direction-summary"]
        let compass = app.otherElements["somewhere.guidance-compass"]
        let remaining = app.staticTexts["남은 경로 약 420미터"]
        let stop = app.buttons["somewhere.stop"]
        let window = app.windows.firstMatch

        XCTAssertTrue(direction.waitForExistence(timeout: 3))
        XCTAssertTrue(compass.exists)
        XCTAssertTrue(remaining.exists)
        XCTAssertTrue(stop.exists)
        XCTAssertLessThan(direction.frame.maxY, compass.frame.minY)
        XCTAssertLessThan(compass.frame.maxY, remaining.frame.minY)
        XCTAssertLessThan(remaining.frame.maxY, stop.frame.minY)
        XCTAssertEqual(app.scrollViews.count, 0)

        let availableWidth = window.frame.width - (36 * 2)
        let compassWidthRatio = compass.frame.width / availableWidth
        XCTAssertGreaterThanOrEqual(compassWidthRatio, 0.58)
        XCTAssertLessThanOrEqual(compassWidthRatio, 0.64)
    }

    func testIPadArrivalUsesVerticalRevealAtApproximateEightyPercentWidth() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("The proportional arrival composition is iPad-specific")
        }

        let app = launchHarness("arrived-rich")
        let window = app.windows.firstMatch
        let map = app.buttons["somewhere.external-map"]
        let reveal = app.otherElements["공개된 목적지 소문난성수감자탕"]
        let completion = app.staticTexts["한 시간 뒤 이 장소가 어땠는지 한 번만 물어볼게요."]

        XCTAssertTrue(map.waitForExistence(timeout: 3))
        XCTAssertTrue(reveal.waitForExistence(timeout: 3))
        XCTAssertTrue(completion.exists)
        XCTAssertLessThan(map.frame.maxY, reveal.frame.minY)
        XCTAssertLessThan(reveal.frame.maxY, completion.frame.minY)
        XCTAssertEqual(app.scrollViews.count, 0)

        let availableWidth = window.frame.width - (36 * 2)
        let revealWidthRatio = reveal.frame.width / availableWidth
        XCTAssertGreaterThanOrEqual(revealWidthRatio, 0.75)
        XCTAssertLessThanOrEqual(revealWidthRatio, 0.85)
    }

    func testIPadConditionsUsePortraitWidthAndExplicitBackWithoutScrollNavigation() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("The portrait conditions composition is iPad-specific")
        }

        let app = launchStartSurface()
        app.buttons["somewhere.conditions-link"].tap()

        let window = app.windows.firstMatch
        let back = app.buttons["somewhere.conditions-back"]
        let budget = app.sliders["somewhere.budget-slider"]
        XCTAssertTrue(back.waitForExistence(timeout: 3))
        XCTAssertTrue(budget.waitForExistence(timeout: 3))
        XCTAssertTrue(back.isHittable)
        XCTAssertGreaterThan(budget.frame.width, window.frame.width * 0.70)
        XCTAssertTrue(window.frame.contains(budget.frame))
        XCTAssertEqual(app.scrollViews.count, 0)
    }

    func testIPhone13CompactGuidanceKeepsExistingViewportAndStopBehavior() throws {
        guard UIDevice.current.userInterfaceIdiom == .phone else {
            throw XCTSkip("The compact guidance regression is iPhone-specific")
        }

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "following",
            "--ui-test-credible-guidance",
            "--ui-test-no-notifications",
        ]
        app.launch()

        let compass = app.otherElements["somewhere.guidance-compass"]
        let direction = app.descendants(matching: .any)["somewhere.direction-summary"]
        let stop = app.buttons["somewhere.stop"]
        let window = app.windows.firstMatch
        XCTAssertTrue(compass.waitForExistence(timeout: 3))
        XCTAssertTrue(direction.exists)
        XCTAssertTrue(stop.isHittable)
        XCTAssertLessThan(compass.frame.width, window.frame.width * 0.80)
        XCTAssertEqual(app.scrollViews.count, 0)
        XCTAssertTrue(app.staticTexts["목적지 숨김"].exists)
    }

    func testIPadRouteRecoveryUsesVerticalCompassBeforeRecoveryActions() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("The proportional route recovery composition is iPad-specific")
        }

        let app = launchHarness("route-recovery")
        let compass = app.otherElements["somewhere.guidance-compass"]
        let recalibrate = app.buttons["somewhere.route-recovery.recalibrate"]
        let stop = app.buttons["somewhere.stop"]
        let window = app.windows.firstMatch

        XCTAssertTrue(recalibrate.waitForExistence(timeout: 3))
        XCTAssertTrue(compass.exists)
        XCTAssertLessThan(compass.frame.maxY, recalibrate.frame.minY)
        XCTAssertTrue(stop.isHittable)
        XCTAssertEqual(app.scrollViews.count, 0)

        let availableWidth = window.frame.width - (36 * 2)
        let compassWidthRatio = compass.frame.width / availableWidth
        XCTAssertGreaterThanOrEqual(compassWidthRatio, 0.58)
        XCTAssertLessThanOrEqual(compassWidthRatio, 0.64)
    }

    func testIPadEarlyRevealedGuidanceUsesVerticalDirectionCompassAndRemainingInformationOrder() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("The proportional revealed guidance composition is iPad-specific")
        }

        let app = launchHarness("following-revealed")
        let direction = app.descendants(matching: .any)["somewhere.direction-summary"]
        let compass = app.otherElements["somewhere.guidance-compass"]
        let distance = app.staticTexts["약 700m · 10분"]
        let reveal = app.otherElements["공개된 목적지 소문난성수감자탕"]
        let stop = app.buttons["somewhere.stop"]
        let window = app.windows.firstMatch

        XCTAssertTrue(direction.waitForExistence(timeout: 3))
        XCTAssertTrue(compass.exists)
        XCTAssertTrue(distance.exists)
        XCTAssertTrue(reveal.exists)
        XCTAssertLessThan(direction.frame.maxY, compass.frame.minY)
        XCTAssertLessThan(compass.frame.maxY, distance.frame.minY)
        XCTAssertLessThan(distance.frame.maxY, reveal.frame.minY)
        XCTAssertTrue(stop.exists)
        XCTAssertEqual(app.scrollViews.count, 0)

        let availableWidth = window.frame.width - (36 * 2)
        let compassWidthRatio = compass.frame.width / availableWidth
        XCTAssertGreaterThanOrEqual(compassWidthRatio, 0.58)
        XCTAssertLessThanOrEqual(compassWidthRatio, 0.64)
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
        XCTAssertFalse(app.buttons["somewhere.external-map"].exists)

        let compass = app.otherElements["somewhere.guidance-compass"]
        let stop = app.buttons["somewhere.stop"]
        XCTAssertTrue(compass.exists)
        XCTAssertEqual(compass.label, "방향이 숨겨진 나침반")
        XCTAssertTrue(stop.isHittable)
        XCTAssertLessThanOrEqual(compass.frame.maxY + 8, stop.frame.minY)
        XCTAssertEqual(app.scrollViews.count, 0)
        XCTAssertTrue(app.staticTexts["안내 복구"].exists)
        XCTAssertFalse(app.staticTexts["GUIDANCE RECOVERY"].exists)
    }

    func testAccessibilityRouteRecoveryKeepsChoicesAndStopInOneViewport() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-test-state", "route-recovery",
            "--ui-test-no-notifications",
            "-UIPreferredContentSizeCategoryName",
            UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue,
        ]
        app.launch()

        let recalibrate = app.buttons["somewhere.route-recovery.recalibrate"]
        let reroute = app.buttons["somewhere.route-recovery.reroute"]
        let cachedRoute = app.buttons["somewhere.route-recovery.cached-route"]
        let stop = app.buttons["somewhere.stop"]
        XCTAssertTrue(recalibrate.waitForExistence(timeout: 2))
        XCTAssertEqual(recalibrate.label, "나침반 맞추기")
        XCTAssertEqual(reroute.label, "새 경로 찾기")
        XCTAssertEqual(cachedRoute.label, "기존 경로 계속")
        XCTAssertTrue(app.staticTexts["위치 복구"].exists)
        XCTAssertTrue(app.staticTexts["복구 방법"].exists)
        XCTAssertTrue(recalibrate.isHittable)
        XCTAssertTrue(reroute.isHittable)
        XCTAssertTrue(cachedRoute.isHittable)
        XCTAssertTrue(stop.isHittable)
        XCTAssertEqual(app.scrollViews.count, 0)
        XCTAssertFalse(app.otherElements["somewhere.guidance-compass"].exists)
    }

    func testRouteRecoveryRequiresStopBeforeExternalMap() {
        let app = launchHarness("route-recovery")
        XCTAssertTrue(app.buttons["somewhere.stop"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["somewhere.external-map"].exists)
    }

    func testPausedStopSheetOffersExternalMapWarning() {
        let app = launchHarness("following")
        app.buttons["somewhere.stop"].tap()
        let map = app.buttons["somewhere.paused-external-map"]
        XCTAssertTrue(map.waitForExistence(timeout: 2))
        map.tap()
        XCTAssertTrue(app.buttons["somewhere.external-map-confirm"].waitForExistence(timeout: 2))
    }

    func testStopReasonKeepsSkipExitAvailable() {
        let app = launchHarness("stopped")
        XCTAssertTrue(app.buttons["somewhere.stop-reason.safety-concern"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.skip-stop-reason"].exists)
        XCTAssertTrue(app.staticTexts["목적지 숨김"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["보물 숨김"].exists)
    }

    func testRichArrivalHierarchyIsRendered() {
        let app = launchHarness("arrived-rich")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["소문난성수감자탕"].exists)
        XCTAssertTrue(app.staticTexts["서울특별시 성동구 연무장길 45"].exists)
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
        let compass = app.otherElements["somewhere.no-fit-compass"]
        XCTAssertTrue(compass.exists)
        XCTAssertEqual(compass.label, "방향이 숨겨진 나침반")
        XCTAssertTrue(app.staticTexts["아직 찾는 중"].exists)
        XCTAssertFalse(app.staticTexts["NO FIT YET"].exists)
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
        let app = launchHarness("following")
        app.buttons["somewhere.stop"].tap()
        let externalMap = app.buttons["somewhere.paused-external-map"]
        XCTAssertTrue(externalMap.waitForExistence(timeout: 2))
        externalMap.tap()
        XCTAssertTrue(app.buttons["somewhere.external-map-confirm"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.external-map-cancel"].exists)
    }

    func testKoreanSafetyAndArrivalLabelsAreUsed() {
        let paused = launchHarness("following")
        paused.buttons["somewhere.stop"].tap()
        XCTAssertTrue(paused.staticTexts["안전 일시정지"].waitForExistence(timeout: 2))
        let arrived = launchHarness("arrived-rich")
        XCTAssertTrue(arrived.staticTexts["목적지 발견"].waitForExistence(timeout: 2))
        XCTAssertFalse(arrived.staticTexts["DESTINATION FOUND"].exists)
    }

    func testPlaceReactionSheetUsesTwoPrimaryReactionsAndAVisitException() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-feedback", "--ui-test-no-notifications"]
        app.launch()
        XCTAssertTrue(app.staticTexts["somewhere.feedback-brand"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.feedback.dislike"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["somewhere.feedback.like"].exists)
        XCTAssertTrue(app.buttons["somewhere.feedback.did_not_visit"].exists)
        XCTAssertFalse(app.buttons["somewhere.feedback.love"].exists)
    }

    func testConditionsUseABudgetSliderAndKeepDietarySettingsOutOfTheJourneyForm() {
        let app = launchStartSurface()
        let conditions = app.buttons["somewhere.conditions-link"]
        XCTAssertTrue(conditions.waitForExistence(timeout: 5))
        XCTAssertEqual(conditions.label, "탐색 조건")
        conditions.tap()

        XCTAssertTrue(app.sliders["somewhere.budget-slider"].waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["somewhere.profile-settings"].exists)
    }

    func testProfilePickerIsReachableFromLaunchSurface() {
        let app = launchStartSurface()
        let menu = app.buttons["somewhere.profile-menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 2))
        menu.tap()
        let profile = app.buttons["식이·알레르기 설정"]
        XCTAssertTrue(profile.waitForExistence(timeout: 2))
        profile.tap()
        XCTAssertTrue(app.textFields["somewhere.profile-search-dietary"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.switches["somewhere.profile-dietary-none"].exists)
        XCTAssertTrue(app.switches["somewhere.profile-allergies-none"].exists)
    }

    func testHarnessCanShowRevealedDestination() {
        let app = launchHarness("arrived-revealed")
        XCTAssertTrue(app.staticTexts["somewhere.revealed-name"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["somewhere.revealed-address"].exists)
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
        if onboarding.waitForExistence(timeout: 5) {
            onboarding.tap()
            let profileSave = app.buttons["somewhere.profile-save"]
            if profileSave.waitForExistence(timeout: 5) { profileSave.tap() }
        }
        let profileSave = app.buttons["somewhere.profile-save"]
        if profileSave.exists { profileSave.tap() }
        return app
    }
}
