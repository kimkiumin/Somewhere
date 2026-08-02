import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ReleaseInputError } from "./release-core.mjs";

async function regularFileDigest(path, label) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new ReleaseInputError(`${label} must be a regular file`);
  }
  const data = await readFile(path);
  const after = await lstat(path);
  if (
    !after.isFile()
    || after.isSymbolicLink()
    || after.dev !== before.dev
    || after.ino !== before.ino
    || after.mode !== before.mode
    || after.size !== before.size
    || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs
  ) {
    throw new ReleaseInputError(`${label} changed while reading`);
  }
  return createHash("sha256").update(data).digest("hex");
}

function declaredWorkspaces(manifest) {
  const workspaces = manifest.workspaces;
  if (
    !Array.isArray(workspaces)
    || workspaces.length === 0
    || new Set(workspaces).size !== workspaces.length
    || workspaces.some((path) => (
      typeof path !== "string" || !/^[a-z0-9][a-z0-9._-]*$/u.test(path)
    ))
  ) {
    throw new ReleaseInputError("dependency workspaces must be unique top-level paths");
  }
  return workspaces;
}

async function installedWorkspaces(root) {
  const installed = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const modules = await lstat(resolve(root, entry.name, "node_modules"));
      if (modules.isDirectory() && !modules.isSymbolicLink()) installed.push(entry.name);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return installed.sort();
}

export async function prepareDependencyLayer(source, dependencyRoot, layer) {
  const dependencyWorkspace = dirname(dependencyRoot);
  const manifest = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
  const workspaces = declaredWorkspaces(manifest);
  if (
    JSON.stringify(await installedWorkspaces(dependencyWorkspace))
    !== JSON.stringify([...workspaces].sort())
  ) {
    throw new ReleaseInputError("installed dependency workspaces do not match the manifest");
  }
  const rootModules = await lstat(dependencyRoot);
  if (!rootModules.isDirectory() || rootModules.isSymbolicLink()) {
    throw new ReleaseInputError("dependency root must be a regular directory");
  }
  const sourceLock = await regularFileDigest(resolve(source, "bun.lock"), "source lockfile");
  const dependencyLock = await regularFileDigest(
    resolve(dependencyWorkspace, "bun.lock"),
    "dependency lockfile",
  );
  if (sourceLock !== dependencyLock) throw new ReleaseInputError("dependency lockfile mismatch");
  await mkdir(resolve(layer, "node_modules/.vite-temp"), { recursive: true });
  for (const workspace of workspaces) {
    const sourceWorkspace = await lstat(resolve(source, workspace));
    if (!sourceWorkspace.isDirectory() || sourceWorkspace.isSymbolicLink()) {
      throw new ReleaseInputError(`source workspace is unsafe: ${workspace}`);
    }
    await mkdir(resolve(layer, workspace, "node_modules/.vite-temp"), { recursive: true });
  }
  const paths = ["node_modules", ...workspaces.map((path) => `${path}/node_modules`)];
  const ephemeralWorkPaths = workspaces.includes("server") ? ["server/.wrangler"] : [];
  for (const path of ephemeralWorkPaths) await mkdir(resolve(layer, path), { recursive: true });
  return {
    root: dependencyRoot,
    lockfileSha256: `sha256:${sourceLock}`,
    paths,
    readOnly: true,
    ephemeralCachePaths: paths.map((path) => `${path}/.vite-temp`),
    ephemeralWorkPaths,
  };
}
