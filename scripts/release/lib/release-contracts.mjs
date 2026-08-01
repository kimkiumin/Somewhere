import { ReleaseInputError, normalizeDigest } from "./release-core.mjs";

const LANES = new Set(["F1", "F2", "F3", "F4"]);
const GATES = new Set(["PASS", "BLOCK", "FAIL"]);

export function assertObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReleaseInputError(`${label} must be an object`);
  }
  return value;
}

export function assertExactKeys(value, required, optional = []) {
  const object = assertObject(value, "value");
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!(key in object)) throw new ReleaseInputError(`missing field: ${key}`);
  }
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ReleaseInputError(`unknown field: ${key}`);
  }
  return object;
}

export function assertGate(value, label = "gate") {
  if (typeof value !== "string" || !GATES.has(value)) {
    throw new ReleaseInputError(`${label} must be PASS, BLOCK, or FAIL`);
  }
  return value;
}

export function assertLane(value) {
  if (typeof value !== "string" || !LANES.has(value)) {
    throw new ReleaseInputError("lane must be F1, F2, F3, or F4");
  }
  return value;
}

export function assertReceiptLane(value) {
  if (value === "FINAL") return value;
  return assertLane(value);
}

export function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ReleaseInputError(`${label} must be a nonempty string`);
  }
  return value;
}

export function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new ReleaseInputError(`${label} must be a string array`);
  }
  if (new Set(value).size !== value.length) throw new ReleaseInputError(`${label} contains duplicates`);
  return value;
}

export function validatePolicy(value) {
  const policy = assertExactKeys(value, ["path", "sha256"]);
  assertString(policy.path, "policy.path");
  normalizeDigest(assertString(policy.sha256, "policy.sha256"), "policy.sha256");
  return policy;
}

export function validateLaneVerdict(value) {
  const verdict = assertExactKeys(value, [
    "schemaVersion",
    "lane",
    "finalSha",
    "sourceTree",
    "planSha256",
    "policy",
    "repositoryGate",
    "externalGate",
    "checksDigest",
    "cleanupDigest",
  ]);
  if (verdict.schemaVersion !== 1) throw new ReleaseInputError("lane verdict schemaVersion must be 1");
  assertLane(verdict.lane);
  if (!/^[a-f0-9]{40}$/.test(verdict.finalSha)) throw new ReleaseInputError("invalid finalSha");
  if (!/^[a-f0-9]{40}$/.test(verdict.sourceTree)) throw new ReleaseInputError("invalid sourceTree");
  normalizeDigest(verdict.planSha256, "planSha256");
  validatePolicy(verdict.policy);
  assertGate(verdict.repositoryGate, "repositoryGate");
  assertGate(verdict.externalGate, "externalGate");
  normalizeDigest(verdict.checksDigest, "checksDigest");
  normalizeDigest(verdict.cleanupDigest, "cleanupDigest");
  return verdict;
}

export function validateCleanup(value) {
  const cleanup = assertExactKeys(value, [
    "schemaVersion",
    "gate",
    "serverCount",
    "browserContextCount",
    "openPorts",
    "tempRoots",
  ]);
  if (cleanup.schemaVersion !== 1) throw new ReleaseInputError("cleanup schemaVersion must be 1");
  if (!["PASS", "FAIL"].includes(cleanup.gate)) {
    throw new ReleaseInputError("cleanup gate must be PASS or FAIL");
  }
  for (const key of ["serverCount", "browserContextCount"]) {
    if (!Number.isInteger(cleanup[key]) || cleanup[key] < 0) {
      throw new ReleaseInputError(`${key} must be a nonnegative integer`);
    }
  }
  if (!Array.isArray(cleanup.openPorts) || cleanup.openPorts.some((port) => !Number.isInteger(port))) {
    throw new ReleaseInputError("openPorts must be an integer array");
  }
  assertStringArray(cleanup.tempRoots, "tempRoots");
  return cleanup;
}

export function validateExternalGates(value) {
  const external = assertExactKeys(value, ["schemaVersion", "finalSha", "sourceTree", "gates", "releaseGate"]);
  if (
    external.schemaVersion !== 1
    || !/^[a-f0-9]{40}$/.test(external.finalSha)
    || !/^[a-f0-9]{40}$/.test(external.sourceTree)
  ) {
    throw new ReleaseInputError("invalid external-gates identity");
  }
  if (!Array.isArray(external.gates) || external.gates.length === 0) {
    throw new ReleaseInputError("external gates must not be empty");
  }
  const ids = [];
  for (const entry of external.gates) {
    const gate = assertExactKeys(entry, ["id", "gate", "reason"]);
    ids.push(assertString(gate.id, "external gate id"));
    assertGate(gate.gate);
    assertString(gate.reason, "external gate reason");
  }
  if (new Set(ids).size !== ids.length) throw new ReleaseInputError("duplicate external gate");
  assertGate(external.releaseGate, "releaseGate");
  const derived = external.gates.some((entry) => entry.gate === "FAIL")
    ? "FAIL"
    : external.gates.some((entry) => entry.gate === "BLOCK")
      ? "BLOCK"
      : "PASS";
  if (external.releaseGate !== derived) throw new ReleaseInputError("external releaseGate contradiction");
  return external;
}

export function validateFinalVerdict(value) {
  const verdict = assertExactKeys(value, [
    "schemaVersion",
    "finalSha",
    "sourceTree",
    "repositoryReady",
    "releaseReady",
    "lanes",
    "externalGate",
    "externalDigest",
    "cleanupDigest",
  ]);
  if (
    verdict.schemaVersion !== 1
    || !/^[a-f0-9]{40}$/.test(verdict.finalSha)
    || !/^[a-f0-9]{40}$/.test(verdict.sourceTree)
  ) {
    throw new ReleaseInputError("invalid final-verdict identity");
  }
  if (!["PASS", "FAIL"].includes(verdict.repositoryReady)) {
    throw new ReleaseInputError("repositoryReady must be PASS or FAIL");
  }
  assertGate(verdict.releaseReady, "releaseReady");
  assertGate(verdict.externalGate, "externalGate");
  normalizeDigest(verdict.externalDigest, "externalDigest");
  normalizeDigest(verdict.cleanupDigest, "cleanupDigest");
  if (!Array.isArray(verdict.lanes) || verdict.lanes.length !== 4) {
    throw new ReleaseInputError("final verdict requires exactly four lanes");
  }
  const lanes = verdict.lanes.map((value) => {
    const lane = assertExactKeys(value, ["lane", "repositoryGate", "externalGate"]);
    assertLane(lane.lane);
    assertGate(lane.repositoryGate, "lane.repositoryGate");
    assertGate(lane.externalGate, "lane.externalGate");
    return lane.lane;
  });
  if (new Set(lanes).size !== 4 || lanes.some((lane, index) => lane !== `F${index + 1}`)) {
    throw new ReleaseInputError("final verdict lanes must be ordered F1 through F4");
  }
  return verdict;
}
