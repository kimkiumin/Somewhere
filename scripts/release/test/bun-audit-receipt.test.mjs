import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
} from "./release-testkit.mjs";

const script = resolve(import.meta.dir, "../run-bun-audit.mjs");

function git(repo, args) {
  const result = run(repo, ["git", ...args]);
  if (result.exitCode !== 0) throw new TypeError(result.stderr.toString());
  return result.stdout.toString().trim();
}

async function fixture(root, auditExit) {
  const repo = resolve(root, "repo");
  const bin = resolve(root, "bin");
  await mkdir(repo);
  await mkdir(bin);
  await writeFile(resolve(repo, "bun.lock"), "lockfile fixture\n");
  await writeFile(resolve(repo, "package.json"), JSON.stringify({
    name: "audit-fixture",
    private: true,
    workspaces: ["app", "contracts", "server"],
  }));
  for (const workspace of ["app", "contracts", "server"]) {
    await mkdir(resolve(repo, workspace));
    await writeFile(resolve(repo, workspace, "package.json"), JSON.stringify({
      name: `audit-fixture-${workspace}`,
      dependencies: workspace === "app" ? { zod: "4.4.3" } : {},
      private: true,
    }));
  }
  const fakeBun = resolve(bin, "bun");
  await writeFile(fakeBun, `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then printf '1.3.14-fixture\\n'; exit 0; fi
if [[ "\${1:-}" == "pm" && "\${2:-}" == "ls" ]]; then
  if [[ -n "\${AUDIT_ZERO_SCOPE:-}" ]]; then printf 'fixture node_modules\\n'; exit 0; fi
  printf 'fixture node_modules\\n└── zod@4.4.3\\n'
  exit 0
fi
if [[ -n "\${AUDIT_REQUIRE_MANIFEST:-}" ]]; then
  if [[ ! -w package.json || ! -f app/package.json || ! -f contracts/package.json || ! -f server/package.json ]]; then
    printf 'missing exact workspace audit package manifest\\n' >&2
    exit 1
  fi
fi
if [[ -n "\${AUDIT_REMOVE_WORKSPACE_MANIFEST:-}" ]]; then rm app/package.json; fi
if [[ -n "\${AUDIT_CHANGE_WORKSPACE_MANIFEST:-}" ]]; then printf '{}\\n' > app/package.json; fi
if [[ -n "\${AUDIT_CHANGE_SNAPSHOT_LOCKFILE:-}" ]]; then
  chmod 600 bun.lock
  printf 'changed lockfile\\n' > bun.lock
fi
if [[ -n "\${AUDIT_ORIGINAL_LOCKFILE:-}" ]]; then
  printf 'substituted lockfile\\n' > "\${AUDIT_ORIGINAL_LOCKFILE}"
  audited_lockfile="$(tr -d '\\n' < bun.lock)"
  printf 'lockfile fixture\\n' > "\${AUDIT_ORIGINAL_LOCKFILE}"
  printf '{"advisories":[],"auditedLockfile":"%s"}\\n' "\${audited_lockfile}"
  exit ${auditExit}
fi
printf '{"advisories":[]}\\n'
exit ${auditExit}
`);
  await chmod(fakeBun, 0o755);
  git(repo, ["init", "--quiet"]);
  git(repo, ["add", "."]);
  git(repo, [
    "-c", "user.name=Somewhere Test",
    "-c", "user.email=test@somewhere.invalid",
    "commit", "--quiet", "-m", "fixture",
  ]);
  return {
    repo,
    bin,
    sha: git(repo, ["rev-parse", "HEAD"]),
    tree: git(repo, ["rev-parse", "HEAD^{tree}"]),
  };
}

function execute(root, source, environment = {}) {
  return run(source.repo, [
    process.execPath,
    script,
    "--sha", source.sha,
    "--source-tree", source.tree,
    "--lockfile", "bun.lock",
    "--raw", resolve(root, "bun-audit-raw.json"),
    "--output", resolve(root, "bun-audit.json"),
  ], { PATH: `${source.bin}:${process.env.PATH}`, ...environment });
}

