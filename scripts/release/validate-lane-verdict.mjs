import { resolve } from "node:path";
import {
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { assertLane, validateLaneVerdict } from "./lib/release-contracts.mjs";

const specification = {
  required: ["--lane", "--sha", "--source-tree", "--plan-sha256", "--policy", "--policy-sha256"],
  optional: ["--registry", "--checks", "--cleanup", "--output", "--validate-existing"],
};

function assertIdentity(verdict, options) {
  if (
    verdict.lane !== options.lane
    || verdict.finalSha !== options.sha
    || verdict.sourceTree !== options["source-tree"]
    || verdict.planSha256 !== normalizeDigest(options["plan-sha256"])
    || verdict.policy.path !== options.policy
    || verdict.policy.sha256 !== normalizeDigest(options["policy-sha256"])
  ) {
    throw new TypeError("lane verdict identity mismatch");
  }
}

async function validateExisting(options) {
  const verdict = validateLaneVerdict(await readJson(resolve(options["validate-existing"])));
  assertIdentity(verdict, options);
}

async function createVerdict(options) {
  for (const key of ["registry", "checks", "cleanup", "output"]) {
    if (options[key] === undefined) throw new TypeError(`missing argument: --${key}`);
  }
  const checksSnapshot = await snapshotRegularFile(resolve(options.checks), "lane checks");
  const checks = JSON.parse(checksSnapshot.data.toString());
  const registryPath = resolve(options.registry);
  const registrySnapshot = await snapshotRegularFile(registryPath, "lane registry");
  const registry = JSON.parse(registrySnapshot.data.toString());
  const configured = registry.lanes?.[options.lane];
  const expectedRepository = Array.isArray(configured) ? configured : configured?.repository;
  const expectedExternal = Array.isArray(configured) ? [] : configured?.external;
  if (!Array.isArray(expectedRepository) || !Array.isArray(expectedExternal)) {
    throw new TypeError("invalid lane check registry");
  }
  const expected = [...expectedRepository, ...expectedExternal];
  if (
    checks.schemaVersion !== 1
    || checks.lane !== options.lane
    || checks.registryDigest !== registrySnapshot.sha256
    || checks.gate !== "PASS"
    || !Array.isArray(checks.missing)
    || checks.missing.length !== 0
    || !Array.isArray(checks.checks)
    || JSON.stringify(checks.checks.map((check) => check.id)) !== JSON.stringify(expected)
  ) {
    throw new TypeError("checks identity or registry mismatch");
  }
  for (const check of checks.checks) {
    const expectedClassification = expectedExternal.includes(check.id) ? "external" : "repository";
    const receiptPath = resolve(check.receipt);
    const receiptSnapshot = await snapshotRegularFile(receiptPath, `command receipt ${check.id}`);
    const receipt = JSON.parse(receiptSnapshot.data.toString());
    const primarySnapshot = await snapshotRegularFile(
      resolve(receipt.primary?.path),
      `command primary ${check.id}`,
    );
    if (
      check.classification !== expectedClassification
      || check.receiptSha256 !== receiptSnapshot.sha256
      || receipt.lane !== options.lane
      || receipt.checkId !== check.id
      || receipt.finalSha !== options.sha
      || receipt.sourceTree !== options["source-tree"]
      || receipt.planSha256 !== normalizeDigest(options["plan-sha256"])
      || receipt.policy?.path !== options.policy
      || receipt.policy?.sha256 !== normalizeDigest(options["policy-sha256"])
      || receipt.gate !== check.gate
      || receipt.primary?.sha256 !== check.primarySha256
      || primarySnapshot.sha256 !== check.primarySha256
    ) {
      throw new TypeError(`foreign or tampered command receipt: ${check.id}`);
    }
  }
  const cleanupSnapshot = await snapshotRegularFile(resolve(options.cleanup), "lane cleanup");
  const cleanup = JSON.parse(cleanupSnapshot.data.toString());
  if (
    cleanup.schemaVersion !== 1
    || cleanup.gate !== "PASS"
    || cleanup.portClosed !== true
    || cleanup.browserContextCount !== 0
    || cleanup.tempRootRemoved !== true
  ) {
    throw new TypeError("cleanup receipt does not pass");
  }
  const externalChecks = checks.checks.filter((check) => check.classification === "external");
  const externalGate = externalChecks.some((check) => check.gate === "FAIL")
    ? "FAIL"
    : externalChecks.some((check) => check.gate === "BLOCK")
      ? "BLOCK"
      : "PASS";
  const verdict = {
    schemaVersion: 1,
    lane: assertLane(options.lane),
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    planSha256: normalizeDigest(options["plan-sha256"]),
    policy: { path: options.policy, sha256: normalizeDigest(options["policy-sha256"]) },
    repositoryGate: checks.gate,
    externalGate,
    checksDigest: checksSnapshot.sha256,
    cleanupDigest: cleanupSnapshot.sha256,
  };
  validateLaneVerdict(verdict);
  await writeJson(resolve(options.output), verdict);
  if (verdict.repositoryGate !== "PASS") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(
  () => parsed["validate-existing"] === undefined ? createVerdict(parsed) : validateExisting(parsed),
  parsed.output,
);
