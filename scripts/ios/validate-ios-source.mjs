#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { contractDocumentV1, PROJECTION_EXAMPLES_V1 } from "../../contracts/src/index.ts";

export const IOS_SOURCE_REQUIREMENTS = Object.freeze({
  requiredFiles: Object.freeze([
    "ios/project.yml",
    "ios/README.md",
    "ios/Somewhere/App/SomewhereApp.swift",
    "ios/Somewhere/Domain/JourneyProjection.swift",
    "ios/Somewhere/Domain/GuidanceEngine.swift",
    "ios/Somewhere/Domain/ArrivalGate.swift",
    "ios/Somewhere/Domain/NavigationPolicy.swift",
    "ios/Somewhere/Networking/APIClient.swift",
    "ios/Somewhere/Networking/WireModels.swift",
    "ios/Somewhere/Resources/PrivacyInfo.xcprivacy",
    "ios/SomewhereTests/WireContractTests.swift",
    "ios/SomewhereTests/GuidanceEngineTests.swift",
    "ios/Fixtures/projection-examples-v1.json",
    "ios/Fixtures/navigation-policy-v1.json",
  ]),
  forbiddenSourceTokens: Object.freeze([
    "WKWebView",
    "UIWebView",
    "WebView",
    "directDestinationBearing",
    "destinationBearing",
    "directBearing",
    "reroll",
  ]),
});

const canonicalJSON = (value) => `${JSON.stringify(value)}\n`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function endpointRows(source) {
  return [...source.matchAll(/APIEndpoint\(method: "(GET|POST|DELETE)", path: "([^"]+)", statuses: \[([^\]]*)\], bodyLimitBytes: (\d+)\)/g)].map(
    ([, method, path, statuses, bodyLimitBytes]) => ({
      method,
      path,
      statuses: statuses.split(",").map((entry) => Number(entry.trim())),
      bodyLimitBytes: Number(bodyLimitBytes),
    }),
  );
}

function actionValues(source) {
  return [...source.matchAll(/case\s+`?[A-Za-z][A-Za-z0-9]*`?\s*=\s*"([a-z-]+)"/g)]
    .map((match) => match[1])
    .filter((value) => new Set(PROJECTION_EXAMPLES_V1.flatMap((entry) => entry.actions)).has(value));
}

function comparable(value) {
  return JSON.stringify(value);
}

