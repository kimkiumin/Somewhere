import { realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  ReleaseInputError,
  digestFile,
  isInside,
  normalizeDigest,
  readJson,
  sha256,
} from "./release-core.mjs";

export const workspaceManifestPaths = [
  "package.json",
  "app/package.json",
  "contracts/package.json",
  "server/package.json",
];

const toolNames = ["vite", "wrangler"];

function provenanceBody(value) {
  return {
    schemaVersion: value.schemaVersion,
    bun: value.bun,
    lockfile: value.lockfile,
    workspaceManifests: value.workspaceManifests,
    tools: value.tools,
  };
}

function assertDigest(value, label) {
  try {
    normalizeDigest(value, label);
  } catch {
    throw new ReleaseInputError(`invalid build provenance: ${label}`);
  }
}

async function toolIdentity(repo, name) {
  const packagePath = `node_modules/${name}/package.json`;
  const binaryPath = `node_modules/.bin/${name}`;
  const resolvedPackage = await realpath(resolve(repo, packagePath));
  const resolvedBinary = await realpath(resolve(repo, binaryPath));
  if (!isInside(repo, resolvedPackage) || !isInside(repo, resolvedBinary)) {
    throw new ReleaseInputError(`${name} tool identity resolves outside repository`);
  }
  const packageJson = await readJson(resolvedPackage);
  if (typeof packageJson.version !== "string" || packageJson.version === "") {
    throw new ReleaseInputError(`invalid ${name} package version`);
  }
  return {
    version: packageJson.version,
    package: {
      path: packagePath,
      resolvedPath: relative(repo, resolvedPackage),
      sha256: await digestFile(resolvedPackage),
    },
    binary: {
      path: binaryPath,
      resolvedPath: relative(repo, resolvedBinary),
      sha256: await digestFile(resolvedBinary),
    },
  };
}

export async function collectBuildProvenance(repoPath) {
  const repo = resolve(repoPath);
  const body = {
    schemaVersion: 1,
    bun: { version: Bun.version },
    lockfile: { path: "bun.lock", sha256: await digestFile(resolve(repo, "bun.lock")) },
    workspaceManifests: await Promise.all(workspaceManifestPaths.map(async (path) => ({
      path,
      sha256: await digestFile(resolve(repo, path)),
    }))),
    tools: {
      vite: await toolIdentity(repo, "vite"),
      wrangler: await toolIdentity(repo, "wrangler"),
    },
  };
  return { ...body, digest: sha256(JSON.stringify(body)) };
}

export function validateBuildProvenance(value) {
  if (
    value?.schemaVersion !== 1
    || typeof value.bun?.version !== "string"
    || value.bun.version === ""
    || value.lockfile?.path !== "bun.lock"
    || !Array.isArray(value.workspaceManifests)
    || JSON.stringify(value.workspaceManifests.map((entry) => entry?.path))
      !== JSON.stringify(workspaceManifestPaths)
    || Object.keys(value.tools ?? {}).sort().join(",") !== toolNames.join(",")
  ) {
    throw new ReleaseInputError("invalid build provenance");
  }
  assertDigest(value.lockfile.sha256, "lockfile digest");
  for (const manifest of value.workspaceManifests) {
    assertDigest(manifest.sha256, `workspace manifest ${manifest.path}`);
  }
  for (const name of toolNames) {
    const tool = value.tools[name];
    if (
      typeof tool?.version !== "string"
      || tool.version === ""
      || tool.package?.path !== `node_modules/${name}/package.json`
      || typeof tool.package.resolvedPath !== "string"
      || tool.package.resolvedPath === ""
      || tool.binary?.path !== `node_modules/.bin/${name}`
      || typeof tool.binary.resolvedPath !== "string"
      || tool.binary.resolvedPath === ""
    ) {
      throw new ReleaseInputError("invalid build provenance");
    }
    assertDigest(tool.package.sha256, `${name} package digest`);
    assertDigest(tool.binary.sha256, `${name} binary digest`);
  }
  assertDigest(value.digest, "build provenance digest");
  if (value.digest !== sha256(JSON.stringify(provenanceBody(value)))) {
    throw new ReleaseInputError("build provenance digest mismatch");
  }
  return value;
}
