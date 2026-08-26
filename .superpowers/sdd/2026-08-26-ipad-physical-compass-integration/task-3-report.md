# Task 3 report: Correct hidden-guidance copy and error placement

Date: 2026-08-26

Worktree: `/Users/eodeumin/Developer/Somewhere/.worktrees/ipad-exhibition`

Base HEAD: `91bdc1d`

Final status: complete. The task changes preserve the Task 2 iPad metrics/order, backend and journey state, iPhone 13 compact layout, and unrelated copy. No BLE, controller, or firmware files were edited.

## Implemented changes

- `ios/Somewhere/UI/CompassView.swift`: the following-next-step summary keeps the relative maneuver, distance, and instruction but no longer appends `step.road`, so the fixture road name `테스트로` is not disclosed.
- `ios/Somewhere/UI/RecoveryView.swift`: replaced the task-surface copy `보물 숨김` with `목적지 숨김`.
- `ios/Somewhere/UI/RootView.swift`: moved the error banner from a top overlay into a bounded `.safeAreaInset(edge: .top)`. The message and dismiss action have independent accessibility identifiers, remain hittable, and are checked against the header and primary action frames.
- `ios/SomewhereUITests/JourneyFlowUITests.swift`: added the real UI assertions for road identity, stale copy, and error discoverability/non-overlap.
- `ios/SomewhereUITests/ExhibitionLayoutUITests.swift`: kept no-fit/feedback capture in its existing test, moved error capture to a dedicated test with a fresh `XCUIApplication` and complete `launchArguments` assignment, waits for termination between every repeated launch, and made `launchHarness` assign its complete argument list.

## TDD RED evidence

Command:

```sh
mkdir -p .omo/evidence/task-3 .local-artifacts/task-3-red && set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -resultBundlePath .local-artifacts/task-3-red/ipad-copy-error-red.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/red-ipad-copy-error.log
```

Observed RED output: exit code `65`; `Executed 3 tests, with 9 failures (0 unexpected)`; `** TEST FAILED **`.

The failures were the expected stale behavior: the following-step label still contained `테스트로`, the stop surface exposed `보물 숨김`, and the old overlay did not expose the independently discoverable `somewhere.error`, `somewhere.error-message`, or `somewhere.error-dismiss` elements.

Artifacts:

- `.omo/evidence/task-3/red-ipad-copy-error.log`
- `.local-artifacts/task-3-red/ipad-copy-error-red.xcresult`

## Harness diagnosis and intermediate failure evidence

The first full iPad run after the production changes still failed the old combined capture test:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -resultBundlePath .local-artifacts/task-3-green/ipad-full-native.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-full-native.log
```

Observed output: exit code `65`; 51 unit tests passed; the UI suite executed 46 tests with 3 skipped and 1 failure; the result summary was 93 passed, 1 failed, 3 skipped, 97 total. The failure was the old `ExhibitionLayoutUITests.testCaptureLaunchConditionsSettingsNoFitFeedbackAndError` error branch.

Exporting that test's attachments showed that the error launch was actually the plain idle screen. The screenshot and hierarchy contained the logo, profile menu, start action, conditions link, and compass, but no error elements:

- Screenshot: `.local-artifacts/task-3-green/ipad-full-native-error-attachments/E60A2E3E-8416-4A30-9B2A-D2C30597C923.png`
- Idle hierarchy: `.local-artifacts/task-3-green/ipad-full-native-error-attachments/4771F7D0-E163-4871-9D6A-C7FCC99C4935.txt`
- User-exported confirmation: `/tmp/somewhere-task-3-attachments.5XjYW8/CB575A0B-FF5A-4A98-9F70-637249C4D107.png`

Inspection of `ConstraintView.onAppear` and `requestLocationAccess()` showed that an injected error on the default launch surface was cleared when the already-authorized simulator requested location access. A diagnostic rerun also reproduced the same-root repeated-launch hazard: `.local-artifacts/task-3-green/ipad-full-native-rerun.xcresult` exited 65 with 46 UI tests, 3 skips, and 3 failures. The final harness fix therefore makes the error scenario a separate fresh launch in the ready state, assigns all launch arguments at once, and waits for `.notRunning` after each capture launch. This is test determinism only; the independent JourneyFlow production assertion remains in place.

Diagnostic artifact:

- `.omo/evidence/task-3/green-ipad-full-native-rerun.log`
- `.local-artifacts/task-3-green/ipad-full-native-rerun.xcresult`

## GREEN evidence

### Focused copy, error, and stale-copy assertions

Command:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -resultBundlePath .local-artifacts/task-3-green/ipad-copy-error-focused.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-copy-error-focused.log
```

