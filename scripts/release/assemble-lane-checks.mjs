import { resolve } from "node:path";
import { access, readdir } from "node:fs/promises";
import {
  mainBoundary,
  parseArguments,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";
import { assertGate, assertLane, assertObject, assertStringArray } from "./lib/release-contracts.mjs";

const specification = {
  required: ["--lane", "--registry", "--root", "--output"],
  optional: ["--selftest"],
};

function registeredIds(registry, lane) {
  const lanes = assertObject(registry.lanes, "registry.lanes");
  if (Array.isArray(lanes[lane])) {
    return { repository: assertStringArray(lanes[lane], lane), external: [] };
  }
  const value = assertObject(lanes[lane], `registry.${lane}`);
  return {
    repository: assertStringArray(value.repository, `${lane}.repository`),
    external: assertStringArray(value.external, `${lane}.external`),
  };
}

async function assemble(options) {
  const lane = assertLane(options.lane);
  const registryPath = resolve(options.registry);
  const registrySnapshot = await snapshotRegularFile(registryPath, "lane registry");
  const registry = JSON.parse(registrySnapshot.data.toString());
  const ids = registeredIds(registry, lane);
  const expected = [...ids.repository, ...ids.external];
  const laneRoot = resolve(options.root, lane);
  const receiptPrefix = "command-";
  const observed = (await readdir(laneRoot))
    .filter((name) => name.startsWith(receiptPrefix) && name.endsWith(".json"))
    .map((name) => name.slice(receiptPrefix.length, -".json".length))
    .sort();
  const extras = observed.filter((id) => !expected.includes(id));
  if (extras.length > 0) throw new TypeError(`unregistered command receipts: ${extras.join(",")}`);
  const checks = [];
  const missing = [];
  for (const id of expected) {
    const receiptPath = resolve(laneRoot, `command-${id}.json`);
    try {
      await access(receiptPath);
    } catch {
      missing.push(id);
      continue;
    }
    const receiptSnapshot = await snapshotRegularFile(receiptPath, `command receipt ${id}`);
    const receipt = JSON.parse(receiptSnapshot.data.toString());
    if (receipt.schemaVersion !== 1 || receipt.lane !== lane || receipt.checkId !== id) {
      throw new TypeError(`receipt identity mismatch: ${id}`);
    }
    const primaryPath = resolve(receipt.primary.path);
    const primarySha256 = (await snapshotRegularFile(primaryPath, `command primary ${id}`)).sha256;
    if (primarySha256 !== receipt.primary.sha256) throw new TypeError(`primary digest mismatch: ${id}`);
    checks.push({
      id,
      classification: ids.external.includes(id) ? "external" : "repository",
      gate: assertGate(receipt.gate),
      receipt: receiptPath,
      receiptSha256: receiptSnapshot.sha256,
      primarySha256,
    });
  }
  const repositoryChecks = checks.filter((check) => check.classification === "repository");
  const gate = missing.length > 0
    ? "BLOCK"
    : repositoryChecks.some((check) => check.gate === "FAIL")
      ? "FAIL"
      : repositoryChecks.some((check) => check.gate === "BLOCK")
        ? "BLOCK"
        : "PASS";
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate,
    lane,
    checks,
    registryDigest: registrySnapshot.sha256,
    missing,
  });
  if (gate !== "PASS") process.exitCode = 1;
}

const parsed = parseArguments(process.argv.slice(2), specification);
if (parsed.selftest !== undefined) {
  console.error(parsed.selftest);
  process.exitCode = 1;
} else {
  await mainBoundary(() => assemble(parsed), parsed.output);
}
