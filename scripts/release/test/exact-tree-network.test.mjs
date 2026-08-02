import { describe, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import {
  changedArtifacts,
  evidenceInventory,
  runExactCommand,
} from "../lib/exact-command-boundary.mjs";
import { verifiedPublishedArtifacts } from "../lib/exact-evidence-boundary.mjs";
import { hasSuccessfulExternalConnect } from "../lib/exact-sandbox-boundary.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
} from "./release-testkit.mjs";

const somewhere = resolve(import.meta.dir, "../../..");

describe("Exact-tree offline boundary", () => {
  test("attributes only privately published artifacts despite concurrent public evidence", async () => {
    const root = await temporaryDirectory("exact-tree-concurrent-evidence");
    try {
      const source = resolve(root, "source");
      const evidence = resolve(root, "evidence");
      await mkdir(source);
      await mkdir(resolve(evidence, "task-20"), { recursive: true });
      const before = await evidenceInventory(evidence);
      const concurrentWrite = new Promise((complete, reject) => {
        setTimeout(() => {
          writeFile(resolve(evidence, "task-20/manual-qa.md"), "unrelated\n")
            .then(complete, reject);
        }, 30);
      });
      const boundary = await runExactCommand(
        [
          "/bin/sh",
          "-c",
          "sleep 0.15; mkdir -p \"$SOMEWHERE_EVIDENCE_ROOT/task-20\"; printf 'owned\\n' > \"$SOMEWHERE_EVIDENCE_ROOT/task-20/owned.txt\"",
        ],
        source,
        evidence,
        undefined,
        "a".repeat(40),
        "deny",
        "GREEN_ZERO",
      );
      await concurrentWrite;
      const observed = changedArtifacts(before, await evidenceInventory(evidence));

      expect(observed.map((entry) => entry.path).sort()).toEqual([
        "task-20/manual-qa.md",
        "task-20/owned.txt",
      ]);
      expect(verifiedPublishedArtifacts(observed, boundary.artifacts))
        .toEqual(boundary.artifacts);
      expect(boundary.artifacts.map((entry) => entry.path)).toEqual(["task-20/owned.txt"]);
      expect(() => verifiedPublishedArtifacts(
        observed.filter((entry) => entry.path !== "task-20/owned.txt"),
        boundary.artifacts,
      )).toThrow("published evidence missing or changed: task-20/owned.txt");
      expect(() => verifiedPublishedArtifacts(
        observed.map((entry) => entry.path === "task-20/owned.txt"
          ? { ...entry, sha256: "c".repeat(64) }
          : entry),
        boundary.artifacts,
      )).toThrow("published evidence missing or changed: task-20/owned.txt");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("allows successful loopback IPC but identifies successful external connects", () => {
    expect(hasSuccessfulExternalConnect([
      '1 connect(4, {sa_family=AF_INET, sin_port=htons(8787), sin_addr=inet_addr("127.0.0.1")}, 16) = 0',
      '2 connect(5, {sa_family=AF_INET6, sin6_port=htons(8787), inet_pton(AF_INET6, "::1", &sin6_addr)}, 28) = 0',
    ].join("\n"))).toBe(false);
    expect(hasSuccessfulExternalConnect(
      '3 connect(6, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("1.1.1.1")}, 16) = 0',
    )).toBe(true);
  });

  test("inventories shared-root symlinks without dereferencing escape targets", async () => {
    const root = await temporaryDirectory("exact-tree-symlink");
    try {
      const evidence = resolve(root, "evidence");
      const outside = resolve(root, "outside");
      const link = resolve(evidence, "prior-task/dependency");
      await mkdir(resolve(evidence, "prior-task"), { recursive: true });
      await writeFile(outside, "first secret");
      await symlink(outside, link);

      const before = await evidenceInventory(evidence);
      await writeFile(outside, "changed secret with different bytes");
      expect(await evidenceInventory(evidence)).toEqual(before);

      await unlink(link);
      await symlink("/different/escape/target", link);
      expect(await evidenceInventory(evidence)).not.toEqual(before);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("isolates network, credentials, caches, and hashes emitted evidence", async () => {
    const root = await mkdtemp("/var/tmp/somewhere-exact-tree-network.");
    try {
      const repo = resolve(root, "repo");
      const source = resolve(root, "source");
      const evidence = resolve(root, "evidence");
      const ambientHome = resolve(root, "ambient-home");
      const hostSecret = resolve(root, "host-secret");
      const dependencies = resolve(root, "dependencies");
      await mkdir(repo);
      await mkdir(evidence);
      await mkdir(resolve(repo, "app"), { recursive: true });
      await mkdir(resolve(repo, "server"), { recursive: true });
      await mkdir(resolve(dependencies, "node_modules"), { recursive: true });
      await mkdir(resolve(dependencies, "app/node_modules"), { recursive: true });
      await mkdir(resolve(dependencies, "server/node_modules"), { recursive: true });
      await writeFile(resolve(dependencies, "node_modules/root-marker"), "root");
      await writeFile(resolve(dependencies, "app/node_modules/workspace-marker"), "workspace");
      await writeFile(resolve(dependencies, "server/node_modules/server-marker"), "server");
      await writeFile(resolve(repo, "app/source-marker"), "source");
      await writeFile(resolve(repo, "server/source-marker"), "source");
      await writeFile(resolve(repo, "package.json"), '{"workspaces":["app","server"]}\n');
      await writeFile(resolve(repo, "bun.lock"), "bound-lockfile\n");
      await writeFile(resolve(dependencies, "bun.lock"), "bound-lockfile\n");
      await mkdir(resolve(ambientHome, ".wrangler"), { recursive: true });
      await writeFile(resolve(ambientHome, ".wrangler/credential-marker"), "ambient");
      await writeFile(hostSecret, "host-only secret");
      await mkdir(resolve(evidence, "prior-task"), { recursive: true });
      await writeFile(resolve(evidence, "prior-task/proof.txt"), "immutable prior proof");
      await writeFile(resolve(repo, "probe.sh"), [
        "#!/bin/sh",
        "set -eu",
        "test -z \"${CLOUDFLARE_API_TOKEN+x}\" || exit 81",
        "test ! -e \"$HOME/.wrangler/credential-marker\" || exit 82",
        `test ! -e "${hostSecret}" || exit 83`,
        "test ! -e \"$SOMEWHERE_EVIDENCE_ROOT/prior-task/proof.txt\" || exit 84",
        "test -f node_modules/root-marker || exit 85",
        "test -f app/node_modules/workspace-marker || exit 86",
        `test ! -r "/proc/${process.pid}/environ" || exit 87`,
        "touch app/node_modules/.vite-temp/ephemeral-probe",
        "touch server/.wrangler/ephemeral-probe",
        "if touch app/node_modules/writable-probe 2>/dev/null; then exit 92; fi",
        "if curl --connect-timeout 1 --max-time 1 https://1.1.1.1 >/dev/null 2>&1; then exit 91; fi",
        "probe_temp=$(mktemp -d -t somewhere-v2-ci.XXXXXXXX)",
        "case \"$probe_temp\" in /tmp/somewhere-v2-ci.*) ;; *) exit 93 ;; esac",
        "rmdir \"$probe_temp\"",
        "mkdir -p \"$SOMEWHERE_EVIDENCE_ROOT/task-20\"",
        "printf 'offline\\n' > \"$SOMEWHERE_EVIDENCE_ROOT/task-20/probe.txt\"",
        "printf '%s\\n' \"$HOME\" > \"$SOMEWHERE_EVIDENCE_ROOT/task-20/home.txt\"",
        "printf '%s\\n' \"$probe_temp\" > \"$SOMEWHERE_EVIDENCE_ROOT/task-20/tmp.txt\"",
      ].join("\n"));
      expect(run(repo, ["git", "init", "-q"]).exitCode).toBe(0);
      expect(run(repo, ["git", "add", "."]).exitCode).toBe(0);
      expect(run(repo, [
        "git",
        "-c",
        "user.name=Somewhere Test",
        "-c",
        "user.email=test@somewhere.invalid",
        "commit",
        "-qm",
        "fixture",
      ]).exitCode).toBe(0);
      const tree = run(repo, ["git", "rev-parse", "HEAD^{tree}"]).stdout.toString().trim();
      expect(run(somewhere, [
        "bun",
        "scripts/release/materialize-planned-tree.mjs",
        "--repo",
        repo,
        "--tree",
        tree,
        "--destination",
        source,
        "--receipt",
        resolve(root, "materialized.json"),
      ]).exitCode).toBe(0);
      const output = resolve(evidence, "task-20/exact-tree-receipt.json");

      const result = run(somewhere, [
        "bun",
        "scripts/release/run-exact-tree.mjs",
        "--repo",
        repo,
        "--source",
        source,
        "--tree",
        tree,
        "--argv-json",
        JSON.stringify(["/bin/sh", "probe.sh"]),
        "--expected",
        "GREEN_ZERO",
        "--dependency-root",
        resolve(dependencies, "node_modules"),
        "--evidence-root",
        evidence,
        "--network-policy",
        "deny",
        "--output",
        output,
      ], {
        CLOUDFLARE_API_TOKEN: "must-not-enter-sandbox",
        HOME: ambientHome,
      });

      expect(
        result.exitCode,
        `${result.stderr.toString()}\n${result.stdout.toString()}\n${
          await readFile(output, "utf8").catch(() => "no receipt")
        }`,
      ).toBe(0);
      const receipt = await readJson(output);
      expect(receipt.artifacts.map((entry) => entry.path).sort()).toEqual([
        "task-20/home.txt",
        "task-20/probe.txt",
        "task-20/tmp.txt",
      ]);
      expect(receipt).toMatchObject({
        exitCode: 0,
        dependencies: {
          root: resolve(dependencies, "node_modules"),
          paths: ["node_modules", "app/node_modules", "server/node_modules"],
          readOnly: true,
          ephemeralCachePaths: [
            "node_modules/.vite-temp",
            "app/node_modules/.vite-temp",
            "server/node_modules/.vite-temp",
          ],
          ephemeralWorkPaths: ["server/.wrangler"],
        },
        environment: {
          credentialsScrubbed: true,
          cachesIsolated: true,
          temporaryFilesystemIsolated: true,
          hostCredentialRootsMasked: true,
          hostProcessNamespaceMasked: true,
          preexistingEvidenceIsolated: true,
        },
        network: {
          policy: "deny",
          namespaceIsolated: true,
          externalConnectSucceeded: false,
        },
        cleanup: {
          sourceUnchanged: true,
          runnerTemporaryRootRemoved: true,
        },
      });
      expect(receipt.network.traceBytes).toBeGreaterThan(0);
      await expect(access(resolve(dependencies, "app/node_modules/writable-probe")))
        .rejects.toBeDefined();
      await expect(access(resolve(dependencies, "app/node_modules/.vite-temp/ephemeral-probe")))
        .rejects.toBeDefined();
      await expect(access(resolve(source, "server/.wrangler/ephemeral-probe")))
        .rejects.toBeDefined();
      await expect(access(resolve(source, "node_modules"))).rejects.toBeDefined();
      await expect(access(receipt.environment.temporaryRoot)).rejects.toBeDefined();
      expect(await readFile(resolve(evidence, "prior-task/proof.txt"), "utf8"))
        .toBe("immutable prior proof");
      const privateTemp = (await readFile(resolve(evidence, "task-20/tmp.txt"), "utf8")).trim();
      await expect(access(privateTemp)).rejects.toBeDefined();
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("cannot overwrite a pre-existing shared evidence path", async () => {
    const root = await temporaryDirectory("exact-tree-prior-evidence");
    try {
      const source = resolve(root, "source");
      const evidence = resolve(root, "evidence");
      await mkdir(source);
      await mkdir(evidence);
      await writeFile(resolve(source, "source-marker"), "exact source\n");
      await writeFile(resolve(evidence, "prior.txt"), "trusted\n");

      await expect(runExactCommand(
        [
          "/bin/sh",
          "-c",
          "test -f source-marker && printf 'forged\\n' > \"$SOMEWHERE_EVIDENCE_ROOT/prior.txt\"",
        ],
        source,
        evidence,
        undefined,
        "a".repeat(40),
        "deny",
        "GREEN_ZERO",
      )).rejects.toThrow("evidence path already exists");
      expect(await readFile(resolve(evidence, "prior.txt"), "utf8")).toBe("trusted\n");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("discards private evidence when the exit class does not match", async () => {
    const root = await temporaryDirectory("exact-tree-mismatched-exit");
    try {
      const source = resolve(root, "source");
      const evidence = resolve(root, "evidence");
      await mkdir(source);
      await mkdir(evidence);

      const result = await runExactCommand(
        [
          "/bin/sh",
          "-c",
          "printf 'untrusted\\n' > \"$SOMEWHERE_EVIDENCE_ROOT/discarded.txt\"",
        ],
        source,
        evidence,
        undefined,
        "a".repeat(40),
        "deny",
        "TDD_RED_NONZERO",
      );

      expect(result.exitCode).toBe(0);
      await expect(access(resolve(evidence, "discarded.txt"))).rejects.toBeDefined();
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a foreign dependency workspace and a mismatched lockfile", async () => {
    const root = await temporaryDirectory("exact-tree-dependency-reject");
    try {
      const source = resolve(root, "source");
      const evidence = resolve(root, "evidence");
      const dependencies = resolve(root, "dependencies");
      await mkdir(resolve(source, "app"), { recursive: true });
      await mkdir(evidence);
      await mkdir(resolve(dependencies, "node_modules"), { recursive: true });
      await mkdir(resolve(dependencies, "app/node_modules"), { recursive: true });
      await mkdir(resolve(dependencies, "foreign/node_modules"), { recursive: true });
      await writeFile(resolve(source, "package.json"), '{"workspaces":["app"]}\n');
      await writeFile(resolve(source, "bun.lock"), "source-lock\n");
      await writeFile(resolve(dependencies, "bun.lock"), "foreign-lock\n");
      await expect(runExactCommand(
        ["/bin/true"],
        source,
        evidence,
        resolve(dependencies, "node_modules"),
        "a".repeat(40),
        "deny",
        "GREEN_ZERO",
      )).rejects.toThrow("installed dependency workspaces do not match the manifest");
      await rm(resolve(dependencies, "foreign"), { recursive: true });
      await expect(runExactCommand(
        ["/bin/true"],
        source,
        evidence,
        resolve(dependencies, "node_modules"),
        "a".repeat(40),
        "deny",
        "GREEN_ZERO",
      )).rejects.toThrow("dependency lockfile mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
