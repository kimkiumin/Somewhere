#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const IOS_FIELD_REQUIREMENTS = Object.freeze({
  requiredFiles: Object.freeze([
    "ios/Somewhere/Application/JourneyStore.swift",
    "ios/Somewhere/Platform/LocationController.swift",
    "ios/Somewhere/Platform/NotificationController.swift",
    "ios/Somewhere/Platform/FeedbackCapabilityStore.swift",
    "ios/Somewhere/Networking/APIJourneyService.swift",
    "ios/Somewhere/UI/RootView.swift",
    "ios/Somewhere/UI/ConstraintView.swift",
    "ios/Somewhere/UI/CompassView.swift",
    "ios/Somewhere/UI/StopConfirmationView.swift",
    "ios/Somewhere/UI/RevealView.swift",
    "ios/Somewhere/UI/RecoveryView.swift",
    "ios/Somewhere/UI/FeedbackView.swift",
    "ios/Somewhere/Resources/Info.plist",
    "ios/SomewhereTests/JourneyStoreTests.swift",
    "ios/SomewhereUITests/JourneyFlowUITests.swift",
  ]),
  uiFiles: Object.freeze([
    "ios/Somewhere/UI/RootView.swift",
    "ios/Somewhere/UI/ConstraintView.swift",
    "ios/Somewhere/UI/CompassView.swift",
    "ios/Somewhere/UI/StopConfirmationView.swift",
    "ios/Somewhere/UI/RevealView.swift",
    "ios/Somewhere/UI/RecoveryView.swift",
    "ios/Somewhere/UI/FeedbackView.swift",
  ]),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function validateIOSFieldFlow(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const source = new Map();
  for (const path of IOS_FIELD_REQUIREMENTS.requiredFiles) {
    try {
      source.set(path, await readFile(resolve(root, path), "utf8"));
    } catch {
      throw new Error(`required iOS field source is missing: ${path}`);
    }
  }

  const combined = [...source.values()].join("\n");
  for (const token of ["WKWebView", "UIWebView", "directDestinationBearing", "directBearing", "reroll"]) {
    assert(!combined.toLowerCase().includes(token.toLowerCase()), `forbidden iOS field token: ${token}`);
  }
  const store = source.get("ios/Somewhere/Application/JourneyStore.swift");
  for (const token of [
    "@MainActor",
    "func requestStop()",
    "func cancelStop() async",
    "func confirmStop() async",
    "func reveal() async",
    "func requestRecovery() async",
    "sequenceConflict",
  ]) assert(store.includes(token), `JourneyStore is missing ${token}`);

  const location = source.get("ios/Somewhere/Platform/LocationController.swift");
  for (const token of [
    "requestWhenInUseAuthorization()",
    "startUpdatingLocation()",
    "startUpdatingHeading()",
    "stopUpdatingLocation()",
    "stopUpdatingHeading()",
  ]) assert(location.includes(token), `LocationController is missing ${token}`);

  const notification = source.get("ios/Somewhere/Platform/NotificationController.swift");
  assert(notification.includes("scheduleDelayedFeedback(dueAt: Date)"), "contextual notification method is missing");
  const app = await readFile(resolve(root, "ios/Somewhere/App/SomewhereApp.swift"), "utf8");
  assert(app.includes("RootView(store:"), "SomewhereApp must mount RootView");
  const project = await readFile(resolve(root, "ios/project.yml"), "utf8");
  assert(project.includes("SomewhereUITests:"), "XcodeGen UI test target is missing");
  assert(project.includes("INFOPLIST_FILE: Somewhere/Resources/Info.plist"), "checked-in Info.plist is not configured");
  const infoPlist = source.get("ios/Somewhere/Resources/Info.plist");
  assert(
    infoPlist.includes("<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>"),
    "checked-in Info.plist must declare the built app executable",
  );
  assert(
    infoPlist.includes("<key>CFBundlePackageType</key><string>APPL</string>"),
    "checked-in Info.plist must declare an application bundle",
  );

  const unitTests = source.get("ios/SomewhereTests/JourneyStoreTests.swift");
  const uiTests = source.get("ios/SomewhereUITests/JourneyFlowUITests.swift");
  const unitScenarioCount = [...unitTests.matchAll(/func test[A-Za-z0-9_]+\(\)/g)].length;
  const uiScenarioCount = [...uiTests.matchAll(/func test[A-Za-z0-9_]+\(\)/g)].length;
  assert(unitScenarioCount >= 12, "JourneyStoreTests must define at least 12 scenarios");
  assert(uiScenarioCount >= 4, "JourneyFlowUITests must define at least 4 scenarios");

  for (const path of IOS_FIELD_REQUIREMENTS.uiFiles) {
    const value = source.get(path);
    assert(value.includes("accessibilityLabel"), `${path} lacks an accessibility label`);
  }
  assert(combined.includes(".frame(minHeight: 44)"), "44-point control floor is missing");

  return {
    gate: "PASS",
    requiredFileCount: IOS_FIELD_REQUIREMENTS.requiredFiles.length,
    uiViewCount: IOS_FIELD_REQUIREMENTS.uiFiles.length,
    unitScenarioCount,
    uiScenarioCount,
    minimumControlPoints: 44,
  };
}

if (import.meta.main) {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  process.stdout.write(`${JSON.stringify(await validateIOSFieldFlow(root), null, 2)}\n`);
}