Observed output: exit code `0`; `Executed 3 tests, with 0 failures (0 unexpected)`; `** TEST SUCCEEDED **`.

Artifact: `.omo/evidence/task-3/green-ipad-copy-error-focused.log` and `.local-artifacts/task-3-green/ipad-copy-error-focused.xcresult`.

### Focused iPad layout and iPhone 13 regression coverage

The focused iPad command covered the Task 2 layout unit suite, the iPad direction/arrival/conditions/recovery branches, the new JourneyFlow assertions, and the existing iPad guidance capture assertion:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereTests/SomewhereLayoutTests -only-testing:SomewhereUITests/JourneyFlowUITests/testIPadGuidanceUsesVerticalDirectionCompassInformationStopOrder -only-testing:SomewhereUITests/JourneyFlowUITests/testIPadArrivalUsesVerticalRevealAtApproximateEightyPercentWidth -only-testing:SomewhereUITests/JourneyFlowUITests/testIPadConditionsUsePortraitWidthAndExplicitBackWithoutScrollNavigation -only-testing:SomewhereUITests/JourneyFlowUITests/testIPadRouteRecoveryUsesVerticalCompassBeforeRecoveryActions -only-testing:SomewhereUITests/JourneyFlowUITests/testIPadEarlyRevealedGuidanceUsesVerticalDirectionCompassAndRemainingInformationOrder -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testGuidanceFitsIPadAndKeepsStopVisible -resultBundlePath .local-artifacts/task-3-green/ipad-focused.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-focused.log
```

Observed output: unit `Executed 4 tests, with 0 failures`; UI `Executed 9 tests, with 0 failures`; `** TEST SUCCEEDED **`.

The iPhone 13 command covered the compact guidance viewport and the same copy/error regressions:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=165C0E09-2FBA-4E7D-9384-661F78AD8EC7' -only-testing:SomewhereTests/SomewhereLayoutTests -only-testing:SomewhereUITests/JourneyFlowUITests/testIPhone13CompactGuidanceKeepsExistingViewportAndStopBehavior -only-testing:SomewhereUITests/JourneyFlowUITests/testCredibleGuidanceUsesRelativeCueWithoutScrollableCoreContent -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -resultBundlePath .local-artifacts/task-3-green/iphone13-focused.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-iphone13-focused.log
```

Observed output: unit `Executed 4 tests, with 0 failures`; UI `Executed 5 tests, with 0 failures`; result summary 9 passed, 0 failed, 0 skipped; `** TEST SUCCEEDED **`.

Artifacts:

- `.omo/evidence/task-3/green-ipad-focused.log`
- `.local-artifacts/task-3-green/ipad-focused.xcresult`
- `.omo/evidence/task-3/green-iphone13-focused.log`
- `.local-artifacts/task-3-green/iphone13-focused.xcresult`

### Isolated ExhibitionLayout and split capture tests

The isolated ExhibitionLayout run passed before the final full-suite rerun:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereUITests/ExhibitionLayoutUITests -resultBundlePath .local-artifacts/task-3-green/ipad-exhibition-isolated.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-exhibition-isolated.log
```

Observed output: `Executed 9 tests, with 0 failures (0 unexpected)`; `** TEST SUCCEEDED **`.

After splitting the error branch, the two focused capture tests were run together:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testCaptureLaunchConditionsSettingsNoFitFeedbackAndError -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testCaptureErrorUsesIndependentAccessibleBanner -resultBundlePath .local-artifacts/task-3-green/ipad-capture-tests-final.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-capture-tests-final.log
```

Observed output: result summary `2 passed, 0 failed, 0 skipped, 2 total`; `** TEST SUCCEEDED **`.

Artifacts:

- `.omo/evidence/task-3/green-ipad-exhibition-isolated.log`
- `.local-artifacts/task-3-green/ipad-exhibition-isolated.xcresult`
- `.omo/evidence/task-3/green-ipad-capture-tests-final.log`
- `.local-artifacts/task-3-green/ipad-capture-tests-final.xcresult`

### Final full native iPad suite after the latest harness patch

