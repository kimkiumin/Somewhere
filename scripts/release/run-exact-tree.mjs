#!/usr/bin/env node
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ReleaseInputError,
  git,
  isInside,
  parseArguments,
  resolveExistingDirectory,
} from "./lib/release-core.mjs";
import {
  changedArtifacts,
  evidenceInventory,
} from "./lib/exact-command-boundary.mjs";
import { runExactCommand } from "./lib/exact-command-boundary.mjs";
import { verifiedPublishedArtifacts } from "./lib/exact-evidence-boundary.mjs";
import {
  assertSameTree,
  inventory,
  inventoryDigest,
  parseGitTree,
} from "./lib/tree-inventory.mjs";

const EXIT_CLASSES = new Set([
  "TDD_RED_NONZERO",
  "GREEN_ZERO",
  "NEGATIVE_PASS_ZERO",
  "MUTATION_CAUGHT_NONZERO",
]);
const specification = {
  required: ["--repo", "--source", "--tree", "--argv-json", "--expected", "--output"],
  optional: ["--dependency-root", "--evidence-root", "--network-policy"],
};

function observedClass(expected, exitCode) {
  const zeroExpected = expected === "GREEN_ZERO" || expected === "NEGATIVE_PASS_ZERO";
  if ((zeroExpected && exitCode === 0) || (!zeroExpected && exitCode !== 0)) return expected;
  return exitCode === 0 ? "GREEN_ZERO" : "TDD_RED_NONZERO";
}

async function requireAbsent(path) {
  try {
    await lstat(path);
    throw new ReleaseInputError("output already exists");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function execute(options) {
  if (!EXIT_CLASSES.has(options.expected)) throw new ReleaseInputError("unknown expected exit class");
  if (!/^[a-f0-9]{40}$/u.test(options.tree)) {
    throw new ReleaseInputError("tree must be a 40-hex object");
  }
  const argv = JSON.parse(options["argv-json"]);
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== "string")) {
    throw new ReleaseInputError("argv-json must be a nonempty string array");
  }
  const repo = await realpath(options.repo);
  const source = await resolveExistingDirectory(options.source, "source");
  const output = resolve(options.output);
  const evidenceRoot = await resolveExistingDirectory(
    options["evidence-root"] ?? dirname(output),
    "evidence root",
  );
  const dependencyRoot = options["dependency-root"] === undefined
    ? undefined
    : await resolveExistingDirectory(options["dependency-root"], "dependency root");
  if (
    isInside(repo, source)
    || isInside(source, evidenceRoot)
    || isInside(repo, evidenceRoot)
    || !isInside(evidenceRoot, output)
  ) {
    throw new ReleaseInputError("source and evidence must be external, disjoint paths");
  }
  await mkdir(dirname(output), { recursive: true });
  await requireAbsent(output);
  if (await git(repo, ["cat-file", "-t", options.tree]) !== "tree") {
    throw new ReleaseInputError("expected object is not a tree");
  }
  const expected = parseGitTree(await git(repo, ["ls-tree", "-rz", options.tree]));
  const before = await inventory(source);
  assertSameTree(expected, before);
  const evidenceBefore = await evidenceInventory(evidenceRoot, output);
  const startedAt = new Date().toISOString();
  const boundary = await runExactCommand(
    argv,
    source,
    evidenceRoot,
    dependencyRoot,
    options.tree,
    options["network-policy"] ?? "inherit",
    options.expected,
  );
  const after = await inventory(source);
  assertSameTree(before, after);
  const observedArtifacts = changedArtifacts(
    evidenceBefore,
    await evidenceInventory(evidenceRoot, output),
  );
  const artifacts = verifiedPublishedArtifacts(observedArtifacts, boundary.artifacts);
  const exitClass = observedClass(options.expected, boundary.exitCode);
  await writeFile(output, `${JSON.stringify({
    schemaVersion: 1,
    tree: options.tree,
    inventoryDigest: inventoryDigest(before),
    argv,
    cwd: boundary.cwd,
    exitCode: boundary.exitCode,
    exitClass,
    expectedClass: options.expected,
    assertion: exitClass === options.expected
      ? `exit ${boundary.exitCode} satisfied ${options.expected}`
      : `exit ${boundary.exitCode} did not satisfy ${options.expected}`,
    artifacts,
    dependencies: boundary.dependencies,
    environment: boundary.environment,
    network: boundary.network,
    cleanup: {
      sourceUnchanged: true,
      temporaryRootRemovedByCaller: true,
      runnerTemporaryRootRemoved: true,
    },
    startedAt,
    endedAt: new Date().toISOString(),
  }, null, 2)}\n`, { flag: "wx" });
  if (exitClass !== options.expected) process.exitCode = 1;
}

try {
  const parsed = parseArguments(process.argv.slice(2), specification);
  await execute(parsed);
} catch (error) {
  if (error instanceof ReleaseInputError || error instanceof SyntaxError) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
