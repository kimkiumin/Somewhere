# iPad Portrait Exhibition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one portrait Universal build whose primary exhibition layouts are verified on iPad Pro (11-inch) (2nd generation) and iPhone 13 without changing the backend or the collaborator-approved compass concept.

**Architecture:** Keep the existing `JourneyStore`, projections, API client, sensor controllers, and SwiftUI state flow. Add a pure available-space layout policy, inject its metrics through the SwiftUI environment, and compose compact iPhone and regular-width iPad presentations from the same controls and artwork. Keep deterministic location/heading behavior Debug-only and preserve the existing iPhone 15 Pro Max lane as development regression evidence rather than exhibition acceptance.

**Tech Stack:** Swift 6, SwiftUI, iOS/iPadOS 17+, XcodeGen 2.42.0, XCTest/XCUITest, Xcode 26.6, iOS 26.5 Simulator, Bun verification scripts

**Spec:** `docs/superpowers/specs/2026-08-25-ipad-portrait-exhibition-design.md`

## Global Constraints

- The primary exhibition device is `iPad Pro (11-inch) (2nd generation)` in portrait.
- The secondary exhibition device is `iPhone 13` in portrait.
- The owner's iPhone 15 Pro Max is development regression evidence only.
- Preserve the collaborator's `RollCompassShell`, `RollCompassNeedle`, wordmark, warm pirate-compass mood, and current journey sequence.
- Do not modify `server/`, `contracts/`, Worker behavior, recommendation behavior, API wire models, destination disclosure rules, or persistence contracts.
- Keep iOS deployment target `17.0` and Swift language version `6.0`.
- Keep the main launch and active-guidance surfaces scroll-free at the default content size.
- Conditions use explicit surface navigation; a scroll position must not act as navigation.
- Accessibility Dynamic Type may use a compact scrollable fallback rather than clip controls.
- Stop remains visible and hittable during active guidance.
- Untrusted, paused, and recovery guidance never displays the needle.
- Real Core Location remains the Release behavior; deterministic sensor replay remains Debug-only.
- No ESP32 firmware, fake BLE connection, map-first UI, or iPad-only target enters this change.

---

## File Structure

### New files

- `ios/Somewhere/UI/SomewhereLayout.swift` — pure layout classification, metrics, environment key, and reusable bounded containers.
- `ios/SomewhereTests/SomewhereLayoutTests.swift` — deterministic layout-policy tests for the two exhibition sizes and accessibility fallback.
- `ios/SomewhereUITests/ExhibitionLayoutUITests.swift` — target-state fit, hit testing, and named screenshot attachments.
- `scripts/ios/run-exhibition-matrix.mjs` — creates exact target simulators and runs the native unit/UI matrix reproducibly.

### Modified files

- `ios/project.yml` — explicit Universal device family.
- `ios/Somewhere/Resources/Info.plist` — explicit portrait iPad orientation and full-screen exhibition policy.
- `ios/Somewhere/UI/RootView.swift` — resolve and inject layout metrics; bound sheets and root content.
- `ios/Somewhere/UI/ConstraintView.swift` — replace scroll-position navigation and add iPad two-column conditions.
- `ios/Somewhere/UI/CompassView.swift` — add regular-width compass-led guidance composition.
- `ios/Somewhere/UI/ArrivalView.swift` — add bounded iPad reveal composition.
- `ios/Somewhere/UI/RecoveryView.swift` — split status/reveal and recovery controls on iPad.
- `ios/Somewhere/UI/ProfileSettingsView.swift` — show dietary/allergy panes side by side on iPad.
- `ios/Somewhere/UI/JourneyReasonViews.swift` — bound reason, recovery, and map-warning content.
- `ios/Somewhere/UI/NoFitView.swift` — bound empty-state width.
- `ios/Somewhere/UI/StopConfirmationView.swift` — bound confirmation content.
- `ios/Somewhere/App/SomewhereApp.swift` — Debug-only deterministic finding, ready, near, and error capture states.
- `ios/Somewhere/Application/JourneyStore.swift` — Debug-only error presentation hook for screenshot evidence.
- `ios/README.md` — exact target simulator and physical-install commands.
- `docs/operations/native-ios-collaboration-handoff.md` — distinguish exhibition acceptance devices from the existing release-evidence device.

---

### Task 1: Universal Target and Pure Layout Policy