Command:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -resultBundlePath .local-artifacts/task-3-green/ipad-full-native-final-rerun.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3/green-ipad-full-native-final-rerun.log
```

Observed output:

```text
SomewhereTests: Executed 51 tests, with 0 failures (0 unexpected)
ExhibitionLayoutUITests: Executed 10 tests, with 0 failures (0 unexpected)
JourneyFlowUITests: Executed 35 tests, with 1 test skipped and 0 failures (0 unexpected)
VirtualFieldFlowUITests: Executed 2 tests, with 2 tests skipped and 0 failures (0 unexpected)
SomewhereUITests.xctest: Executed 47 tests, with 3 tests skipped and 0 failures (0 unexpected)
All tests: Executed 47 tests, with 3 tests skipped and 0 failures (0 unexpected)
** TEST SUCCEEDED **
```

`xcresulttool` summary: `95 passed`, `0 failed`, `3 skipped`, `98 total`; result `Passed`.

The final result's captured artifacts were exported and verified as non-empty PNGs:

- Approved-state manifest: `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/approved/manifest.json`
- `iPad-following-next-step`: `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/approved/9165C478-7604-4EFC-8969-816751C98009.png` (1668 x 2388 PNG, 1,284,492 bytes)
- Independent error capture: `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/error/FC852D63-2DDA-4F2E-AE2E-8D723A179AC0.png` (1668 x 2388 PNG, 1,381,780 bytes)
- Error manifest: `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/error/manifest.json`
- Full result bundle: `.local-artifacts/task-3-green/ipad-full-native-final-rerun.xcresult`
- Full test log: `.omo/evidence/task-3/green-ipad-full-native-final-rerun.log`

## Success-criteria evidence matrix

| Scenario | Invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Following next step hides road identity | `JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection` | `XCTAssertFalse(summary.label.contains("테스트로"))` passed; maneuver/distance/instruction remained discoverable | `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/approved/9165C478-7604-4EFC-8969-816751C98009.png` |
| Hidden status copy | `JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable` | `목적지 숨김` exists and `보물 숨김` does not | `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/approved/8D5ADC13-DAD4-4F7F-BBC2-7F9ADA9AD444.png` and final `.xcresult` |
| Error placement and accessibility | `ExhibitionLayoutUITests/testCaptureErrorUsesIndependentAccessibleBanner` plus the independent JourneyFlow assertion | message and dismiss identifiers exist and are hittable; banner is inside the window and intersects neither header nor primary action | `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/error/FC852D63-2DDA-4F2E-AE2E-8D723A179AC0.png` |
| Repeated-launch capture determinism | `ExhibitionLayoutUITests/testCaptureApprovedExhibitionStates` | all 11 approved captures completed with `terminateAndWait`; no stale/top-clipped launch failure in the final full suite | `.local-artifacts/task-3-green/ipad-full-native-final-rerun-attachments/approved/manifest.json` |
| iPhone 13 compact layout preservation | focused iPhone 13 command above | compact viewport and stop behavior passed; all 9 focused tests passed | `.local-artifacts/task-3-green/iphone13-focused.xcresult` |

## Self-review

Before staging, `git diff --check` exited `0` with no output. The only source files changed were:

```text
ios/Somewhere/UI/CompassView.swift
ios/Somewhere/UI/RecoveryView.swift
ios/Somewhere/UI/RootView.swift
ios/SomewhereUITests/ExhibitionLayoutUITests.swift
ios/SomewhereUITests/JourneyFlowUITests.swift
```

The harness check found no `launchArguments.append` calls and the only `app.terminate()` is inside the `terminateAndWait` helper. The fixture still contains `road: "테스트로"` intentionally; it supplies the negative UI-disclosure test input and is not rendered by `CompassView`.

## Concerns

- The final iPad suite retains 3 expected skips: one iPhone-specific compact regression and two VirtualField tests requiring the local Worker/proxy with `SOMEWHERE_RUN_LOCAL_E2E=1`.
- Xcode/simulator emitted unrelated warnings about the debugger version store, duplicate accessibility runtime classes, CoreBluetooth simulator XPC, and future Info.plist/orientation requirements. They did not fail the suite, and no BLE/controller/firmware code was touched.
- The earlier full-suite failures were harness lifecycle/argument-delivery failures. The final post-patch result is the authoritative full-suite evidence.

## Task 3 review-fix round (2026-08-26)

The review identified two regressions within Task 3 scope:

1. The unknown/missing-maneuver fallback in `CompassView` rendered arbitrary `step.instruction` text, which could disclose a road name.
2. A default `--ui-test-error` launch could lose its error after `ConstraintView.onAppear` called `requestLocationAccess()`, leaving the error UI undiscoverable.

### TDD RED

Added the smallest behavior assertions before the production fixes:

- `SomewhereApp.swift` gained a `following-next-step-unknown` fixture with `maneuver=UNKNOWN`, `instruction=테스트로에서 우회전`, `distanceM=180`, and `road=테스트로`.
- `JourneyFlowUITests/testUnknownNextStepUsesOnlySafeRelativeDetail` requires the safe `다음 동작` and `약 180m 뒤` cues while rejecting `테스트로`, the raw instruction, and `우회전`.
- `JourneyFlowUITests/testDefaultLaunchSurfaceKeepsErrorBannerAccessible` launches with `--ui-test-error` and `--ui-test-no-notifications` only; it deliberately does not pass `--ui-test-state ready`. It requires independently discoverable/hittable error, message, and dismiss identifiers, with the error inside the window and non-overlapping the default header and primary action.
- `JourneyStoreTests/testRequestLocationAccessPreservesExistingError` requires an existing `presentedError` to survive `requestLocationAccess()`.

Exact RED invocation:

```sh
mkdir -p .omo/evidence/task-3-review .local-artifacts/task-3-review-red
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereUITests/JourneyFlowUITests/testUnknownNextStepUsesOnlySafeRelativeDetail -only-testing:SomewhereUITests/JourneyFlowUITests/testDefaultLaunchSurfaceKeepsErrorBannerAccessible -only-testing:SomewhereTests/JourneyStoreTests/testRequestLocationAccessPreservesExistingError -resultBundlePath .local-artifacts/task-3-review-red/review-regressions-red.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3-review/red-review-regressions.log
```

Observed RED output:

```text
SomewhereTests: 1 test, 1 failure (presentedError was cleared)
JourneyFlowUITests: 2 tests, 9 failures (default error identifiers absent; unknown fixture exposed road/raw maneuver text)
** TEST FAILED **
```

The RED log is retained at `.omo/evidence/task-3-review/red-review-regressions.log`. During user disk cleanup, the regenerable RED result bundle `.local-artifacts/task-3-review-red/review-regressions-red.xcresult` was removed; it is not used as authority.

### Minimal fixes

- `CompassView.swift` no longer renders `step.instruction` when the maneuver is unknown. The known maneuver label and distance branches remain unchanged, so the existing known next-step coverage continues to assert those cues.
- `JourneyStore.requestLocationAccess()` now only requests permission and no longer clears an unrelated existing `presentedError`.
- The default-launch UI regression remains independent of the existing ready-state error test.

### Authoritative focused GREEN evidence

Clean iPad focused invocation:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=5527401E-ADB4-4727-95D7-08F95EB13AC0' -only-testing:SomewhereTests/SomewhereLayoutTests -only-testing:SomewhereTests/JourneyStoreTests/testRequestLocationAccessPreservesExistingError -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testUnknownNextStepUsesOnlySafeRelativeDetail -only-testing:SomewhereUITests/JourneyFlowUITests/testDefaultLaunchSurfaceKeepsErrorBannerAccessible -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -only-testing:SomewhereUITests/JourneyFlowUITests/testCredibleGuidanceUsesRelativeCueWithoutScrollableCoreContent -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testCaptureErrorUsesIndependentAccessibleBanner -only-testing:SomewhereUITests/ExhibitionLayoutUITests/testCaptureLaunchConditionsSettingsNoFitFeedbackAndError -resultBundlePath .local-artifacts/task-3-review-green/ipad-review-focused-clean.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3-review/green-ipad-review-focused-clean.log
```

