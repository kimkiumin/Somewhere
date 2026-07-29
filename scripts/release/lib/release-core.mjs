import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class ReleaseInputError extends Error {
  name = "ReleaseInputError";
}

export function parseArguments(argv, specification) {
  if (argv.includes("--help")) return { help: true };
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new ReleaseInputError("arguments must be --name value pairs");
    }
    if (options.has(key)) throw new ReleaseInputError(`duplicate argument: ${key}`);
    options.set(key, value);
  }
  const allowed = new Set([...specification.required, ...(specification.optional ?? [])]);
  for (const key of options.keys()) {
    if (!allowed.has(key)) throw new ReleaseInputError(`unknown argument: ${key}`);
  }
  for (const key of specification.required) {
    if (!options.has(key)) throw new ReleaseInputError(`missing argument: ${key}`);
  }
  return Object.fromEntries([...options].map(([key, value]) => [key.slice(2), value]));
}

export function assertHex(value, length, label) {
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    throw new ReleaseInputError(`${label} must be ${length}-hex`);
  }
  return value;
}

export function normalizeDigest(value, label = "digest") {
  const unprefixed = value.startsWith("sha256:") ? value.slice(7) : value;
  assertHex(unprefixed, 64, label);
  return `sha256:${unprefixed}`;
}

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

export async function snapshotRegularFile(path, label = "artifact", afterRead) {
  if (afterRead !== undefined && typeof afterRead !== "function") {
    throw new ReleaseInputError("afterRead must be a function");
  }
  const initialPath = await lstat(path, { bigint: true });
  if (!initialPath.isFile() || initialPath.isSymbolicLink()) {
    throw new ReleaseInputError(`${label} must be a regular file`);
  }
  const descriptor = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await descriptor.stat({ bigint: true });
    if (!before.isFile() || !sameFileIdentity(initialPath, before)) {
      throw new ReleaseInputError(`${label} changed while opening`);
    }
    const data = await descriptor.readFile();
    if (afterRead !== undefined) await afterRead();
    const [after, finalPath] = await Promise.all([
      descriptor.stat({ bigint: true }),
      lstat(path, { bigint: true }),
    ]);
    if (
      !after.isFile()
      || !finalPath.isFile()
      || finalPath.isSymbolicLink()
      || !sameFileIdentity(before, after)
      || !sameFileIdentity(after, finalPath)
      || BigInt(data.byteLength) !== after.size
    ) {
      throw new ReleaseInputError(`${label} changed while reading`);
    }
    return {
      path,
      sha256: sha256(data),
      bytes: data.byteLength,
      data,
    };
  } finally {
    await descriptor.close();
  }
}

export async function digestFile(path) {
  return (await snapshotRegularFile(path)).sha256;
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ReleaseInputError(`invalid JSON: ${path}`);
    throw error;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, path);
}

export async function writeFailure(path, error, extra = {}) {
  await writeJson(path, {
    schemaVersion: 1,
    gate: "FAIL",
    reason: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

export function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export async function resolveExistingDirectory(path, label) {
  const resolved = await realpath(path);
  if (!(await stat(resolved)).isDirectory()) throw new ReleaseInputError(`${label} is not a directory`);
  return resolved;
}

export async function assertExternalPath(repo, path, label) {
  const repository = await realpath(repo);
  const candidate = resolve(path);
  const parent = await realpath(dirname(candidate));
  const resolved = resolve(parent, candidate.slice(dirname(candidate).length + 1));
  if (isInside(repository, resolved)) throw new ReleaseInputError(`${label} must be outside repository`);
  return resolved;
}

export async function assertRegularFile(path, label) {
  await snapshotRegularFile(path, label);
}

export async function run(argv, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((entry) => typeof entry !== "string")) {
    throw new ReleaseInputError("argv must be a nonempty string array");
  }
  const child = spawn(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(signal === null ? (code ?? 255) : 128));
  });
  return {
    exitCode,
    stdout: Buffer.concat(stdout),
    stderr: Buffer.concat(stderr),
  };
}

export async function git(repo, args) {
  const result = await run(["git", "-C", repo, ...args], { cwd: repo, env: process.env });
  if (result.exitCode !== 0) {
    throw new ReleaseInputError(`git ${args[0] ?? ""} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

export async function removeGuardedTemporary(path, prefix) {
  const resolved = resolve(path);
  const temporaryRoot = await realpath(dirname(resolved));
  if (!resolved.startsWith(resolve(temporaryRoot, prefix))) {
    throw new ReleaseInputError("refusing to remove unguarded temporary path");
  }
  await rm(resolved, { recursive: true, force: true });
}

export function resultGate(value) {
  if (typeof value !== "object" || value === null) return undefined;
  for (const key of ["gate", "verdict", "repositoryGate", "status"]) {
    const candidate = value[key];
    if (candidate === "PASS" || candidate === "BLOCK" || candidate === "FAIL") return candidate;
  }
  return undefined;
}

export async function mainBoundary(operation, output) {
  try {
    await operation();
  } catch (error) {
    if (output !== undefined) await writeFailure(resolve(output), error);
    if (error instanceof ReleaseInputError || error instanceof SyntaxError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
