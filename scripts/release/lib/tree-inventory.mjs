import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { ReleaseInputError, isInside, sha256 } from "./release-core.mjs";

function compareBytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export async function inventory(directory, prefix = "") {
  const root = await realpath(directory);
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((left, right) => compareBytes(left.name, right.name))) {
    if (prefix === "" && entry.name === "node_modules") continue;
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolute = resolve(root, path);
    const fileStat = await lstat(absolute);
    if (fileStat.isSymbolicLink()) {
      const target = await realpath(absolute);
      if (!isInside(root, target)) throw new ReleaseInputError(`symlink escapes tree: ${path}`);
      const bytes = Buffer.from(await readlink(absolute));
      found.push({ path, mode: "120000", blob: gitBlob(bytes), bytes: bytes.length });
    } else if (fileStat.isDirectory()) {
      found.push(...await inventory(root, path));
    } else if (fileStat.isFile()) {
      const bytes = await readFile(absolute);
      found.push({
        path,
        mode: (fileStat.mode & 0o111) === 0 ? "100644" : "100755",
        blob: gitBlob(bytes),
        bytes: bytes.length,
      });
    } else {
      throw new ReleaseInputError(`unsupported tree entry: ${path}`);
    }
  }
  return found.sort((left, right) => compareBytes(left.path, right.path));
}

function gitBlob(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export function parseGitTree(output) {
  return output.split("\0").filter(Boolean).map((entry) => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (match === null) throw new ReleaseInputError("unsupported Git tree entry");
    return { mode: match[1], blob: match[2], path: match[3] };
  }).sort((left, right) => compareBytes(left.path, right.path));
}

export function assertSameTree(expected, actual) {
  if (
    expected.length !== actual.length
    || expected.some((entry, index) => {
      const observed = actual[index];
      return observed === undefined
        || observed.path !== entry.path
        || observed.mode !== entry.mode
        || observed.blob !== entry.blob;
    })
  ) {
    throw new ReleaseInputError("materialized tree inventory mismatch");
  }
}

export function inventoryDigest(entries) {
  return sha256(entries.map((entry) => `${entry.mode} ${entry.blob}\t${entry.path}\0`).join(""));
}