Binary result from `xcrun xcresulttool get test-results summary`:

```text
device: Somewhere iPad Pro 11 2nd Gen
passedTests: 13
failedTests: 0
skippedTests: 0
totalTestCount: 13
result: Passed
```

The log ends with `SomewhereTests.xctest: Executed 5 tests, with 0 failures`, `JourneyFlowUITests: Executed 6 tests, with 0 failures`, `ExhibitionLayoutUITests: Executed 2 tests, with 0 failures`, and `** TEST SUCCEEDED **`.

Evidence: `.local-artifacts/task-3-review-green/ipad-review-focused-clean.xcresult` and `.omo/evidence/task-3-review/green-ipad-review-focused-clean.log`.

The two capture scenarios also exported non-empty evidence from that result:

- Error capture: `.local-artifacts/task-3-review-green/ipad-review-focused-clean-attachments/error/F655EB06-A010-4DD6-8273-55FA61A9AA3D.png` (1668 x 2388 PNG, 1,377,446 bytes) and `error/manifest.json`.
- Launch/conditions/settings/no-fit/feedback capture set: `.local-artifacts/task-3-review-green/ipad-review-focused-clean-attachments/captures/manifest.json` plus six non-empty 1668 x 2388 PNGs: `BB6C209A-9492-42F5-911C-7AD7905B84F9.png`, `2FF111CF-B7FD-4DB8-9EF7-FFEC6A55EE2B.png`, `EC38256F-B12D-4CCC-85F9-94B4D9FEA6F7.png`, `C31FA4AC-8B35-40AA-9876-4F5C43069793.png`, `EE726433-6F4B-4380-BBAF-B4A20E764380.png`, and `9BC72516-E9DA-4013-A1B0-6259871F6E79.png`.

