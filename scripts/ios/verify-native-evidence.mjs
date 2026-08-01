#!/usr/bin/env bun
import { createHash, verify } from "node:crypto";
import { access, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../../app/qa/field/v2/canonical-json.mjs";

export const NATIVE_DEVICE_SCENARIOS = Object.freeze([
  "open-sky-walk",
  "building-dense-walk",
  "interrupted-network-foreground-recovery",
  "heading-interference-recalibration",
]);

const BUILD_KEYS = new Set([
  "schemaVersion", "kind", "buildAuthorityId", "issuedAt", "finalSha", "sourceTree", "bundleIdentifier", "deploymentTarget",
  "xcodeVersion", "sdk", "configuration", "projectSpecSha256", "generatedProjectSha256",
  "resultBundleSha256", "archiveSha256", "navigationPolicyVersion", "navigationPolicySha256",
  "routeContractSha256", "providerConfigSha256", "privacyManifestSha256",
  "privacyManifestInBundle", "backgroundBehavior", "tests", "signing", "sanitized",
  "rawCoordinateAttachments", "signature",
]);
const DEVICE_PAYLOAD_KEYS = new Set([
  "schemaVersion", "kind", "fieldLeadId", "issuedAt", "finalSha", "sourceTree",
  "bundleIdentifier", "archiveSha256", "buildReceiptSha256", "marketingName", "hardwareIdentifier", "osVersion",
  "navigationPolicyVersion", "navigationPolicySha256", "routeContractSha256",
  "providerConfigSha256", "backgroundBehaviorObserved", "scenarios", "attachments",
]);
const EXPECTED_KEYS = new Set([
  "finalSha", "sourceTree", "bundleIdentifier", "navigationPolicyVersion",
  "navigationPolicySha256", "routeContractSha256", "providerConfigSha256",
  "privacyManifestSha256",
]);
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const FIELD_LEAD_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const BACKGROUND = "foreground-only-no-locked-screen-guidance";

function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exact(value, keys, label) {
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`unknown ${label} field: ${key}`);
  for (const key of keys) if (!(key in value)) throw new TypeError(`missing ${label} field: ${key}`);
}

