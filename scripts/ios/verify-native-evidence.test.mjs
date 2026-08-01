import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";
import {
  NATIVE_DEVICE_SCENARIOS,
  verifyNativeEvidence,
} from "./verify-native-evidence.mjs";

const FINAL_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const DIGEST = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const EXPECTED = Object.freeze({
  finalSha: FINAL_SHA,
  sourceTree: SOURCE_TREE,
  bundleIdentifier: "example.somewhere.field",
  navigationPolicyVersion: "navigation-v2-calibration-1",
  navigationPolicySha256: DIGEST("policy"),
  routeContractSha256: DIGEST("route"),
  providerConfigSha256: DIGEST("provider"),
  privacyManifestSha256: DIGEST("privacy"),
});

function buildAuthority() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    trust: {
      buildAuthorityId: "native-builder-1",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      validFrom: "2026-07-01T00:00:00.000Z",
      validUntil: "2026-09-01T00:00:00.000Z",
    },
  };
}

const BUILDER = buildAuthority();

function build(overrides = {}) {
  const payload = {
    schemaVersion: 1,
    kind: "native-build",
    buildAuthorityId: BUILDER.trust.buildAuthorityId,
    issuedAt: "2026-08-01T00:00:00.000Z",
    finalSha: FINAL_SHA,
    sourceTree: SOURCE_TREE,
    bundleIdentifier: EXPECTED.bundleIdentifier,
    deploymentTarget: "17.0",
    xcodeVersion: "16.4",
    sdk: "iphoneos18.5",
    configuration: "Release",
    projectSpecSha256: DIGEST("project-spec"),
    generatedProjectSha256: DIGEST("project"),
    resultBundleSha256: DIGEST("result"),
    archiveSha256: DIGEST("archive"),
    navigationPolicyVersion: EXPECTED.navigationPolicyVersion,
    navigationPolicySha256: EXPECTED.navigationPolicySha256,
    routeContractSha256: EXPECTED.routeContractSha256,
    providerConfigSha256: EXPECTED.providerConfigSha256,
    privacyManifestSha256: EXPECTED.privacyManifestSha256,
    privacyManifestInBundle: true,
    backgroundBehavior: "foreground-only-no-locked-screen-guidance",
    tests: { unit: "PASS", ui: "PASS", archive: "PASS" },
    signing: { kind: "development", teamId: "ABCDE12345", distribution: "none" },
    sanitized: true,
    rawCoordinateAttachments: false,
    ...overrides,
  };
  const bytes = sign(null, Buffer.from(canonicalJson(payload)), BUILDER.privateKey);
  return {
    ...payload,
    signature: {
      algorithm: "Ed25519",
      signatureBase64: bytes.toString("base64"),
      signatureSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function fieldLead() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    trust: {
      fieldLeadId: "field-lead-1",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      validFrom: "2026-07-01T00:00:00.000Z",
      validUntil: "2026-09-01T00:00:00.000Z",
    },
  };
}

function device(signer, overrides = {}, buildReceipt = build()) {
  const payload = {
    schemaVersion: 1,
    kind: "native-device",
    fieldLeadId: signer.trust.fieldLeadId,
    issuedAt: "2026-08-01T00:00:00.000Z",
    finalSha: FINAL_SHA,
    sourceTree: SOURCE_TREE,
    bundleIdentifier: EXPECTED.bundleIdentifier,
    archiveSha256: DIGEST("archive"),
    buildReceiptSha256: DIGEST(canonicalJson(buildReceipt)),
    marketingName: "iPhone 15 Pro Max",
    hardwareIdentifier: "iPhone16,2",
    osVersion: "18.5",
    navigationPolicyVersion: EXPECTED.navigationPolicyVersion,
    navigationPolicySha256: EXPECTED.navigationPolicySha256,
    routeContractSha256: EXPECTED.routeContractSha256,
    providerConfigSha256: EXPECTED.providerConfigSha256,
    backgroundBehaviorObserved: "foreground-only-no-locked-screen-guidance",
    scenarios: NATIVE_DEVICE_SCENARIOS.map((id) => ({
      id,
      result: "PASS",
      stopObserved: true,
      revealObserved: true,
      falseArrivalCount: 0,
      missedArrivalCount: 0,
    })),
    attachments: [{ kind: "sanitized-summary", sha256: DIGEST("summary") }],
    ...overrides,
  };
  const bytes = sign(null, Buffer.from(canonicalJson(payload)), signer.privateKey);
  return {
    schemaVersion: 1,
    payload,
    signature: {
      algorithm: "Ed25519",
      signatureBase64: bytes.toString("base64"),
      signatureSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function verify(overrides = {}) {
  const signer = fieldLead();
  const buildReceipt = overrides.buildReceipt ?? build();
  const deviceReceipt = overrides.deviceReceipt ?? device(signer, {}, buildReceipt);
  return verifyNativeEvidence({
    buildReceipt,
    deviceReceipt,
    trustedBuildAuthorities: [BUILDER.trust],
    trustedFieldLeads: [signer.trust],
    expected: EXPECTED,
    now: "2026-08-02T00:00:00.000Z",
    ...overrides,
  });
}

describe("native iOS evidence gate", () => {
  test("publishes strict schemas and a pinned read-only macOS workflow", async () => {
    for (const name of ["native-build-receipt-v1.schema.json", "native-device-receipt-v1.schema.json"]) {
      const schema = JSON.parse(await readFile(resolve(import.meta.dir, name), "utf8"));
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.additionalProperties).toBe(false);
    }
    const workflow = await readFile(resolve(import.meta.dir, "../../.github/workflows/ios-ci.yml"), "utf8");
    expect(workflow).toContain("runs-on: macos-15");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("xcodebuild test");
    expect(workflow).toContain("PrivacyInfo.xcprivacy");
  });

  test("accepts one exact build and four signed exact-device scenarios", async () => {
    const result = verify();
    expect(result).toMatchObject({ nativeBuild: "PASS", nativeField: "PASS", nativeIOS: "PASS" });
    expect(result.nativeDistribution).toBe("BLOCK");
    expect(result.deviceReceiptSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("keeps absent private evidence as BLOCK", () => {
    const result = verifyNativeEvidence({
      buildReceipt: null,
      deviceReceipt: null,
      trustedBuildAuthorities: [],
      trustedFieldLeads: [],
      expected: EXPECTED,
      now: "2026-08-02T00:00:00.000Z",
    });
    expect(result).toMatchObject({ nativeBuild: "BLOCK", nativeField: "BLOCK", nativeIOS: "BLOCK" });
  });

  test("writes an owner-only BLOCK verdict when the private directory is absent", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "somewhere-native-block-"));
    try {
      const output = resolve(root, "verdict.json");
      const result = Bun.spawnSync([
        "bun", "scripts/ios/verify-native-evidence.mjs",
        "--evidence", resolve(root, "missing"),
        "--output", output,
      ], { cwd: resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ nativeIOS: "BLOCK" });
      expect((await stat(output)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects private evidence files symlinked back into the repository", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "somewhere-native-symlink-"));
    const evidence = resolve(root, "evidence");
    await mkdir(evidence);
    try {
      for (const name of ["native-build.json", "native-device.json", "trusted-build-authorities.json", "trusted-field-leads.json"]) {
        await writeFile(resolve(evidence, name), "{}\n");
      }
      await symlink(resolve(import.meta.dir, "../../package.json"), resolve(evidence, "expected.json"));
      const result = Bun.spawnSync([
        "bun", "scripts/ios/verify-native-evidence.mjs",
        "--evidence", evidence,
        "--output", resolve(root, "verdict.json"),
      ], { cwd: resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("native evidence files must be outside the repository");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects simulator-only field evidence and missing scenarios", () => {
    const signer = fieldLead();
    expect(() => verify({ deviceReceipt: device(signer, { hardwareIdentifier: "simulator" }), trustedFieldLeads: [signer.trust] })).toThrow("exact iPhone 15 Pro Max");
    expect(() => verify({ deviceReceipt: device(signer, { scenarios: [] }), trustedFieldLeads: [signer.trust] })).toThrow("exact ordered native device scenarios");
  });

  test("rejects release identity and contract digest drift", () => {
    expect(() => verify({ buildReceipt: build({ finalSha: "c".repeat(40) }) })).toThrow("native build identity mismatch");
    expect(() => verify({ buildReceipt: build({ navigationPolicySha256: DIGEST("changed") }) })).toThrow("native build contract mismatch");
  });

  test("rejects missing privacy and background declarations", () => {
    expect(() => verify({ buildReceipt: build({ privacyManifestInBundle: false }) })).toThrow("privacy manifest");
    expect(() => verify({ buildReceipt: build({ backgroundBehavior: "background-navigation" }) })).toThrow("background behavior");
  });

  test("rejects raw coordinate evidence and changed signed payloads", () => {
    const signer = fieldLead();
    const raw = device(signer, { attachments: [{ kind: "raw-coordinate-trace", sha256: DIGEST("raw") }] });
    expect(() => verify({ deviceReceipt: raw, trustedFieldLeads: [signer.trust] })).toThrow("raw coordinate attachments");
    const changed = device(signer);
    changed.payload.osVersion = "18.6";
    expect(() => verify({ deviceReceipt: changed, trustedFieldLeads: [signer.trust] })).toThrow("invalid device signature");
  });

  test("rejects untrusted or expired field leads", () => {
    const signer = fieldLead();
    expect(() => verify({ deviceReceipt: device(signer), trustedFieldLeads: [] })).toThrow("untrusted field lead");
    signer.trust.validUntil = "2026-08-01T12:00:00.000Z";
    expect(() => verify({ deviceReceipt: device(signer), trustedFieldLeads: [signer.trust] })).toThrow("field lead outside validity");
  });

  test("requires an authority signature over the exact build receipt", () => {
    const changed = structuredClone(build());
    changed.sdk = "iphoneos99.0";
    expect(() => verify({ buildReceipt: changed })).toThrow("invalid build signature");
    expect(() => verify({ trustedBuildAuthorities: [] })).toThrow("untrusted build authority");
  });

  test("does not treat archive-only or development signing as TestFlight", () => {
    expect(() => verify({ buildReceipt: build({ signing: { kind: "development", teamId: "ABCDE12345", distribution: "testflight" } }) })).toThrow("TestFlight requires distribution signing");
    expect(verify().nativeDistribution).toBe("BLOCK");
  });

  test("separates field failure from an authority-backed distribution pass", () => {
    const distributed = build({ signing: { kind: "distribution", teamId: "ABCDE12345", distribution: "testflight" } });
    expect(verify({ buildReceipt: distributed })).toMatchObject({ nativeIOS: "PASS", nativeDistribution: "PASS" });
    const signer = fieldLead();
    const scenarios = NATIVE_DEVICE_SCENARIOS.map((id, index) => ({
      id,
      result: index === 0 ? "FAIL" : "PASS",
      stopObserved: true,
      revealObserved: true,
      falseArrivalCount: index === 0 ? 1 : 0,
      missedArrivalCount: 0,
    }));
    expect(verify({ deviceReceipt: device(signer, { scenarios }), trustedFieldLeads: [signer.trust] })).toMatchObject({ nativeField: "FAIL", nativeIOS: "FAIL" });
  });
});