**Files:**
- Create: `ios/Somewhere/UI/SomewhereLayout.swift`
- Create: `ios/SomewhereTests/SomewhereLayoutTests.swift`
- Modify: `ios/project.yml:26-43`
- Modify: `ios/Somewhere/Resources/Info.plist:16-17`

**Interfaces:**
- Consumes: available container `width`, `height`, and `isAccessibilitySize`.
- Produces: `SomewhereLayoutMode`, `SomewhereLayoutMetrics.resolve(width:height:isAccessibilitySize:)`, and `EnvironmentValues.somewhereLayout`.

- [ ] **Step 1: Write failing layout-policy tests**

Create `ios/SomewhereTests/SomewhereLayoutTests.swift`:

```swift
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
```

- [ ] **Step 2: Generate the project and verify the tests fail for the missing layout types**

Run:

```bash
cd ios
xcodegen generate --spec project.yml
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereTests/SomewhereLayoutTests CODE_SIGNING_ALLOWED=NO
```

Expected: compilation fails because `SomewhereLayoutMetrics` is undefined.

- [ ] **Step 3: Implement the layout policy and environment value**

Create `ios/Somewhere/UI/SomewhereLayout.swift`:

```swift
import SwiftUI

enum SomewhereLayoutMode: String, Equatable, Sendable {
    case compact
    case exhibition
}

struct SomewhereLayoutMetrics: Equatable, Sendable {
    let mode: SomewhereLayoutMode
    let contentMaxWidth: CGFloat
    let horizontalPadding: CGFloat
    let compassDiameter: CGFloat
    let sheetMaxWidth: CGFloat
    let columnSpacing: CGFloat

    var isExhibition: Bool { mode == .exhibition }

    static func resolve(width: CGFloat, height: CGFloat, isAccessibilitySize: Bool) -> SomewhereLayoutMetrics {
        let exhibition = width >= 700 && !isAccessibilitySize
        if !exhibition {
            let contentWidth = max(280, min(520, width - 40))
            return SomewhereLayoutMetrics(
                mode: .compact,
                contentMaxWidth: contentWidth,
                horizontalPadding: 20,
                compassDiameter: min(360, contentWidth),
                sheetMaxWidth: min(520, contentWidth),
                columnSpacing: 16
            )
        }

        let padding: CGFloat = width >= 900 ? 52 : 36
        let contentWidth = min(1_080, width - padding * 2)
        let widthBound = min(520, max(410, contentWidth * 0.64))
        return SomewhereLayoutMetrics(
            mode: .exhibition,
            contentMaxWidth: contentWidth,
            horizontalPadding: padding,
            compassDiameter: min(widthBound, max(410, height * 0.44)),
            sheetMaxWidth: 620,
            columnSpacing: 28
        )
    }
}

private struct SomewhereLayoutMetricsKey: EnvironmentKey {
    static let defaultValue = SomewhereLayoutMetrics.resolve(
        width: 390,
        height: 844,
        isAccessibilitySize: false
    )
}

extension EnvironmentValues {
    var somewhereLayout: SomewhereLayoutMetrics {
        get { self[SomewhereLayoutMetricsKey.self] }
        set { self[SomewhereLayoutMetricsKey.self] = newValue }
    }
}

struct SomewhereBoundedSurface<Content: View>: View {
    @Environment(\.somewhereLayout) private var layout
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content.frame(maxWidth: layout.contentMaxWidth).frame(maxWidth: .infinity)
    }
}

struct SomewhereBoundedSheet<Content: View>: View {
    @Environment(\.somewhereLayout) private var layout
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content.frame(maxWidth: layout.sheetMaxWidth).frame(maxWidth: .infinity)
    }
}
```

- [ ] **Step 4: Declare Universal portrait support**

Add under `targets.Somewhere.settings.base` in `ios/project.yml`:

```yaml
TARGETED_DEVICE_FAMILY: "1,2"
```

Add to `ios/Somewhere/Resources/Info.plist`:

```xml
<key>UISupportedInterfaceOrientations~ipad</key>
<array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationPortraitUpsideDown</string>
</array>
<key>UIRequiresFullScreen</key><true/>
```

- [ ] **Step 5: Re-generate and run layout tests on both target simulators**

Run:

```bash
cd ios
xcodegen generate --spec project.yml
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereTests/SomewhereLayoutTests CODE_SIGNING_ALLOWED=NO
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereTests/SomewhereLayoutTests CODE_SIGNING_ALLOWED=NO
```

Expected: four layout tests pass on both destinations.

- [ ] **Step 6: Commit the Universal layout foundation**

