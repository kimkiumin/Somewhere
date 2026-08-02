import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { ReleaseInputError } from "./release-core.mjs";

export async function evidenceInventory(root, excluded, prefix = "") {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const artifacts = [];
  for (const entry of entries.sort((left, right) => Buffer.compare(
    Buffer.from(left.name),
    Buffer.from(right.name),
  ))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolute = resolve(root, path);
    if (absolute === excluded) continue;
    const file = await lstat(absolute);
    if (file.isDirectory()) {
      artifacts.push(...await evidenceInventory(root, excluded, path));
    } else if (file.isFile() && !file.isSymbolicLink()) {
      const data = await readFile(absolute);
      artifacts.push({
        path,
        sha256: createHash("sha256").update(data).digest("hex"),
        bytes: data.byteLength,
      });
    } else if (file.isSymbolicLink()) {
      const target = Buffer.from(await readlink(absolute));
      const verified = await lstat(absolute);
      if (
        !verified.isSymbolicLink()
        || verified.dev !== file.dev
        || verified.ino !== file.ino
        || verified.mode !== file.mode
        || verified.size !== file.size
        || verified.mtimeMs !== file.mtimeMs
        || verified.ctimeMs !== file.ctimeMs
      ) {
        throw new ReleaseInputError(`evidence symlink changed while reading: ${path}`);
      }
      artifacts.push({
        path,
        sha256: createHash("sha256")
          .update(`symlink:${file.mode.toString(8)}:`)
          .update(target)
          .digest("hex"),
        bytes: target.byteLength,
      });
    } else {
      throw new ReleaseInputError(`unsupported evidence file type: ${path}`);
    }
  }
  return artifacts;
}

export function changedArtifacts(before, after) {
  const prior = new Map(before.map((entry) => [entry.path, entry]));
  const current = new Map(after.map((entry) => [entry.path, entry]));
  for (const [path, entry] of prior) {
    const observed = current.get(path);
    if (observed === undefined) throw new ReleaseInputError(`command removed evidence: ${path}`);
    if (observed.sha256 !== entry.sha256 || observed.bytes !== entry.bytes) {
      throw new ReleaseInputError(`command modified pre-existing evidence: ${path}`);
    }
  }
  return after.filter((entry) => !prior.has(entry.path));
}

export function verifiedPublishedArtifacts(observed, published) {
  const observedByPath = new Map(observed.map((entry) => [entry.path, entry]));
  for (const artifact of published) {
    const entry = observedByPath.get(artifact.path);
    if (
      entry === undefined
      || entry.sha256 !== artifact.sha256
      || entry.bytes !== artifact.bytes
    ) {
      throw new ReleaseInputError(`published evidence missing or changed: ${artifact.path}`);
    }
  }
  return published;
}

function safeTarget(root, path) {
  const target = resolve(root, path);
  const fromRoot = relative(root, target);
  if (
    path === ""
    || path.split("/").includes("..")
    || fromRoot === ".."
    || fromRoot.startsWith(`..${sep}`)
  ) {
    throw new ReleaseInputError(`unsafe emitted evidence path: ${path}`);
  }
  return target;
}

async function optionalStat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertSafeParents(root, target, create) {
  const fromRoot = relative(root, dirname(target));
  let current = root;
  for (const component of fromRoot === "" ? [] : fromRoot.split(sep)) {
    current = resolve(current, component);
    const stat = await optionalStat(current);
    if (stat === undefined && create) {
      await mkdir(current, { mode: 0o700 });
    } else if (stat !== undefined && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new ReleaseInputError(`unsafe evidence parent: ${current}`);
    }
  }
}

export async function publishEvidence(emittedRoot, evidenceRoot) {
  const artifacts = await evidenceInventory(emittedRoot);
  const prepared = [];
  for (const artifact of artifacts) {
    const source = safeTarget(emittedRoot, artifact.path);
    const target = safeTarget(evidenceRoot, artifact.path);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new ReleaseInputError(`emitted evidence is not a regular file: ${artifact.path}`);
    }
    await assertSafeParents(evidenceRoot, target, false);
    if (await optionalStat(target) !== undefined) {
      throw new ReleaseInputError(`evidence path already exists: ${artifact.path}`);
    }
    const data = await readFile(source);
    if (
      createHash("sha256").update(data).digest("hex") !== artifact.sha256
      || data.byteLength !== artifact.bytes
    ) {
      throw new ReleaseInputError(`emitted evidence changed while reading: ${artifact.path}`);
    }
    prepared.push({ target, data });
  }
  for (const item of prepared) {
    await assertSafeParents(evidenceRoot, item.target, true);
    await writeFile(item.target, item.data, { flag: "wx", mode: 0o600 });
  }
  return artifacts;
}