export async function validateIOSSource(repositoryRoot, options = {}) {
  const root = resolve(repositoryRoot);
  const overrides = options.sourceOverrides ?? new Map();
  const contents = new Map();
  for (const relative of IOS_SOURCE_REQUIREMENTS.requiredFiles) {
    const actual =
      relative === "ios/Fixtures/projection-examples-v1.json" && options.projectionFixture
        ? options.projectionFixture
        : overrides.get(relative) ?? resolve(root, relative);
    try {
      contents.set(relative, await readFile(actual, "utf8"));
    } catch {
      throw new Error(`required native source is missing: ${relative}`);
    }
  }

  const fixture = contents.get("ios/Fixtures/projection-examples-v1.json");
  assert(
    fixture === canonicalJSON(PROJECTION_EXAMPLES_V1),
    "projection fixture differs from PROJECTION_EXAMPLES_V1",
  );
  const policyFixture = contents.get("ios/Fixtures/navigation-policy-v1.json");
  assert(
    policyFixture === canonicalJSON(contractDocumentV1.navigationPolicy),
    "navigation policy fixture differs from NAVIGATION_POLICY_V1",
  );

  const project = parse(contents.get("ios/project.yml"));
  const appTarget = project?.targets?.Somewhere;
  const appScheme = project?.schemes?.Somewhere;
  const deploymentTarget = Number(appTarget?.deploymentTarget);
  const bundleIdentifier = appTarget?.settings?.base?.PRODUCT_BUNDLE_IDENTIFIER;
  assert(appScheme && typeof appScheme === "object", "shared Somewhere scheme is missing");
  assert(appScheme?.build?.targets?.Somewhere === "all", "Somewhere scheme must build the app target");
  const schemeTestTargets = Array.isArray(appScheme?.test?.targets)
    ? appScheme.test.targets.map((target) => (typeof target === "string" ? target : target?.name))
    : [];
  assert(
    schemeTestTargets.includes("SomewhereTests") && schemeTestTargets.includes("SomewhereUITests"),
    "Somewhere scheme must include unit and UI test targets",
  );
  assert(deploymentTarget >= 17, "Somewhere deploymentTarget must be iOS 17 or newer");
  assert(
    typeof bundleIdentifier === "string" && /^example\./.test(bundleIdentifier),
    "bundle identifier must remain a non-production example",
  );

  const swiftSources = [...contents.entries()]
    .filter(([path]) => path.endsWith(".swift"))
    .map(([path, source]) => ({ path, source }));
  for (const { path, source } of swiftSources) {
    for (const token of IOS_SOURCE_REQUIREMENTS.forbiddenSourceTokens) {
      assert(!source.toLowerCase().includes(token.toLowerCase()), `forbidden native source token ${token} in ${path}`);
    }
  }

  const projectionSource = contents.get("ios/Somewhere/Domain/JourneyProjection.swift");
  assert(projectionSource.includes("struct RevealedIdentity"), "RevealedIdentity is missing");
  assert(projectionSource.includes("let reveal: RevealedIdentity?"), "reveal boundary is missing");
  const withoutRevealedIdentity = projectionSource.replace(/struct RevealedIdentity[\s\S]*?\n}/, "");
  assert(!/let (name|address):/.test(withoutRevealedIdentity), "destination identity escaped RevealedIdentity");
  assert(
    /func validateContract\(\) throws/.test(projectionSource),
    "JourneyProjection must validate phase/action combinations after decoding",
  );

  const canonicalActions = [...new Set(PROJECTION_EXAMPLES_V1.flatMap((entry) => entry.actions))].sort();
  const swiftActions = [...new Set(actionValues(projectionSource))].sort();
  assert(comparable(swiftActions) === comparable(canonicalActions), "Swift JourneyAction differs from canonical actions");

  const wireSource = contents.get("ios/Somewhere/Networking/WireModels.swift");
  const swiftEndpoints = endpointRows(wireSource);
  assert(
    comparable(swiftEndpoints) === comparable(contractDocumentV1.endpoints),
    "Swift API endpoint catalog differs from ENDPOINT_ROWS",
  );

  const policySource = contents.get("ios/Somewhere/Domain/NavigationPolicy.swift");
  assert(
    policySource.includes(`static let policyVersion = "${contractDocumentV1.navigationPolicy.policyVersion}"`),
    "Swift navigation policy version differs from NAVIGATION_POLICY_V1",
  );
  for (const [key, value] of Object.entries(contractDocumentV1.navigationPolicy)) {
    if (["schemaVersion", "policyVersion", "status"].includes(key)) continue;
    const rendered = String(value);
    assert(
      policySource.includes(`static let ${key} = ${rendered}`),
      `Swift navigation policy differs at ${key}`,
    );
  }

  const guidanceSource = contents.get("ios/Somewhere/Domain/GuidanceEngine.swift");
  assert(
    guidanceSource.includes("func update(location: LocationSample, heading: HeadingSample, route: TrustedRoute, now: Date)"),
    "GuidanceEngine.update contract is missing",
  );
  const arrivalSource = contents.get("ios/Somewhere/Domain/ArrivalGate.swift");
  assert(arrivalSource.includes("mutating func advance(sample: ArrivalSample)"), "ArrivalGate.advance contract is missing");
  const apiSource = contents.get("ios/Somewhere/Networking/APIClient.swift");
  assert(apiSource.includes("protocol APIClientProtocol"), "APIClientProtocol is missing");
  assert(!/print\s*\(|debugPrint\s*\(|NSLog\s*\(/.test(apiSource), "API client must not log raw responses");
  const tokenAuthority = await readFile(resolve(root, "contracts/src/journey.ts"), "utf8");
  const feedbackCapability = tokenAuthority.match(
    /FeedbackCapabilitySchema\s*=\s*canonicalBase64Url\("([^"]+)",\s*(\d+),\s*(\d+)\)/,
  );
  assert(feedbackCapability !== null, "TypeScript feedback capability authority is missing");
  const [, feedbackPrefix, feedbackEncodedLength] = feedbackCapability;
  assert(
    apiSource.includes(`#"^${feedbackPrefix}\\.[A-Za-z0-9_-]{${feedbackEncodedLength}}$"#`),
    "Swift feedback capability pattern differs from TypeScript authority",
  );
  const privacyManifest = contents.get("ios/Somewhere/Resources/PrivacyInfo.xcprivacy");
  assert(privacyManifest.includes("NSPrivacyCollectedDataTypePreciseLocation"), "privacy manifest must disclose precise location collection");
  assert(privacyManifest.includes("NSPrivacyAccessedAPICategoryUserDefaults"), "privacy manifest must disclose UserDefaults access");
  assert(privacyManifest.includes("<string>CA92.1</string>"), "privacy manifest must declare the app-only UserDefaults reason");
  assert(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(privacyManifest), "privacy manifest must keep tracking disabled");

  return {
    gate: "PASS",
    deploymentTarget,
    bundleIdentifier,
    projectionExampleCount: PROJECTION_EXAMPLES_V1.length,
    endpointCount: swiftEndpoints.length,
    actionCount: canonicalActions.length,
    navigationPolicyVersion: contractDocumentV1.navigationPolicy.policyVersion,
    requiredSourceCount: IOS_SOURCE_REQUIREMENTS.requiredFiles.length,
  };
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const result = await validateIOSSource(repositoryRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.main) {
  await main();
}