```bash
git add ios/project.yml ios/Somewhere/Resources/Info.plist \
  ios/Somewhere/UI/SomewhereLayout.swift ios/SomewhereTests/SomewhereLayoutTests.swift
git commit -m "feat(ios): add Universal exhibition layout policy"
```

---

### Task 2: Inject Responsive Metrics and Replace Scroll-Position Navigation

**Files:**
- Modify: `ios/Somewhere/UI/RootView.swift:3-104`
- Modify: `ios/Somewhere/UI/ConstraintView.swift:4-108`
- Test: `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`

**Interfaces:**
- Consumes: `SomewhereLayoutMetrics.resolve` and `EnvironmentValues.somewhereLayout` from Task 1.
- Produces: root identifiers `somewhere.layout.compact` and `somewhere.layout.exhibition`; explicit launch/conditions surface transitions.

- [ ] **Step 1: Add failing launch and conditions fit tests**

Create `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`:

```swift
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
```

- [ ] **Step 2: Run the iPad test and verify the layout identifier is absent**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests CODE_SIGNING_ALLOWED=NO
```

Expected: failure because `somewhere.layout.exhibition` does not exist.

- [ ] **Step 3: Resolve and inject metrics in `RootView`**

Add `@Environment(\.dynamicTypeSize) private var dynamicTypeSize` and wrap the existing root body in `GeometryReader`:

```swift
GeometryReader { proxy in
    let layout = SomewhereLayoutMetrics.resolve(
        width: proxy.size.width,
        height: proxy.size.height,
        isAccessibilitySize: dynamicTypeSize.isAccessibilitySize
    )
    ZStack {
        SomewhereBackground()
        SomewhereBoundedSurface { rootContent }
            .padding(.horizontal, layout.horizontalPadding)
            .padding(.vertical, 18)
    }
    .environment(\.somewhereLayout, layout)
    .accessibilityIdentifier("somewhere.layout.\(layout.mode.rawValue)")
}
```

Extract the current phase `Group` into a private `rootContent` view. Wrap every sheet body with `SomewhereBoundedSheet` while preserving existing bindings and actions.

- [ ] **Step 4: Replace the launch/conditions long-page scroll in `ConstraintView`**

Remove `Section`, `ScrollViewReader`, `proxy.scrollTo`, and `.scrollTargetLayout()`. Use `isShowingConditions` as actual view state:

```swift
@Environment(\.somewhereLayout) private var layout

GeometryReader { geometry in
    Group {
        if isShowingConditions {
            conditionsPage(height: geometry.size.height)
                .transition(.move(edge: .trailing).combined(with: .opacity))
        } else {
            launchPage(height: geometry.size.height, width: geometry.size.width) {
                withAnimation(.snappy(duration: 0.32)) { isShowingConditions = true }
            }
            .transition(.move(edge: .leading).combined(with: .opacity))
        }
    }
}
.animation(.snappy(duration: 0.32), value: isShowingConditions)
```

Add an iPad two-column branch and retain a compact content scroll only when necessary:

```swift
@ViewBuilder
private func conditionsPage(height: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 14) {
        conditionsHeader {
            withAnimation(.snappy(duration: 0.32)) { isShowingConditions = false }
        }
        if layout.isExhibition {
            HStack(alignment: .top, spacing: layout.columnSpacing) {
                VStack(spacing: 12) { categoryCard; partyCard; locationStatus }
                VStack(spacing: 12) {
                    walkingCard
                    budgetCard
                    if showsAdvanced { advancedCard }
                    startButton
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)
        } else {
            ScrollView(showsIndicators: false) { conditions.padding(.bottom, 24) }
        }
    }
    .frame(minHeight: height, alignment: .top)
}
```

Use `layout.compassDiameter` for the launch compass.

- [ ] **Step 5: Run launch/conditions tests on iPad and iPhone 13**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests CODE_SIGNING_ALLOWED=NO
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests CODE_SIGNING_ALLOWED=NO
```

Expected: iPad reports exhibition, iPhone 13 reports compact, and both have working Back controls.

- [ ] **Step 6: Commit explicit surface navigation**

```bash
git add ios/Somewhere/UI/RootView.swift ios/Somewhere/UI/ConstraintView.swift \
  ios/SomewhereUITests/ExhibitionLayoutUITests.swift
git commit -m "feat(ios): adapt launch and conditions for portrait iPad"
```

---

### Task 3: Compass-Led iPad Guidance Without Core Scrolling

