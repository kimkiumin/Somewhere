import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  IOS_FIELD_REQUIREMENTS,
  validateIOSFieldFlow,
} from "./validate-ios-field-flow.mjs";

const repositoryRoot = resolve(import.meta.dir, "../..");

describe("native iOS field journey gate", () => {
  test("contains the complete native field-test surface", async () => {
    expect(await validateIOSFieldFlow(repositoryRoot)).toEqual({
      gate: "PASS",
      requiredFileCount: IOS_FIELD_REQUIREMENTS.requiredFiles.length,
      uiViewCount: 7,
      unitScenarioCount: 15,
      uiScenarioCount: 4,
      minimumControlPoints: 44,
    });
  });

  test("stops sensor streams on confirmed stop and expiry", async () => {
    const source = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Platform/LocationController.swift"),
      "utf8",
    );
    expect(source).toContain("manager.stopUpdatingLocation()")
    expect(source).toContain("manager.stopUpdatingHeading()")
    expect(source).toContain("case .arrived, .stopped, .completed, .expired:")
    expect(source).toContain("headingAccuracy < 0")
  });

  test("keeps Stop immediate, Reveal explicit, and recovery guarded", async () => {
    const source = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Application/JourneyStore.swift"),
      "utf8",
    );
    expect(source).toContain("func requestStop()")
    expect(source).toContain("isGuidancePaused = true")
    expect(source).toContain("func reveal() async")
    expect(source).toContain("guard projection?.phase == .completed")
    expect(source.toLowerCase()).not.toContain("reroll")
    expect(source).toContain("private var guidanceEngine = GuidanceEngine()")
    expect(source).not.toContain("var engine = GuidanceEngine()")
    expect(source).toContain("pendingSafetyCommands.append")
    const tests = await readFile(
      resolve(repositoryRoot, "ios/SomewhereTests/JourneyStoreTests.swift"),
      "utf8",
    );
    expect(tests).toContain("func testRouteRecoveryDispatches()")
    expect(tests).toContain("func testSequenceConflictRefreshesProjection()")
    expect(tests).toContain("func testGuardedReplacementRejectsActiveJourney()")
  });

  test("completes guarded replacement only after an explicit recovery review", async () => {
    const store = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Application/JourneyStore.swift"),
      "utf8",
    );
    const service = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Networking/APIJourneyService.swift"),
      "utf8",
    );
    const recovery = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/UI/RecoveryView.swift"),
      "utf8",
    );
    expect(store).toContain("func confirmRecovery() async")
    expect(store).toContain("showsRecoveryReview = true")
    expect(store).toContain("guard let origin = locationController.location")
    expect(service).toContain('"/journeys/:journeyId/recovery/confirm"')
    expect(service).toContain("previousDestinationExcluded")
    expect(service).toContain("recoveryCapability: grant.recoveryCapability")
    expect(service).toContain("expectedSequence: current.sequence + 1")
    expect(recovery).toContain('Button("확인하고 다시 찾기")')
    expect(recovery).toContain("await store.confirmRecovery()")
  });

  test("connects sensors and the complete delayed-feedback contract", async () => {
    const store = await readFile(resolve(repositoryRoot, "ios/Somewhere/Application/JourneyStore.swift"), "utf8")
    const root = await readFile(resolve(repositoryRoot, "ios/Somewhere/UI/RootView.swift"), "utf8")
    const feedback = await readFile(resolve(repositoryRoot, "ios/Somewhere/UI/FeedbackView.swift"), "utf8")
    const service = await readFile(resolve(repositoryRoot, "ios/Somewhere/Networking/APIJourneyService.swift"), "utf8")
    expect(store).toContain("$location.combineLatest(locationController.$heading)")
    expect(root).toContain("FeedbackView(store: store)")
    expect(feedback).toContain('"did_not_visit"')
    expect(service).toContain("api.eligibleFeedback(capability: capability)")
    expect(service).toContain("api.recordReaction(")
    expect(service).not.toContain("case .submitFeedback:\n                throw")
  });

  test("keeps the native journey operable from selection through route recovery", async () => {
    const store = await readFile(resolve(repositoryRoot, "ios/Somewhere/Application/JourneyStore.swift"), "utf8")
    const compass = await readFile(resolve(repositoryRoot, "ios/Somewhere/UI/CompassView.swift"), "utf8")
    const root = await readFile(resolve(repositoryRoot, "ios/Somewhere/UI/RootView.swift"), "utf8")
    const location = await readFile(resolve(repositoryRoot, "ios/Somewhere/Platform/LocationController.swift"), "utf8")
    expect(store).toContain("private var pollTask: Task<Void, Never>?")
    expect(store).toContain("await self?.execute(.refresh)")
    expect(store).toContain("func cancelSelection() async")
    expect(store).toContain("pendingStartConstraints")
    expect(compass).toContain('Button("안내 시작")')
    expect(compass).toContain("await store.commit()")
    expect(compass).toContain('Button("안내 복구")')
    expect(compass).toContain('Button("선택 취소")')
    expect(compass).toContain("reading.remainingM")
    expect(root).toContain("applicationDidEnterBackground()")
    expect(location).toContain("case .arrived, .stopped, .completed, .expired:")
  });

  test("requests notification permission only at delayed-feedback scheduling", async () => {
    const source = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Platform/NotificationController.swift"),
      "utf8",
    );
    expect(source).toContain("func scheduleDelayedFeedback(dueAt: Date)")
    expect(source).toContain("requestAuthorization(options: [.alert, .sound])")
    expect(source).toContain("inAppFallbackRequired = true")
  });

  test("declares contextual permissions and accessible controls", async () => {
    const plist = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Resources/Info.plist"),
      "utf8",
    );
    const ui = await Promise.all(
      IOS_FIELD_REQUIREMENTS.uiFiles.map((path) => readFile(resolve(repositoryRoot, path), "utf8")),
    );
    expect(plist).toContain("NSLocationWhenInUseUsageDescription")
    expect(plist).not.toContain("NSLocationAlways")
    expect(ui.join("\n")).toContain(".frame(minHeight: 44)")
    expect(ui.join("\n")).toContain("accessibilityLabel")
  });
});
