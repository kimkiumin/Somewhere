import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import {
  assertExternalPath,
  assertHex,
  git,
  mainBoundary,
  parseArguments,
  run,
  sha256,
  snapshotRegularFile,
  writeJson,
} from "./lib/release-core.mjs";

const specification = {
  required: ["--sha", "--source-tree", "--lockfile", "--raw", "--output"],
};

async function assertSourceIdentity(repo, sha, sourceTree) {
  if (
    await git(repo, ["rev-parse", "HEAD"]) !== sha
    || await git(repo, ["rev-parse", "HEAD^{tree}"]) !== sourceTree
    || await git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]) !== ""
  ) {
    throw new TypeError("audit source identity is not the clean exact commit");
  }
}

function workspaceManifestPaths(rootManifest) {
  const parsed = JSON.parse(rootManifest.data.toString());
  if (
    !Array.isArray(parsed.workspaces)
    || parsed.workspaces.length === 0
    || parsed.workspaces.some((path) =>
      typeof path !== "string"
      || !/^[a-z0-9][a-z0-9/-]*$/u.test(path)
      || path.includes(".."))
  ) {
    throw new TypeError("audit root manifest has unsupported workspaces");
  }
  return ["package.json", ...parsed.workspaces.map((path) => `${path}/package.json`)];
}

function resolvedDependencyCount(stdout) {
  return stdout
    .toString()
    .split("\n")
    .filter((line) => /^[│ ]*[├└]── /u.test(line))
    .length;
}

async function execute(options) {
  const repo = resolve(".");
  const finalSha = assertHex(options.sha, 40, "sha");
  const sourceTree = assertHex(options["source-tree"], 40, "source-tree");
  const raw = await assertExternalPath(repo, options.raw, "raw audit");
  const output = await assertExternalPath(repo, options.output, "audit receipt");
  const lockfile = await snapshotRegularFile(resolve(options.lockfile), "audit lockfile");
  const rootManifest = await snapshotRegularFile(resolve("package.json"), "audit root manifest");
  const manifests = await Promise.all(
    workspaceManifestPaths(rootManifest).map((path) =>
      snapshotRegularFile(resolve(path), `audit manifest ${path}`)),
  );
  await assertSourceIdentity(repo, finalSha, sourceTree);
  const auditRoot = await mkdtemp(join(tmpdir(), "somewhere-bun-audit-"));
  let observed;
  let scope;
  let version;
  try {
    await writeFile(resolve(auditRoot, "bun.lock"), lockfile.data, {
      flag: "wx",
      mode: 0o444,
    });
    for (const manifest of manifests) {
      const destination = resolve(auditRoot, relative(repo, manifest.path));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, manifest.data, { flag: "wx", mode: 0o600 });
    }
    [observed, version] = await Promise.all([
      run(["bun", "audit", "--json"], { cwd: auditRoot, env: process.env }),
      run(["bun", "--version"], { cwd: repo, env: process.env }),
    ]);
    scope = await run(["bun", "pm", "ls", "--all"], { cwd: auditRoot, env: process.env });
    const snapshotLockfile = await snapshotRegularFile(
      resolve(auditRoot, "bun.lock"),
      "audit snapshot lockfile",
    );
    if (snapshotLockfile.sha256 !== lockfile.sha256) {
      throw new TypeError("audit snapshot lockfile changed during execution");
    }
    for (const manifest of manifests) {
      const snapshotManifest = await snapshotRegularFile(
        resolve(auditRoot, relative(repo, manifest.path)),
        "audit snapshot manifest",
      );
      if (snapshotManifest.sha256 !== manifest.sha256) {
        throw new TypeError("audit snapshot manifest changed during execution");
      }
    }
  } finally {
    await rm(auditRoot, { recursive: true, force: true });
  }
  if (version.exitCode !== 0) throw new TypeError("bun version unavailable");
  const dependencyCount = resolvedDependencyCount(scope.stdout);
  if (scope.exitCode !== 0 || dependencyCount === 0) {
    throw new TypeError("bun audit resolved no dependency scope");
  }
  await writeFile(raw, observed.stdout);
  const rawAudit = JSON.parse(observed.stdout.toString());
  await assertSourceIdentity(repo, finalSha, sourceTree);
  const currentLockfile = await snapshotRegularFile(lockfile.path, "audit lockfile");
  if (currentLockfile.sha256 !== lockfile.sha256) {
    throw new TypeError("audit lockfile changed during execution");
  }
  const rawSha256 = sha256(observed.stdout);
  await writeJson(output, {
    schemaVersion: 1,
    gate: observed.exitCode === 0 ? "PASS" : "FAIL",
    finalSha,
    sourceTree,
    tool: { binary: "bun", version: version.stdout.toString().trim() },
    lockfile: { path: lockfile.path, sha256: lockfile.sha256, bytes: lockfile.bytes },
    command: {
      argv: ["bun", "audit", "--json"],
      exitCode: observed.exitCode,
      stdoutSha256: rawSha256,
      stderrSha256: sha256(observed.stderr),
    },
    auditScope: {
      command: {
        argv: ["bun", "pm", "ls", "--all"],
        exitCode: scope.exitCode,
        stdoutSha256: sha256(scope.stdout),
        stderrSha256: sha256(scope.stderr),
      },
      resolvedDependencyCount: dependencyCount,
      workspaceManifestCount: manifests.length,
      manifests: manifests.map((manifest) => ({
        path: manifest.path,
        sha256: manifest.sha256,
        bytes: manifest.bytes,
      })),
      lockfileSha256: lockfile.sha256,
    },
    raw: { path: raw, sha256: rawSha256, bytes: observed.stdout.length },
    rawAudit,
    reviewBindings: [
      { path: raw, sha256: rawSha256 },
      { path: lockfile.path, sha256: lockfile.sha256 },
    ],
  });
  if (observed.exitCode !== 0) process.exitCode = observed.exitCode;
}

const parsed = parseArguments(process.argv.slice(2), specification);
await mainBoundary(() => execute(parsed), parsed.output);