**Files:**
- Modify: `ios/Somewhere/UI/CompassView.swift:3-326`
- Modify: `ios/Somewhere/UI/SomewhereCompass.swift:84-203`
- Modify: `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`
- Test: `ios/SomewhereTests/SomewhereCompassTests.swift`

**Interfaces:**
- Consumes: `EnvironmentValues.somewhereLayout`, `SomewhereCompassMode`, existing `JourneyProjection`, and existing `JourneyStore.guidance`.
- Produces: scroll-free exhibition guidance while retaining all existing accessibility identifiers and needle trust rules.

- [ ] **Step 1: Add failing iPad guidance fit assertions**

Append to `ExhibitionLayoutUITests`:

```swift
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
```

- [ ] **Step 2: Run the iPad guidance test before changing layout**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testGuidanceFitsIPadAndKeepsStopVisible \
  CODE_SIGNING_ALLOWED=NO
```

Expected: the result bundle captures the current phone-oriented composition before the iPad split is introduced.

- [ ] **Step 3: Add an exhibition branch to `CompassView`**

Read layout metrics with `@Environment(\.somewhereLayout)`. Select regular-width content before the existing compact branches:

```swift
@ViewBuilder
private var journeyContent: some View {
    if layout.isExhibition {
        exhibitionJourneyContent
    } else if usesCompactGuidanceLayout {
        compactJourneyContent
    } else if projection.phase == .routeRecovery {
        routeRecoveryContent
    } else {
        existingScrollableJourneyContent
    }
}
```

Extract the current compact and scrollable branches into `compactJourneyContent` and `existingScrollableJourneyContent` without changing their view order. Implement the iPad split from the same subviews:

```swift
@ViewBuilder
private var exhibitionJourneyContent: some View {
    if projection.phase == .routeRecovery {
        HStack(spacing: layout.columnSpacing) {
            compassDial(size: min(360, layout.compassDiameter))
                .frame(maxWidth: .infinity)
            RouteRecoveryView(store: store).frame(width: 300)
        }
        .frame(maxHeight: .infinity)
    } else if projection.revealed == true {
        HStack(alignment: .center, spacing: layout.columnSpacing) {
            RevealView(projection: projection).frame(maxWidth: .infinity)
            VStack(spacing: 14) {
                phaseHeader
                compassDial(size: min(320, layout.compassDiameter))
                directionSummary
                distanceCard
            }
            .frame(width: 310)
        }
        .frame(maxHeight: .infinity)
    } else {
        HStack(alignment: .center, spacing: layout.columnSpacing) {
            VStack(spacing: 10) {
                if !usesCompactGuidanceLayout { phaseHeader }
                compassDial(size: layout.compassDiameter)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: 14) { directionSummary; distanceCard; safetyNote }
                .frame(width: 300)
        }
        .frame(maxHeight: .infinity)
    }
}
```

Keep `actionArea` outside this content branch so `멈춤` remains anchored below the split.

- [ ] **Step 4: Protect the needle bounds with a geometry unit test**

Append to `SomewhereCompassTests.swift`:

```swift
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
```

Do not change the supplied shell or needle assets. If this exposes the source-art pivot mismatch, adjust only `hubCorrection` and rerun every existing compass-motion test.

- [ ] **Step 5: Run guidance and compass tests on both target devices**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereTests/SomewhereCompassTests \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests CODE_SIGNING_ALLOWED=NO
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereTests/SomewhereCompassTests \
  -only-testing:SomewhereUITests/JourneyFlowUITests/testCredibleGuidanceUsesRelativeCueWithoutScrollableCoreContent \
  -only-testing:SomewhereUITests/JourneyFlowUITests/testAccessibilityTextKeepsStopVisibleWithoutScrolling \
  CODE_SIGNING_ALLOWED=NO
```

Expected: all selected tests pass; iPad uses the split and iPhone 13 retains the compact composition.

- [ ] **Step 6: Commit iPad guidance**

```bash
git add ios/Somewhere/UI/CompassView.swift ios/Somewhere/UI/SomewhereCompass.swift \
  ios/SomewhereTests/SomewhereCompassTests.swift ios/SomewhereUITests/ExhibitionLayoutUITests.swift
git commit -m "feat(ios): compose compass-led iPad guidance"
```

---

### Task 4: Adapt Arrival, Recovery, Settings, and Sheets

