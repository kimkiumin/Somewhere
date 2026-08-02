import { resolve } from "node:path";
import {
  digestFile,
  mainBoundary,
  normalizeDigest,
  parseArguments,
  readJson,
  writeJson,
} from "./lib/release-core.mjs";
import {
  validateCleanup,
  validateExternalGates,
  validateLaneVerdict,
} from "./lib/release-contracts.mjs";

const specification = {
  required: [
    "--preparation",
    "--sha",
    "--source-tree",
    "--plan-sha256",
    "--policy",
    "--policy-sha256",
    "--f1",
    "--f2",
    "--f3",
    "--f4",
    "--external",
    "--cleanup",
    "--output",
  ],
};

async function aggregate(options) {
  const preparation = await readJson(resolve(options.preparation));
  const planDigest = normalizeDigest(options["plan-sha256"]);
  const policyDigest = normalizeDigest(options["policy-sha256"]);
  if (
    preparation.preparationGate !== "PASS"
    || preparation.finalSha !== options.sha
    || preparation.sourceTree !== options["source-tree"]
    || preparation.reviewedPlan.sha256 !== planDigest
    || preparation.policy.path !== options.policy
    || preparation.policy.sha256 !== policyDigest
  ) {
    throw new TypeError("preparation identity mismatch");
  }
  const lanePaths = [options.f1, options.f2, options.f3, options.f4];
  const lanes = [];
  for (const [index, path] of lanePaths.entries()) {
    const lane = validateLaneVerdict(await readJson(resolve(path)));
    if (
      lane.lane !== `F${index + 1}`
      || lane.finalSha !== options.sha
      || lane.sourceTree !== options["source-tree"]
      || lane.planSha256 !== planDigest
      || lane.policy.path !== options.policy
      || lane.policy.sha256 !== policyDigest
    ) {
      throw new TypeError("foreign lane verdict");
    }
    lanes.push(lane);
  }
  const external = validateExternalGates(await readJson(resolve(options.external)));
  const cleanup = validateCleanup(await readJson(resolve(options.cleanup)));
  if (external.finalSha !== options.sha) throw new TypeError("external gates foreign SHA");
  if (external.sourceTree !== options["source-tree"]) {
    throw new TypeError("external gates foreign source tree");
  }
  if (external.releaseGate === "PASS") {
    throw new TypeError("UNAUTHENTICATED_EXTERNAL_PASS");
  }
  const repositoryReady = lanes.every((lane) => lane.repositoryGate === "PASS") && cleanup.gate === "PASS"
    ? "PASS"
    : "FAIL";
  const laneExternalBlock = lanes.some((lane) => lane.externalGate === "BLOCK");
  const laneExternalFail = lanes.some((lane) => lane.externalGate === "FAIL");
  const releaseReady = repositoryReady === "FAIL" || laneExternalFail || external.releaseGate === "FAIL"
    ? "FAIL"
    : laneExternalBlock || external.releaseGate === "BLOCK"
      ? "BLOCK"
      : "PASS";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    finalSha: options.sha,
    sourceTree: options["source-tree"],
    repositoryReady,
    releaseReady,
    lanes: lanes.map((lane) => ({
      lane: lane.lane,
      repositoryGate: lane.repositoryGate,
      externalGate: lane.externalGate,
    })),
    externalGate: external.releaseGate,
    externalDigest: await digestFile(resolve(options.external)),
    cleanupDigest: await digestFile(resolve(options.cleanup)),
  });
  if (repositoryReady !== "PASS" || releaseReady === "FAIL") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => aggregate(parsed), parsed.output);