function text(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a nonempty string`);
  return value;
}

function digest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) throw new TypeError(`${label} must be a SHA-256 digest`);
  return value;
}

function instant(value, label) {
  text(value, label);
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(parsed)) throw new TypeError(`${label} must be an ISO date-time`);
  return parsed;
}

function validateExpected(raw) {
  const value = object(raw, "expected native identity");
  exact(value, EXPECTED_KEYS, "expected native identity");
  if (!GIT_SHA.test(value.finalSha) || !GIT_SHA.test(value.sourceTree)) throw new TypeError("invalid expected Git identity");
  text(value.bundleIdentifier, "expected bundleIdentifier");
  text(value.navigationPolicyVersion, "expected navigationPolicyVersion");
  for (const key of ["navigationPolicySha256", "routeContractSha256", "providerConfigSha256", "privacyManifestSha256"]) digest(value[key], `expected ${key}`);
  return value;
}

function validateBuildAuthorities(raw) {
  if (!Array.isArray(raw)) throw new TypeError("trustedBuildAuthorities must be an array");
  const ids = new Set();
  return raw.map((entry) => {
    const value = object(entry, "build authority");
    exact(value, new Set(["buildAuthorityId", "publicKeyPem", "validFrom", "validUntil"]), "build authority");
    if (!FIELD_LEAD_ID.test(value.buildAuthorityId) || ids.has(value.buildAuthorityId)) throw new TypeError("invalid or duplicate build authority");
    ids.add(value.buildAuthorityId);
    if (typeof value.publicKeyPem !== "string" || !value.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")) throw new TypeError("invalid build authority public key");
    if (instant(value.validUntil, "build authority validUntil") <= instant(value.validFrom, "build authority validFrom")) throw new TypeError("invalid build authority validity");
    return value;
  });
}

function validateSignature(raw, payload, publicKeyPem, label) {
  const signature = object(raw, `${label} signature`);
  exact(signature, new Set(["algorithm", "signatureBase64", "signatureSha256"]), `${label} signature`);
  if (signature.algorithm !== "Ed25519" || typeof signature.signatureBase64 !== "string" || !/^[a-f0-9]{64}$/.test(signature.signatureSha256)) throw new TypeError(`invalid ${label} signature metadata`);
  const bytes = Buffer.from(signature.signatureBase64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== signature.signatureSha256 || !verify(null, Buffer.from(canonicalJson(payload)), publicKeyPem, bytes)) {
    throw new TypeError(`invalid ${label} signature`);
  }
}

function validateBuild(raw, expected, authorities, now) {
  const value = object(raw, "native build receipt");
  exact(value, BUILD_KEYS, "native build receipt");
  if (value.schemaVersion !== 1 || value.kind !== "native-build") throw new TypeError("invalid native build receipt version");
  if (value.finalSha !== expected.finalSha || value.sourceTree !== expected.sourceTree || value.bundleIdentifier !== expected.bundleIdentifier) {
    throw new TypeError("native build identity mismatch");
  }
  if (!/^\d+\.\d+$/.test(value.deploymentTarget) || Number(value.deploymentTarget) < 17) throw new TypeError("invalid deployment target");
  for (const key of ["xcodeVersion", "sdk"]) text(value[key], `native build ${key}`);
  if (value.configuration !== "Release") throw new TypeError("native build must use Release configuration");
  for (const key of ["projectSpecSha256", "generatedProjectSha256", "resultBundleSha256", "archiveSha256", "navigationPolicySha256", "routeContractSha256", "providerConfigSha256", "privacyManifestSha256"]) digest(value[key], `native build ${key}`);
  if (value.navigationPolicyVersion !== expected.navigationPolicyVersion ||
      value.navigationPolicySha256 !== expected.navigationPolicySha256 ||
      value.routeContractSha256 !== expected.routeContractSha256 ||
      value.providerConfigSha256 !== expected.providerConfigSha256) {
    throw new TypeError("native build contract mismatch");
  }
  if (!value.privacyManifestInBundle || value.privacyManifestSha256 !== expected.privacyManifestSha256) {
    throw new TypeError("native build privacy manifest mismatch");
  }
  if (value.backgroundBehavior !== BACKGROUND) throw new TypeError("invalid native background behavior declaration");
  const tests = object(value.tests, "native build tests");
  exact(tests, new Set(["unit", "ui", "archive"]), "native build tests");
  for (const key of ["unit", "ui", "archive"]) if (!["PASS", "FAIL"].includes(tests[key])) throw new TypeError(`invalid native build test: ${key}`);
  const signing = object(value.signing, "native build signing");
  exact(signing, new Set(["kind", "teamId", "distribution"]), "native build signing");
  if (!["unsigned", "development", "distribution"].includes(signing.kind) || !["none", "testflight"].includes(signing.distribution)) throw new TypeError("invalid native signing metadata");
  if (signing.teamId !== null && (typeof signing.teamId !== "string" || !/^[A-Z0-9]{10}$/.test(signing.teamId))) throw new TypeError("invalid native signing team");
  if (signing.kind === "unsigned" && signing.teamId !== null) throw new TypeError("unsigned build cannot name a signing team");
  if (signing.distribution === "testflight" && signing.kind !== "distribution") throw new TypeError("TestFlight requires distribution signing");
  if (value.sanitized !== true || value.rawCoordinateAttachments !== false) throw new TypeError("native build receipt must be sanitized without raw coordinates");
  if (!FIELD_LEAD_ID.test(value.buildAuthorityId)) throw new TypeError("invalid buildAuthorityId");
  const issuedAt = instant(value.issuedAt, "native build issuedAt");
  if (issuedAt > now) throw new TypeError("native build receipt is from the future");
  const authority = authorities.find((candidate) => candidate.buildAuthorityId === value.buildAuthorityId);
  if (authority === undefined) throw new TypeError("untrusted build authority");
  if (issuedAt < Date.parse(authority.validFrom) || issuedAt > Date.parse(authority.validUntil) || now > Date.parse(authority.validUntil)) throw new TypeError("build authority outside validity");
  const { signature, ...signedPayload } = value;
  validateSignature(signature, signedPayload, authority.publicKeyPem, "build");
  return value;
}

function validateFieldLeads(raw) {
  if (!Array.isArray(raw)) throw new TypeError("trustedFieldLeads must be an array");
  const ids = new Set();
  return raw.map((entry) => {
    const value = object(entry, "field lead");
    exact(value, new Set(["fieldLeadId", "publicKeyPem", "validFrom", "validUntil"]), "field lead");
    if (!FIELD_LEAD_ID.test(value.fieldLeadId) || ids.has(value.fieldLeadId)) throw new TypeError("invalid or duplicate field lead");
    ids.add(value.fieldLeadId);
    if (typeof value.publicKeyPem !== "string" || !value.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")) throw new TypeError("invalid field lead public key");
    if (instant(value.validUntil, "field lead validUntil") <= instant(value.validFrom, "field lead validFrom")) throw new TypeError("invalid field lead validity");
    return value;
  });
}

function validateDevice(raw, build, expected, leads, now) {
  const receipt = object(raw, "native device receipt");
  exact(receipt, new Set(["schemaVersion", "payload", "signature"]), "native device receipt");
  if (receipt.schemaVersion !== 1) throw new TypeError("invalid native device receipt version");
  const payload = object(receipt.payload, "native device payload");
  exact(payload, DEVICE_PAYLOAD_KEYS, "native device payload");
  if (payload.schemaVersion !== 1 || payload.kind !== "native-device") throw new TypeError("invalid native device payload version");
  if (payload.finalSha !== expected.finalSha || payload.sourceTree !== expected.sourceTree || payload.bundleIdentifier !== expected.bundleIdentifier || payload.archiveSha256 !== build.archiveSha256 || payload.buildReceiptSha256 !== hashCanonical(build)) {
    throw new TypeError("native device identity mismatch");
  }
  if (payload.marketingName !== "iPhone 15 Pro Max" || payload.hardwareIdentifier !== "iPhone16,2") throw new TypeError("native field evidence must use the exact iPhone 15 Pro Max");
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(payload.osVersion)) throw new TypeError("invalid native device OS version");
  if (payload.navigationPolicyVersion !== expected.navigationPolicyVersion || payload.navigationPolicySha256 !== expected.navigationPolicySha256 || payload.routeContractSha256 !== expected.routeContractSha256 || payload.providerConfigSha256 !== expected.providerConfigSha256) {
    throw new TypeError("native device contract mismatch");
  }
  if (payload.backgroundBehaviorObserved !== BACKGROUND) throw new TypeError("invalid observed native background behavior");
  if (!Array.isArray(payload.scenarios) || JSON.stringify(payload.scenarios.map((entry) => entry.id)) !== JSON.stringify(NATIVE_DEVICE_SCENARIOS)) {
    throw new TypeError("native device receipt must contain exact ordered native device scenarios");
  }
  for (const rawScenario of payload.scenarios) {
    const scenario = object(rawScenario, "native device scenario");
    exact(scenario, new Set(["id", "result", "stopObserved", "revealObserved", "falseArrivalCount", "missedArrivalCount"]), "native device scenario");
    if (!["PASS", "FAIL"].includes(scenario.result) || typeof scenario.stopObserved !== "boolean" || typeof scenario.revealObserved !== "boolean" || !Number.isSafeInteger(scenario.falseArrivalCount) || scenario.falseArrivalCount < 0 || !Number.isSafeInteger(scenario.missedArrivalCount) || scenario.missedArrivalCount < 0) {
      throw new TypeError(`invalid native device scenario: ${scenario.id}`);
    }
  }
  if (!Array.isArray(payload.attachments) || payload.attachments.length === 0) throw new TypeError("native device attachments are required");
  for (const rawAttachment of payload.attachments) {
    const attachment = object(rawAttachment, "native device attachment");
    exact(attachment, new Set(["kind", "sha256"]), "native device attachment");
    if (!["sanitized-summary", "redacted-screenshot", "result-metadata"].includes(attachment.kind)) throw new TypeError("raw coordinate attachments are forbidden");
    digest(attachment.sha256, "native device attachment sha256");
  }
  if (!FIELD_LEAD_ID.test(payload.fieldLeadId)) throw new TypeError("invalid device fieldLeadId");
  const issuedAt = instant(payload.issuedAt, "native device issuedAt");
  if (issuedAt > now) throw new TypeError("native device receipt is from the future");
  const lead = leads.find((candidate) => candidate.fieldLeadId === payload.fieldLeadId);
  if (lead === undefined) throw new TypeError("untrusted field lead");
  if (issuedAt < Date.parse(lead.validFrom) || issuedAt > Date.parse(lead.validUntil) || now > Date.parse(lead.validUntil)) throw new TypeError("field lead outside validity");
  validateSignature(receipt.signature, payload, lead.publicKeyPem, "device");
  return receipt;
}

const hashCanonical = (value) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export function verifyNativeEvidence(input) {
  const expected = validateExpected(input.expected);
  const decidedAt = new Date(instant(input.now, "now")).toISOString();
  if (input.buildReceipt === null || input.deviceReceipt === null) {
    return {
      schemaVersion: 1,
      finalSha: expected.finalSha,
      sourceTree: expected.sourceTree,
      decidedAt,
      nativeBuild: "BLOCK",
      nativeField: "BLOCK",
      nativeDistribution: "BLOCK",
      nativeIOS: "BLOCK",
      reasons: ["PRIVATE_NATIVE_EVIDENCE_MISSING"],
      buildReceiptSha256: null,
      deviceReceiptSha256: null,
    };
  }
  const buildAuthorities = validateBuildAuthorities(input.trustedBuildAuthorities);
  const build = validateBuild(input.buildReceipt, expected, buildAuthorities, Date.parse(input.now));
  const leads = validateFieldLeads(input.trustedFieldLeads);
  const device = validateDevice(input.deviceReceipt, build, expected, leads, Date.parse(input.now));
  const nativeBuild = Object.values(build.tests).includes("FAIL") ? "FAIL" : "PASS";
  const nativeField = device.payload.scenarios.some((scenario) => scenario.result === "FAIL" || !scenario.stopObserved || !scenario.revealObserved) ? "FAIL" : "PASS";
  const nativeDistribution = build.signing.kind === "distribution" && build.signing.distribution === "testflight" ? "PASS" : "BLOCK";
  const nativeIOS = nativeBuild === "FAIL" || nativeField === "FAIL" ? "FAIL" : "PASS";
  const reasons = [];
  if (nativeBuild === "FAIL") reasons.push("NATIVE_BUILD_TEST_FAILED");
  if (nativeField === "FAIL") reasons.push("NATIVE_DEVICE_SCENARIO_FAILED");
  if (nativeDistribution === "BLOCK") reasons.push("NATIVE_DISTRIBUTION_AUTHORITY_MISSING");
  return {
    schemaVersion: 1,
    finalSha: expected.finalSha,
    sourceTree: expected.sourceTree,
    decidedAt,
    nativeBuild,
    nativeField,
    nativeDistribution,
    nativeIOS,
    reasons,
    buildReceiptSha256: hashCanonical(build),
    deviceReceiptSha256: hashCanonical(device),
  };
}

function options(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 4 || argv[0] !== "--evidence" || argv[2] !== "--output") throw new TypeError("Usage: --evidence <private-dir> --output <external-json>");
  return { evidence: resolve(argv[1]), output: resolve(argv[3]) };
}

async function exists(path) {
  try { await access(path, constants.R_OK); return true; } catch { return false; }
}

function outside(path, root) {
  const relation = relative(root, path);
  return relation === ".." || relation.startsWith("../");
}

async function main(argv) {
  const parsed = options(argv);
  if (parsed.help) {
    process.stdout.write("Usage: bun scripts/ios/verify-native-evidence.mjs --evidence <private-dir> --output <external-json>\n");
    return;
  }
  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  await mkdir(dirname(parsed.output), { recursive: true, mode: 0o700 });
  if (!outside(parsed.output, repoRoot) || !outside(await realpath(dirname(parsed.output)), await realpath(repoRoot))) {
    throw new TypeError("native verdict output must be outside the repository");
  }
  const names = ["expected.json", "native-build.json", "native-device.json", "trusted-build-authorities.json", "trusted-field-leads.json"];
  const present = await Promise.all(names.map((name) => exists(resolve(parsed.evidence, name))));
  let result;
  if (present.some((value) => !value)) {
    result = {
      schemaVersion: 1,
      decidedAt: new Date().toISOString(),
      nativeBuild: "BLOCK",
      nativeField: "BLOCK",
      nativeDistribution: "BLOCK",
      nativeIOS: "BLOCK",
      reasons: ["PRIVATE_NATIVE_EVIDENCE_MISSING"],
      missingFiles: names.filter((_, index) => !present[index]),
    };
  } else {
    const realRepoRoot = await realpath(repoRoot);
    if (!outside(await realpath(parsed.evidence), realRepoRoot)) {
      throw new TypeError("native evidence must be outside the repository");
    }
    for (const name of names) {
      if (!outside(await realpath(resolve(parsed.evidence, name)), realRepoRoot)) {
        throw new TypeError("native evidence files must be outside the repository");
      }
    }
    const [expected, buildReceipt, deviceReceipt, trustedBuildAuthorities, trustedFieldLeads] = await Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(parsed.evidence, name), "utf8"))));
    result = verifyNativeEvidence({ expected, buildReceipt, deviceReceipt, trustedBuildAuthorities, trustedFieldLeads, now: new Date().toISOString() });
  }
  await writeFile(parsed.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(`${JSON.stringify({ gate: result.nativeIOS, output: parsed.output })}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
