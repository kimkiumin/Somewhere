import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  ReleaseInputError,
  isInside,
  normalizeDigest,
  snapshotRegularFile,
} from "./release-core.mjs";

const maximumBindings = 512;
const companionName = /(?:evidence|envelope|manifest|receipt|sha256|sums|inventory|scenario|handoff|summary|verdict)/iu;
const pathKey = /(?:artifact|evidence|log|manifest|output|raw|receipt|report|transcript)(?:Path|Paths)?$/iu;

function fail(message) {
  throw new ReleaseInputError(message);
}

function cleanToken(value) {
  return value
    .trim()
    .replace(/^["'(<[]+/u, "")
    .replace(/["')>\],.;:]+$/u, "");
}

function fileLike(value) {
  return value !== ""
    && !value.includes("\0")
    && !/\s/u.test(value)
    && !/^(?:https?:|sha256:)/u.test(value)
    && (value.includes("/") || /\.[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value));
}

async function regularFileStatus(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) return "symlink";
    return stat.isFile() ? "regular" : "nonfile";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "missing";
    throw error;
  }
}

function textReferences(data) {
  const references = [];
  for (const line of data.toString().split(/\r?\n/u)) {
    const checksum = /^([a-f0-9]{64})\s{1,2}\*?(.+)$/u.exec(line);
    if (checksum !== null) {
      references.push({ value: cleanToken(checksum[2]), sha256: checksum[1] });
    }
    if (/\bARTIFACTS?\b|Captured artifacts?|evidence index/iu.test(line)) {
      const absolute = line.match(/\/(?:home|tmp|var)\/[A-Za-z0-9_./-]+/gu) ?? [];
      references.push(...absolute.map((value) => ({ value: cleanToken(value) })));
      const relative = line.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9_.-]+/gu) ?? [];
      references.push(...relative.map((value) => ({ value: cleanToken(value) })));
    }
    for (const match of line.matchAll(/`([^`\r\n]+)`/gu)) {
      const value = cleanToken(match[1]);
      if (fileLike(value)) references.push({ value });
    }
  }
  return references;
}

function jsonReferences(value, key = "", references = []) {
  if (Array.isArray(value)) {
    for (const item of value) jsonReferences(item, key, references);
    return references;
  }
  if (value === null || typeof value !== "object") return references;
  if (
    typeof value.path === "string"
    && typeof value.sha256 === "string"
    && fileLike(cleanToken(value.path))
  ) {
    references.push({
      value: cleanToken(value.path),
      sha256: value.sha256,
      bytes: Number.isInteger(value.bytes) ? value.bytes : undefined,
    });
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (typeof child === "string" && pathKey.test(childKey)) {
      const token = cleanToken(child);
      if (fileLike(token)) references.push({ value: token });
    } else {
      jsonReferences(child, childKey, references);
    }
  }
  return references;
}

async function references(snapshot) {
  try {
    return jsonReferences(JSON.parse(snapshot.data.toString()));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return textReferences(snapshot.data);
  }
}

function taskRootFor(anchor, evidenceRoot) {
  const fromEvidence = relative(evidenceRoot, anchor);
  if (fromEvidence === "" || fromEvidence === ".." || fromEvidence.startsWith(`..${sep}`)) {
    return undefined;
  }
  const first = fromEvidence.split(sep)[0];
  return /^(?:baseline|task-[0-9]+)$/u.test(first) ? resolve(evidenceRoot, first) : undefined;
}

async function resolveReference(value, anchor, taskRoot, evidenceRoot) {
  const token = cleanToken(value);
  const candidates = isAbsolute(token)
    ? [resolve(token)]
    : [resolve(dirname(anchor), token), resolve(taskRoot ?? evidenceRoot, token), resolve(evidenceRoot, token)];
  for (const candidate of candidates) {
    if (!isInside(evidenceRoot, candidate)) continue;
    const status = await regularFileStatus(candidate);
    if (status === "missing" || status === "nonfile") continue;
    if (status === "symlink") fail(`plan review reference must not be a symbolic link: ${token}`);
    const canonical = await realpath(candidate);
    if (canonical !== candidate) fail(`plan review reference is not canonical: ${token}`);
    return canonical;
  }
  return undefined;
}

export async function collectPlanReviewBindings({ anchors, evidenceRoot, repo }) {
  const canonicalEvidence = await realpath(evidenceRoot);
  await realpath(repo);
  const queue = [];
  const queued = new Set();
  const bindings = new Map();

  function enqueue(path, expand, expected) {
    const normalizedExpected = expected === undefined ? undefined : normalizeDigest(expected);
    const existing = bindings.get(path);
    if (existing !== undefined && normalizedExpected !== undefined && existing.expected !== undefined && existing.expected !== normalizedExpected) {
      fail(`conflicting plan review digest: ${path}`);
    }
    if (existing === undefined) bindings.set(path, { expected: normalizedExpected });
    else if (existing.expected === undefined && normalizedExpected !== undefined) existing.expected = normalizedExpected;
    const key = `${path}\0${expand ? "expand" : "leaf"}`;
    if (!queued.has(key)) {
      queued.add(key);
      queue.push({ path, expand });
    }
  }

  for (const anchor of anchors) {
    const canonical = await realpath(anchor);
    enqueue(canonical, true);
  }

  for (let index = 0; index < queue.length; index += 1) {
    if (bindings.size > maximumBindings) fail("plan review bindings exceed the bounded maximum");
    const item = queue[index];
    const snapshot = await snapshotRegularFile(item.path, "plan review evidence");
    const binding = bindings.get(item.path);
    if (binding.expected !== undefined && snapshot.sha256 !== normalizeDigest(binding.expected)) {
      fail(`plan review evidence digest mismatch: ${item.path}`);
    }
    binding.snapshot = snapshot;
    if (!item.expand) continue;
    const taskRoot = taskRootFor(item.path, canonicalEvidence);
    for (const reference of await references(snapshot)) {
      const path = await resolveReference(
        reference.value,
        item.path,
        taskRoot,
        canonicalEvidence,
      );
      if (path === undefined) continue;
      enqueue(path, companionName.test(basename(path)), reference.sha256);
      if (reference.bytes !== undefined) {
        const observed = await lstat(path);
        if (observed.size !== reference.bytes) fail(`plan review evidence size mismatch: ${path}`);
      }
    }
  }

  return [...bindings.entries()].map(([path, binding]) => ({
    path,
    sha256: binding.snapshot.sha256,
  }));
}