describe("Exact Bun audit receipt", () => {
  test("binds a successful audit to SHA, tree, tool, lockfile, and raw output", async () => {
    // Given: an exact committed fixture whose audit tool reports no advisories.
    const root = await temporaryDirectory("bun-audit-pass");
    try {
      const source = await fixture(root, 0);

      // When: the exact audit wrapper executes.
      const result = execute(root, source);

      // Then: a structured PASS receipt binds every review dependency.
      expect(result.exitCode).toBe(0);
      const receipt = await readJson(resolve(root, "bun-audit.json"));
      expect(receipt).toMatchObject({
        gate: "PASS",
        finalSha: source.sha,
        sourceTree: source.tree,
        tool: { binary: "bun", version: "1.3.14-fixture" },
        command: { exitCode: 0 },
        rawAudit: { advisories: [] },
        auditScope: {
          resolvedDependencyCount: 1,
          workspaceManifestCount: 4,
        },
      });
      expect(receipt.auditScope.manifests.map((manifest) => manifest.path)).toEqual([
        resolve(source.repo, "package.json"),
        resolve(source.repo, "app/package.json"),
        resolve(source.repo, "contracts/package.json"),
        resolve(source.repo, "server/package.json"),
      ]);
      expect(receipt.auditScope.manifests.every((manifest) =>
        /^sha256:[a-f0-9]{64}$/u.test(manifest.sha256))).toBe(true);
      expect(receipt.auditScope.lockfileSha256).toBe(receipt.lockfile.sha256);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("preserves a failing audit exit instead of manufacturing PASS", async () => {
    // Given: an exact committed fixture whose audit tool exits nonzero.
    const root = await temporaryDirectory("bun-audit-fail");
    try {
      const source = await fixture(root, 1);

      // When: the exact audit wrapper executes.
      const result = execute(root, source);

      // Then: the process and structured receipt both remain failed.
      expect(result.exitCode).toBe(1);
      expect(await readJson(resolve(root, "bun-audit.json"))).toMatchObject({
        gate: "FAIL",
        command: { exitCode: 1 },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("audits an immutable snapshot when the repository lockfile is replaced and restored", async () => {
    // Given: a hostile concurrent writer that swaps the repository lockfile during `bun audit`.
    const root = await temporaryDirectory("bun-audit-snapshot");
    try {
      const source = await fixture(root, 0);

      // When: the audit tool reads its lockfile while the repository pathname is being swapped.
      const result = execute(root, source, {
        AUDIT_ORIGINAL_LOCKFILE: resolve(source.repo, "bun.lock"),
      });

      // Then: the audited content is the exact initial snapshot, not the transient replacement.
      expect(result.exitCode).toBe(0);
      expect(await readJson(resolve(root, "bun-audit.json"))).toMatchObject({
        gate: "PASS",
        rawAudit: { auditedLockfile: "lockfile fixture" },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("provides Bun the exact workspace manifests inside the audit snapshot", async () => {
    // Given: Bun refuses to audit a workspace lockfile without all neighboring package manifests.
    const root = await temporaryDirectory("bun-audit-manifest");
    try {
      const source = await fixture(root, 0);

      // When: the exact audit wrapper runs in its isolated snapshot directory.
      const result = execute(root, source, { AUDIT_REQUIRE_MANIFEST: "1" });

      // Then: Bun receives every exact manifest and audits a nonempty dependency scope.
      expect(result.exitCode).toBe(0);
      expect(await readJson(resolve(root, "bun-audit.json"))).toMatchObject({
        auditScope: {
          resolvedDependencyCount: 1,
          workspaceManifestCount: 4,
        },
        gate: "PASS",
        rawAudit: { advisories: [] },
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  for (const [name, environment] of [
    ["omitted workspace manifest", { AUDIT_REMOVE_WORKSPACE_MANIFEST: "1" }],
    ["changed workspace manifest", { AUDIT_CHANGE_WORKSPACE_MANIFEST: "1" }],
    ["changed snapshot lockfile", { AUDIT_CHANGE_SNAPSHOT_LOCKFILE: "1" }],
    ["zero dependency scope", { AUDIT_ZERO_SCOPE: "1" }],
  ]) {
    test(`rejects ${name}`, async () => {
      // Given: the isolated audit scope is incomplete or changes during execution.
      const root = await temporaryDirectory("bun-audit-scope-reject");
      try {
        const source = await fixture(root, 0);

        // When: the audit wrapper observes the invalid scope.
        const result = execute(root, source, environment);

        // Then: the wrapper fails instead of issuing an audit PASS.
        expect(result.exitCode).not.toBe(0);
      } finally {
        await removeTemporaryDirectory(root);
      }
    });
  }
});
