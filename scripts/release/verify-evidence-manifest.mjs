import { dirname, resolve, sep } from "node:path";
import { lstat } from "node:fs/promises";
import {
  digestFile,
  mainBoundary,
  parseArguments,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--manifest", "--scope", "--output"],
};

async function verify(options) {
  const manifest = resolve(options.manifest);
  const root = dirname(manifest);
  const lines = (await Bun.file(manifest).text()).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new TypeError("manifest is empty");
  const paths = new Set();
  const artifacts = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^\0\r\n]+)$/.exec(line);
    if (match === null) throw new TypeError("invalid manifest line");
    const relativePath = match[2];
    if (relativePath.startsWith("/") || relativePath.split("/").includes("..") || paths.has(relativePath)) {
      throw new TypeError("duplicate or unsafe manifest path");
    }
    paths.add(relativePath);
    const absolutePath = resolve(root, relativePath);
    if (!(absolutePath === root || absolutePath.startsWith(`${root}${sep}`))) {
      throw new TypeError("manifest path escapes root");
    }
    const file = await lstat(absolutePath);
    if (!file.isFile() || file.isSymbolicLink()) throw new TypeError(`manifest entry is not a regular file: ${relativePath}`);
    const observed = (await digestFile(absolutePath)).slice(7);
    if (observed !== match[1]) throw new TypeError(`manifest digest mismatch: ${relativePath}`);
    artifacts.push({ path: relativePath, sha256: `sha256:${observed}`, bytes: file.size });
  }
  await writeJson(resolve(options.output), {
    schemaVersion: 1,
    gate: "PASS",
    scope: options.scope,
    manifest,
    artifactCount: artifacts.length,
    artifacts,
  });
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => verify(parsed), parsed.output);