**Files:**
- Modify: `ios/Somewhere/UI/ArrivalView.swift:3-48`
- Modify: `ios/Somewhere/UI/RecoveryView.swift:3-208`
- Modify: `ios/Somewhere/UI/ProfileSettingsView.swift:3-170`
- Modify: `ios/Somewhere/UI/JourneyReasonViews.swift:3-150`
- Modify: `ios/Somewhere/UI/NoFitView.swift:3-40`
- Modify: `ios/Somewhere/UI/StopConfirmationView.swift:3-50`
- Modify: `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`

**Interfaces:**
- Consumes: `EnvironmentValues.somewhereLayout`, `SomewhereBoundedSurface`, and `SomewhereBoundedSheet`.
- Produces: intentionally bounded secondary states and iPad two-column profile/recovery compositions.

- [ ] **Step 1: Add failing state-surface tests**

Append to `ExhibitionLayoutUITests`:

```swift
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
```

- [ ] **Step 2: Run the new tests on the iPad target**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests CODE_SIGNING_ALLOWED=NO
```

Expected: tests identify any action that requires unintended full-page scrolling or a stretched sheet.

- [ ] **Step 3: Add adaptive two-region compositions**

Apply this branch to `ArrivalView`, `RecoveryView`, and `ProfileSettingsView`:

```swift
@Environment(\.somewhereLayout) private var layout

@ViewBuilder
private var adaptiveContent: some View {
    if layout.isExhibition {
        HStack(alignment: .top, spacing: layout.columnSpacing) {
            primaryPane.frame(maxWidth: .infinity)
            secondaryPane.frame(maxWidth: .infinity)
        }
    } else {
        VStack(spacing: 16) { primaryPane; secondaryPane }
    }
}
```

Use these pane boundaries:

- `ArrivalView`: header/reveal card in `primaryPane`; map and completion affordances in `secondaryPane`.
- `RecoveryView`: status or revealed destination in `primaryPane`; stop reasons or completion actions in `secondaryPane`. Put only the six-reason list in an internal `ScrollView`.
- `ProfileSettingsView`: intro above, dietary options left, allergy options right on iPad; retain one vertical flow on compact windows.

- [ ] **Step 4: Bound sheet and empty-state contents**

Wrap `RevealReasonView`, `ExternalMapWarningView`, `StopConfirmationView`, and `NoFitView` content with `SomewhereBoundedSheet` or `SomewhereBoundedSurface`:

```swift
SomewhereBoundedSheet {
    VStack(spacing: 20) {
        existingContent
    }
    .padding(28)
}
```

`existingContent` means moving the current controls unchanged into a private `@ViewBuilder` property named `existingContent`; preserve their order, actions, copy, and identifiers.

- [ ] **Step 5: Run all UI states on iPad and compact regressions on iPhone 13**

Run:

```bash
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/ExhibitionLayoutUITests \
  -only-testing:SomewhereUITests/JourneyFlowUITests CODE_SIGNING_ALLOWED=NO
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereUITests/JourneyFlowUITests CODE_SIGNING_ALLOWED=NO
```

Expected: all UI tests pass on both target devices.

- [ ] **Step 6: Commit secondary-state adaptation**

```bash
git add ios/Somewhere/UI/ArrivalView.swift ios/Somewhere/UI/RecoveryView.swift \
  ios/Somewhere/UI/ProfileSettingsView.swift ios/Somewhere/UI/JourneyReasonViews.swift \
  ios/Somewhere/UI/NoFitView.swift ios/Somewhere/UI/StopConfirmationView.swift \
  ios/SomewhereUITests/ExhibitionLayoutUITests.swift
git commit -m "feat(ios): adapt journey states and sheets for iPad"
```

---

### Task 5: Exact Simulator Matrix and Screenshot Evidence

**Files:**
- Create: `scripts/ios/run-exhibition-matrix.mjs`
- Modify: `ios/Somewhere/App/SomewhereApp.swift:24-105`
- Modify: `ios/Somewhere/Application/JourneyStore.swift:303-331`
- Modify: `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`
- Modify: `ios/README.md:64-100`

**Interfaces:**
- Consumes: the XcodeGen project, exact Simulator device-type identifiers, and the Debug launch-state harness.
- Produces: timestamped result bundles with named screenshot attachments under `.local-artifacts/ios-exhibition/`.

- [ ] **Step 1: Extend the Debug-only deterministic state harness**

Add these cases to `UITestProjectionFactory.make` in `SomewhereApp.swift`:

```swift
case "finding":
    json = "{\(common),\"phase\":\"finding\",\"pollAfterSeconds\":2,\"actions\":[\"poll\",\"cancel\"]}"
