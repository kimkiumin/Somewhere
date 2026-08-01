import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contractDocumentV1 } from "../../contracts/src/index.ts";
import {
  IOS_SOURCE_REQUIREMENTS,
  validateIOSSource,
} from "./validate-ios-source.mjs";

const repositoryRoot = resolve(import.meta.dir, "../..");

describe("native iOS source gate", () => {
  test("matches the canonical V1 wire contract and native safety boundary", async () => {
    const result = await validateIOSSource(repositoryRoot);

    expect(result).toEqual({
      gate: "PASS",
      deploymentTarget: 17,
      bundleIdentifier: "example.somewhere.field",
      projectionExampleCount: 22,
      endpointCount: 17,
      actionCount: 12,
      navigationPolicyVersion: "navigation-v2-calibration-1",
      requiredSourceCount: IOS_SOURCE_REQUIREMENTS.requiredFiles.length,
    });
  });

  test("freezes the navigation policy beside the native fixtures", async () => {
    const policy = JSON.parse(
      await readFile(resolve(repositoryRoot, "ios/Fixtures/navigation-policy-v1.json"), "utf8"),
    );
    expect(policy).toEqual(contractDocumentV1.navigationPolicy);
  });

  test("rejects fixture drift byte-for-byte and semantically", async () => {
    const fixture = resolve(repositoryRoot, "ios/Fixtures/projection-examples-v1.json");
    const original = await readFile(fixture, "utf8");
    const scratch = await mkdtemp(join(tmpdir(), "somewhere-ios-fixture-"));

    try {
      const changed = original.replace('"pollAfterSeconds":2', '"pollAfterSeconds":3');
      await writeFile(join(scratch, "projection-examples-v1.json"), changed, "utf8");
      await expect(
        validateIOSSource(repositoryRoot, { projectionFixture: join(scratch, "projection-examples-v1.json") }),
      ).rejects.toThrow("projection fixture differs from PROJECTION_EXAMPLES_V1");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("rejects forbidden embedded web and direct-destination guidance types", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "somewhere-ios-source-"));
    const source = resolve(repositoryRoot, "ios/Somewhere/App/SomewhereApp.swift");
    const original = await readFile(source, "utf8");

    try {
      const changed = `${original}\n// WKWebView directDestinationBearing\n`;
      await writeFile(join(scratch, "SomewhereApp.swift"), changed, "utf8");
      await expect(
        validateIOSSource(repositoryRoot, {
          sourceOverrides: new Map([["ios/Somewhere/App/SomewhereApp.swift", join(scratch, "SomewhereApp.swift")]]),
        }),
      ).rejects.toThrow("forbidden native source token");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  test("keeps destination identity fields inside RevealedIdentity only", async () => {
    const projectionSource = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Domain/JourneyProjection.swift"),
      "utf8",
    );

    expect(projectionSource).toContain("struct RevealedIdentity");
    expect(projectionSource).toContain("let reveal: RevealedIdentity?");
    const withoutRevealedIdentity = projectionSource.replace(
      /struct RevealedIdentity[\s\S]*?\n}/,
      "",
    );
    expect(withoutRevealedIdentity).not.toMatch(/let (name|address):/);
  });

  test("fails closed on native API origin, endpoint, status, and future sensor samples", async () => {
    const apiSource = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Networking/APIClient.swift"),
      "utf8",
    );
    const guidanceSource = await readFile(
      resolve(repositoryRoot, "ios/Somewhere/Domain/GuidanceEngine.swift"),
      "utf8",
    );

    expect(apiSource).toContain("private let canonicalOrigin: String");
    expect(apiSource).toContain("guard WireContractV1.endpoints.contains(endpoint)");
    expect(apiSource).toContain("endpoint.statuses.contains(http.statusCode)");
    expect(apiSource).toContain('forHTTPHeaderField: "Origin"');
    expect(guidanceSource).toContain("now >= location.capturedAt");
    expect(guidanceSource).toContain("now >= heading.capturedAt");
    expect(guidanceSource).not.toContain("best!");
  });
});
