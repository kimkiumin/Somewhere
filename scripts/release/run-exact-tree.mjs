#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, readdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const EXIT_CLASSES = new Set([
  "TDD_RED_NONZERO",
  "GREEN_ZERO",
  "NEGATIVE_PASS_ZERO",
  "MUTATION_CAUGHT_NONZERO",
]);
const IGNORED_TOP_LEVEL = new Set(["node_modules"]);

class ExactTreeInputError extends Error {
  name = "ExactTreeInputError";
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new ExactTreeInputError("arguments must be --name value pairs");
    }
    if (values.has(key)) {
      throw new ExactTreeInputError(`duplicate argument: ${key}`);
    }
    values.set(key, value);
  }
  const required = ["--repo", "--source", "--tree", "--argv-json", "--expected", "--output"];
  for (const key of required) {
    if (!values.has(key)) {
      throw new ExactTreeInputError(`missing argument: ${key}`);
    }
  }
  if (values.size !== required.length) {
    throw new ExactTreeInputError("unknown argument");
  }
  return Object.fromEntries(required.map((key) => [key.slice(2), values.get(key)]));
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function git(repo, args) {
  const child = Bun.spawn(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new ExactTreeInputError(`git failed: ${stderr.trim()}`);
  }
  return stdout;
}

async function walk(source, directory = "") {
  const entries = await readdir(resolve(source, directory), { withFileTypes: true });
  const inventory = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    if (IGNORED_TOP_LEVEL.has(entry.name)) {
      continue;
    }
    const relativePath = directory === "" ? entry.name : `${directory}/${entry.name}`;
    const absolutePath = resolve(source, relativePath);
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      const target = await realpath(absolutePath);
      if (!isInside(source, target)) {
        throw new ExactTreeInputError(`symlink escapes source: ${relativePath}`);
      }
      const linkBytes = new TextEncoder().encode(await readlink(absolutePath));
      const hash = createHash("sha1");
      hash.update(`blob ${linkBytes.byteLength}`);
      hash.update(new Uint8Array([0]));
      hash.update(linkBytes);
      inventory.push({ path: relativePath, mode: "120000", blob: hash.digest("hex") });
    } else if (stat.isDirectory()) {
      inventory.push(...await walk(source, relativePath));
    } else if (stat.isFile()) {
      const mode = (stat.mode & 0o111) === 0 ? "100644" : "100755";
      const hash = createHash("sha1");
      hash.update(`blob ${stat.size}`);
      hash.update(new Uint8Array([0]));
      hash.update(await readFile(absolutePath));
      inventory.push({ path: relativePath, mode, blob: hash.digest("hex") });
    } else {
      throw new ExactTreeInputError(`unsupported file type: ${relativePath}`);
    }
  }
  return inventory;
}

function parseGitInventory(output) {
  return output.split("\0").filter(Boolean).map((entry) => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (match === null) {
      throw new ExactTreeInputError("tree contains unsupported entry");
    }
    return { mode: match[1], blob: match[2], path: match[3] };
  });
}

function digestInventory(inventory) {
  const canonical = inventory.map((entry) => `${entry.mode} ${entry.blob}\t${entry.path}\0`).join("");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function equalInventory(left, right) {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined
      && entry.path === other.path
      && entry.mode === other.mode
      && entry.blob === other.blob;
  });
}

function sortInventory(inventory) {
  return inventory.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function observedClass(expected, exitCode) {
  const zeroExpected = expected === "GREEN_ZERO" || expected === "NEGATIVE_PASS_ZERO";
  if ((zeroExpected && exitCode === 0) || (!zeroExpected && exitCode !== 0)) {
    return expected;
  }
  return exitCode === 0 ? "GREEN_ZERO" : "TDD_RED_NONZERO";
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!EXIT_CLASSES.has(options.expected)) {
    throw new ExactTreeInputError("unknown expected exit class");
  }
  if (!/^[a-f0-9]{40}$/.test(options.tree)) {
    throw new ExactTreeInputError("tree must be a 40-hex object");
  }
  const argv = JSON.parse(options["argv-json"]);
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== "string")) {
    throw new ExactTreeInputError("argv-json must be a nonempty string array");
  }
  const repo = await realpath(options.repo);
  const source = await realpath(options.source);
  const output = resolve(options.output);
  if (isInside(repo, source)) {
    throw new ExactTreeInputError("source must not be the repository worktree");
  }
  if (isInside(source, output)) {
    throw new ExactTreeInputError("output must be outside source");
  }
  const objectType = (await git(repo, ["cat-file", "-t", options.tree])).trim();
  if (objectType !== "tree") {
    throw new ExactTreeInputError("expected object is not a tree");
  }
  const expectedInventory = sortInventory(parseGitInventory(await git(repo, ["ls-tree", "-rz", options.tree])));
  const beforeInventory = sortInventory(await walk(source));
  if (!equalInventory(expectedInventory, beforeInventory)) {
    const expectedByPath = new Map(expectedInventory.map((entry) => [entry.path, entry]));
    const actualByPath = new Map(beforeInventory.map((entry) => [entry.path, entry]));
    const mismatch = [...new Set([...expectedByPath.keys(), ...actualByPath.keys()])]
      .sort()
      .find((path) => {
        const expected = expectedByPath.get(path);
        const actual = actualByPath.get(path);
        return expected === undefined
          || actual === undefined
          || expected.mode !== actual.mode
          || expected.blob !== actual.blob;
      });
    throw new ExactTreeInputError(
      `materialized inventory/mode/blob mismatch: ${mismatch ?? "ordering"} expected=${JSON.stringify(expectedByPath.get(mismatch ?? ""))} actual=${JSON.stringify(actualByPath.get(mismatch ?? ""))}`,
    );
  }
  const startedAt = new Date().toISOString();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: source,
    env: {
      PATH: process.env.PATH,
      SOMEWHERE_MATERIALIZED_SOURCE: source,
      SOMEWHERE_SOURCE_TREE: options.tree,
      SOMEWHERE_EVIDENCE_ROOT: resolve(output, ".."),
    },
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 255));
  });
  const afterInventory = sortInventory(await walk(source));
  const sourceUnchanged = equalInventory(beforeInventory, afterInventory);
  if (!sourceUnchanged) {
    throw new ExactTreeInputError("command changed tracked source inventory");
  }
  const exitClass = observedClass(options.expected, exitCode);
  const assertion = exitClass === options.expected
    ? `exit ${exitCode} satisfied ${options.expected}`
    : `exit ${exitCode} did not satisfy ${options.expected}`;
  const receipt = {
    schemaVersion: 1,
    tree: options.tree,
    inventoryDigest: digestInventory(beforeInventory),
    argv,
    cwd: source,
    exitCode,
    exitClass,
    expectedClass: options.expected,
    assertion,
    artifacts: [],
    cleanup: { sourceUnchanged, temporaryRootRemovedByCaller: true },
    startedAt,
    endedAt: new Date().toISOString(),
  };
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  if (exitClass !== options.expected) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof ExactTreeInputError || error instanceof SyntaxError) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