case "ready":
    json = "{\(common),\(disclosure),\"phase\":\"ready\",\"revealed\":false,\"actions\":[\"commit\",\"stop\"]}"
case "near":
    json = "{\(common),\(disclosure),\"phase\":\"near\",\"revealed\":false,\"guidance\":{\"kind\":\"route\",\"encodedPolyline\":\"test\",\"routeDigest\":\"sha256:\(String(repeating: "a", count: 64))\",\"routeVersion\":\"test-v1\",\"expiresAt\":4102444800000},\"actions\":[\"stop\",\"route-recover\",\"arrival\"]}"
```

Add this Debug-only method to `JourneyStore`:

```swift
func presentErrorForTesting() {
    presentedError = .unavailable
}
```

Call it from `SomewhereApp.init()` when launch arguments contain `--ui-test-error`. Keep the method and launch-argument handling inside existing `#if DEBUG` boundaries.

- [ ] **Step 2: Add named screenshot attachments for approved states**

Add this helper to `ExhibitionLayoutUITests`:

```swift
private func keepScreenshot(named name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
}
```

Add deterministic state captures:

```swift
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
        app.terminate()
    }
}
```

Add separate capture tests for surfaces that use flags or interaction rather than projection states:

```swift
func testCaptureLaunchConditionsSettingsNoFitFeedbackAndError() {
    let start = launchStartSurface()
    keepScreenshot(named: "\(UIDevice.current.model)-launch")
    start.buttons["somewhere.conditions-link"].tap()
    XCTAssertTrue(start.buttons["somewhere.conditions-back"].waitForExistence(timeout: 3))
    keepScreenshot(named: "\(UIDevice.current.model)-conditions")
    start.buttons["somewhere.conditions-back"].tap()
    start.buttons["somewhere.profile-menu"].tap()
    start.buttons["식이·알레르기 설정"].tap()
    XCTAssertTrue(start.buttons["somewhere.profile-save"].waitForExistence(timeout: 3))
    keepScreenshot(named: "\(UIDevice.current.model)-settings")
    start.terminate()

    for (argument, required, name) in [
        ("--ui-test-no-fit", "somewhere.no-fit-review", "no-fit"),
        ("--ui-test-feedback", "somewhere.feedback.like", "feedback"),
        ("--ui-test-error", "오류 안내 닫기", "error"),
    ] {
        let app = XCUIApplication()
        app.launchArguments = [argument, "--ui-test-no-notifications"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)[required].waitForExistence(timeout: 3))
        keepScreenshot(named: "\(UIDevice.current.model)-\(name)")
        app.terminate()
    }

    let paused = launchHarness("following", credibleGuidance: true)
    paused.buttons["somewhere.stop"].tap()
    XCTAssertTrue(paused.buttons["somewhere.continue-journey"].waitForExistence(timeout: 3))
    keepScreenshot(named: "\(UIDevice.current.model)-stop-confirmation")
}
```

- [ ] **Step 3: Write the exact matrix runner**

Create `scripts/ios/run-exhibition-matrix.mjs`:

