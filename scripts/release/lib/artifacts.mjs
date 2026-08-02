import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { digestFile, sha256 } from "./release-core.mjs";

export async function files(directory, prefix = "") {
  const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((left, right) => (
    Buffer.compare(Buffer.from(left.name), Buffer.from(right.name))
  ))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(directory, path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export async function artifact(root, path, kind) {
  const absolute = resolve(root, path);
  return {
    path,
    sha256: await digestFile(absolute),
    bytes: (await stat(absolute)).size,
    kind,
  };
}

export function artifactDigest(artifacts) {
  return sha256(artifacts.map((entry) => `${entry.sha256}\t${entry.bytes}\t${entry.path}\0`).join(""));
}

export function artifactKind(path) {
  if (path.startsWith("prepared/build/app/dist/")) return "app-asset";
  if (path.includes("worker") && /\.(js|mjs)$/.test(path)) return "worker-bundle";
  if (/manifest.*\.json$/.test(path)) return "asset-manifest";
  return "build-support";
}