Clean iPhone 13 focused invocation:

```sh
set -o pipefail && xcodebuild test -project ios/Somewhere.xcodeproj -scheme Somewhere -destination 'platform=iOS Simulator,id=165C0E09-2FBA-4E7D-9384-661F78AD8EC7' -only-testing:SomewhereTests/SomewhereLayoutTests -only-testing:SomewhereTests/JourneyStoreTests/testRequestLocationAccessPreservesExistingError -only-testing:SomewhereUITests/JourneyFlowUITests/testIPhone13CompactGuidanceKeepsExistingViewportAndStopBehavior -only-testing:SomewhereUITests/JourneyFlowUITests/testCredibleGuidanceUsesRelativeCueWithoutScrollableCoreContent -only-testing:SomewhereUITests/JourneyFlowUITests/testNextStepIsPresentedAsFutureDetailWithoutOverridingCurrentDirection -only-testing:SomewhereUITests/JourneyFlowUITests/testUnknownNextStepUsesOnlySafeRelativeDetail -only-testing:SomewhereUITests/JourneyFlowUITests/testDefaultLaunchSurfaceKeepsErrorBannerAccessible -only-testing:SomewhereUITests/JourneyFlowUITests/testErrorMessageAndDismissStayAccessibleWithoutCoveringGuidanceControls -only-testing:SomewhereUITests/JourneyFlowUITests/testStopReasonKeepsSkipExitAvailable -resultBundlePath .local-artifacts/task-3-review-green/iphone13-review-focused-clean.xcresult CODE_SIGNING_ALLOWED=NO SOMEWHERE_API_ORIGIN=https://example.invalid 2>&1 | tee .omo/evidence/task-3-review/green-iphone13-review-focused-clean.log
```

Binary result from `xcrun xcresulttool get test-results summary`:

```text
device: Somewhere iPhone 13
passedTests: 12
failedTests: 0
skippedTests: 0
totalTestCount: 12
result: Passed
```

The log ends with `SomewhereTests.xctest: Executed 5 tests, with 0 failures`, `JourneyFlowUITests: Executed 7 tests, with 0 failures`, and `** TEST SUCCEEDED **`.

Evidence: `.local-artifacts/task-3-review-green/iphone13-review-focused-clean.xcresult` and `.omo/evidence/task-3-review/green-iphone13-review-focused-clean.log`.

### Environment note and final checks

An earlier iPhone focused attempt at `.local-artifacts/task-3-review-green/iphone13-review-focused.xcresult` was invalidated when the user reclaimed disk by deleting regenerable DerivedData and intermediate xcresults while `xcodebuild` was still active. It emitted `No space left on device`, followed by launch-file-missing failures and result-save failure. That attempt is not authority. After approximately 3.9 GB was reclaimed, the same focused command was rerun to `iphone13-review-focused-clean.xcresult`; only the clean result above is authoritative.

The review-round source gate reported:

```text
CompassView raw-instruction fallback: absent
requestLocationAccess error reset: absent
```

`git diff --check` exited 0 with no output after the source changes. The review-round source files are limited to:

```text
ios/Somewhere/App/SomewhereApp.swift
ios/Somewhere/Application/JourneyStore.swift
ios/Somewhere/UI/CompassView.swift
ios/SomewhereTests/JourneyStoreTests.swift
ios/SomewhereUITests/JourneyFlowUITests.swift
```

The full native iPad suite was not rerun in this review-fix round; the preceding final full-suite evidence in this report remains the 95 passed / 3 skipped / 0 failed run. No Task 4, BLE, controller, or firmware files were touched.