```javascript
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const outputRoot = resolve(root, ".local-artifacts/ios-exhibition", String(Date.now()));
mkdirSync(outputRoot, { recursive: true });

const targets = [
  {
    name: "Somewhere iPad Pro 11 2nd Gen",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro--11-inch---2nd-generation-",
    slug: "ipad-pro-11-2nd-gen",
  },
  {
    name: "Somewhere iPhone 13",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-13",
    slug: "iphone-13",
  },
];

function run(command, args, options = {}) {
  const result = Bun.spawnSync([command, ...args], {
    cwd: options.cwd ?? root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0 && options.allowFailure !== true) {
    throw new Error(`${command} ${args.join(" ")}\n${stdout}\n${stderr}`);
  }
  return { code: result.exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

run("xcodegen", ["generate", "--spec", "ios/project.yml"]);
const runtimes = JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "--json"]).stdout).runtimes;
const runtime = runtimes
  .filter((value) => value.isAvailable && value.identifier.includes("SimRuntime.iOS-"))
  .sort((left, right) => left.version.localeCompare(right.version, undefined, { numeric: true }))
  .at(-1);
if (!runtime) throw new Error("No available iOS Simulator runtime");

const deviceTypes = JSON.parse(run("xcrun", ["simctl", "list", "devicetypes", "--json"]).stdout).devicetypes;
const listedDevices = JSON.parse(run("xcrun", ["simctl", "list", "devices", "--json"]).stdout).devices;

for (const target of targets) {
  if (!deviceTypes.some((value) => value.identifier === target.type)) {
    throw new Error(`Missing Simulator device type: ${target.type}`);
  }
  const existing = Object.values(listedDevices).flat().find(
    (value) => value.name === target.name && value.isAvailable,
  );
  const udid = existing?.udid ?? run(
    "xcrun",
    ["simctl", "create", target.name, target.type, runtime.identifier],
  ).stdout;
  run("xcrun", ["simctl", "boot", udid], { allowFailure: true });
  run("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  run("xcodebuild", [
    "test",
    "-project", "ios/Somewhere.xcodeproj",
    "-scheme", "Somewhere",
    "-destination", `platform=iOS Simulator,id=${udid}`,
    "-only-testing:SomewhereTests",
    "-only-testing:SomewhereUITests/ExhibitionLayoutUITests",
    "-resultBundlePath", resolve(outputRoot, `${target.slug}.xcresult`),
    "CODE_SIGNING_ALLOWED=NO",
  ]);
  console.log(`PASS ${target.slug}`);
}

console.log(`Evidence: ${outputRoot}`);
```

- [ ] **Step 4: Run the target matrix**

Run:

```bash
bun scripts/ios/run-exhibition-matrix.mjs
```

Expected output contains:

```text
PASS ipad-pro-11-2nd-gen
PASS iphone-13
```

and the printed evidence directory contains two `.xcresult` bundles.

- [ ] **Step 5: Document exact local commands and evidence locations**

Add to `ios/README.md`:

```markdown
## Exhibition device matrix

The exhibition acceptance devices are portrait `iPad Pro (11-inch)
(2nd generation)` and `iPhone 13`. Run:

```sh
bun scripts/ios/run-exhibition-matrix.mjs
```

Timestamped result bundles and kept screenshot attachments are written below
`.local-artifacts/ios-exhibition/`. The iPhone 15 Pro Max remains a development
regression device and does not substitute for either exhibition target.
```

- [ ] **Step 6: Commit matrix automation and evidence capture**

```bash
git add scripts/ios/run-exhibition-matrix.mjs ios/Somewhere/App/SomewhereApp.swift \
  ios/Somewhere/Application/JourneyStore.swift ios/SomewhereUITests/ExhibitionLayoutUITests.swift \
  ios/README.md
git commit -m "test(ios): verify iPad and iPhone 13 exhibition matrix"
```

---

### Task 6: Full Regression and Collaboration Handoff

**Files:**
- Modify: `docs/operations/native-ios-collaboration-handoff.md:140-225`
- Verify only: `server/`, `contracts/`, `app/`, `.github/workflows/ios-ci.yml`

**Interfaces:**
- Consumes: completed Universal app and exact-device result bundles.
- Produces: a collaborator-readable handoff that distinguishes simulator, owner iPhone, target iPad, and target iPhone 13 evidence.

- [ ] **Step 1: Update the handoff device table**

Add this table to `docs/operations/native-ios-collaboration-handoff.md`:

```markdown
| Device | Role | Completion evidence |
| --- | --- | --- |
| iPad Pro (11-inch) (2nd generation) | primary portrait exhibition target | full UI matrix, screenshots, then physical install |
| iPhone 13 | secondary exhibition target | compact UI matrix, then physical install |
| Owner iPhone 15 Pro Max | development regression only | existing signed/debug evidence; not exhibition acceptance |
```

State directly below it that no backend or API contract changed and that physical compass/BLE implementation remains a separate follow-up.

- [ ] **Step 2: Run native source, target matrix, and owner-phone regression verification**

Run:

```bash
bun run verify:ios-source
bun scripts/ios/run-exhibition-matrix.mjs
cd ios
xcodebuild test -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro Max' \
  -only-testing:SomewhereTests \
  -only-testing:SomewhereUITests/JourneyFlowUITests CODE_SIGNING_ALLOWED=NO
```

Expected: every command exits zero. Record iPhone 15 Pro Max only as regression evidence.

- [ ] **Step 3: Run virtual field E2E on both exhibition simulators**

In one terminal, run the real local Worker/proxy:

```bash
bun run local:v2:start-for-qa
```

After its health endpoint is ready, run in a second terminal:

```bash
cd ios
SOMEWHERE_RUN_LOCAL_E2E=1 xcodebuild test \
  -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPad Pro (11-inch) (2nd generation)' \
  -only-testing:SomewhereUITests/VirtualFieldFlowUITests \
  SOMEWHERE_API_ORIGIN=https://127.0.0.1:8787 CODE_SIGNING_ALLOWED=NO
SOMEWHERE_RUN_LOCAL_E2E=1 xcodebuild test \
  -project Somewhere.xcodeproj -scheme Somewhere \
  -destination 'platform=iOS Simulator,name=iPhone 13' \
  -only-testing:SomewhereUITests/VirtualFieldFlowUITests \
  SOMEWHERE_API_ORIGIN=https://127.0.0.1:8787 CODE_SIGNING_ALLOWED=NO
```

Expected: restaurant route replay arrives and reveals automatically, and off-route guidance suppresses then recovers on both exhibition destinations. Stop the Worker terminal with Control-C after both commands finish.

- [ ] **Step 4: Run unchanged app, server, contract, and blueprint suites**

Run from the repository root:

```bash
bun run verify
bun run test:server
bun run test:e2e:v2
bun run verify:blueprint
```

Expected: all existing accepted tests pass and native layout work does not change browser or Worker behavior.

- [ ] **Step 5: Verify the diff contains no backend changes**

Run:

```bash
git diff --name-only origin/codex/roll-compass-native-app...HEAD
git diff --check
```

Expected: changed implementation paths are limited to `ios/`, `scripts/ios/`, and design/collaboration documentation; no changed path begins with `server/` or `contracts/`.

- [ ] **Step 6: Commit the final handoff and push the verified branch**

```bash
git add docs/operations/native-ios-collaboration-handoff.md
git commit -m "docs: hand off iPad and iPhone 13 exhibition build"
git push origin codex/roll-compass-native-app
```

---

### Task 7: Physical Installation on the Actual Exhibition Devices

**Files:**
- Modify after successful runs: `docs/operations/native-ios-collaboration-handoff.md`

**Interfaces:**
- Consumes: signed Universal Debug build, paired physical device identifiers, and an Apple development team that includes each device.
- Produces: honest physical-device PASS/BLOCKED records for the target iPad and collaborator iPhone 13.

- [ ] **Step 1: Pair and identify the iPad**

Connect the unlocked iPad by USB, trust the Mac, enable Developer Mode if prompted, then run:

```bash
xcrun devicectl list devices
```

Expected: the iPad Pro appears in `available (paired)` state. In iPad Settings, record whether it is Wi-Fi or Wi-Fi + Cellular.

- [ ] **Step 2: Select signing and install through Xcode**

Open `ios/Somewhere.xcodeproj`, select the `Somewhere` target, open **Signing & Capabilities**, and select the Apple development team that includes the connected device. Select the paired iPad as the run destination and choose **Product → Run**.

Expected: Xcode builds, installs, and launches `Roll the compass!` on the iPad without changing the checked-in bundle identifier or committing generated signing data.

- [ ] **Step 3: Execute the iPad physical checklist**

Record each item exactly as PASS, FAIL, or BLOCKED:

```text
portrait launch
compass tap
conditions Back navigation
Stop always visible
needle contained in dial
location permission
heading response
relaunch recovery
complete demonstration journey
```

If the iPad is Wi-Fi-only, record real GPS walking as `BLOCKED: device has no GPS/GNSS` and use the Debug replay for the exhibition. Do not mark real GPS as passed.

- [ ] **Step 4: Pair, sign, and install on the collaborator's iPhone 13**

Connect and trust the unlocked iPhone 13, confirm it is `available (paired)` in `xcrun devicectl list devices`, select the same eligible development team, choose the iPhone 13 run destination, and choose **Product → Run**. If the team does not include that phone, register it through Xcode before rebuilding.

- [ ] **Step 5: Execute the iPhone 13 physical checklist**

Run the same checklist and additionally confirm there is no horizontal clipping at the iPhone 13 compact size of 390 by 844 points.

- [ ] **Step 6: Record physical truth and commit only completed evidence**

Append dated PASS/FAIL/BLOCKED rows to `docs/operations/native-ios-collaboration-handoff.md`, then run:

```bash
git add docs/operations/native-ios-collaboration-handoff.md
git commit -m "test(ios): record exhibition device installation evidence"
git push origin codex/roll-compass-native-app
```

Do not create a physical PASS row for a device that was not connected and exercised.
