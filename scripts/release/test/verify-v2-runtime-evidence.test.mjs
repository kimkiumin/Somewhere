import { describe, expect, test } from "bun:test";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createVerifyV2RuntimeEvidence } from "../lib/verify-v2-runtime-evidence.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
} from "./release-testkit.mjs";

const repo = resolve(import.meta.dir, "../../..");
const registry = resolve(repo, "scripts/release/verify-v2-runtime-artifacts-v1.json");
const finalSha = "a".repeat(40);
const sourceTree = "b".repeat(40);
const runtimePaths = [
  "app-build.txt",
  "canary-scan.json",
  "export-restore.txt",
  "legal-gates.json",
  "live-cleanup-receipt.json",
  "live-custom-log.json",
  "live-d1.json",
  "live-dlq-delivery.txt",
  "live-dlq.txt",
  "live-do-namespaces.json",
  "live-do.json",
  "live-failure-cleanup-tests.txt",
  "live-hidden-lifecycle.txt",
  "live-http-schema.txt",
  "live-queue-attempts.txt",
  "live-queue.txt",
  "live-runtime-state-files.txt",
  "live-scheduled-http.txt",
  "live-start-receipt.json",
  "live-worker-log.txt",
  "production-build.json",
  "rollback-dry-run.txt",
  "rollback-receipts.json",
  "summary.txt",
  "task14-tests.txt",
  "typecheck.txt",
  "wrangler-dry-run.txt",
];

async function writeFixtureCommand(root) {
  const path = resolve(root, "write-runtime-fixture.mjs");
  await writeFile(path, `
    import { mkdir, symlink, writeFile } from "node:fs/promises";
    import { resolve } from "node:path";
    const evidence = process.env.SOMEWHERE_OPS_EVIDENCE_DIR;
    const mode = process.env.RUNTIME_FIXTURE_MODE;
    const paths = ${JSON.stringify(runtimePaths)};
    await mkdir(evidence, { recursive: true });
    for (const artifact of paths) {
      if (mode === "missing" && artifact === "live-d1.json") continue;
      const target = resolve(evidence, artifact);
      if (mode === "symlink" && artifact === "live-d1.json") {
        const outside = resolve(evidence, "..", "outside-live-d1.json");
        await writeFile(outside, "foreign\\n");
        await symlink(outside, target);
      } else if (artifact === "production-build.json") {
        await writeFile(target, JSON.stringify({
          sourceSha: process.env.SOMEWHERE_SOURCE_SHA ?? null,
          sourceTree: process.env.SOMEWHERE_SOURCE_TREE ?? null,
        }));
      } else {
        await writeFile(target, \`runtime:\${artifact}\\n\`);
      }
    }
    console.log("fixture verify:v2 PASS");
  `);
  return path;
}

async function capture(root, mode = "complete") {
  const fixture = await writeFixtureCommand(root);
  const evidence = resolve(root, "verify-ops");
  const output = resolve(root, "verify-v2-verdict.json");
  const result = run(repo, [
    "bun",
    "scripts/release/run-verify-v2.mjs",
    "--sha",
    finalSha,
    "--source-tree",
    sourceTree,
    "--registry",
    registry,
    "--evidence-dir",
    evidence,
    "--output",
    output,
    "--argv-json",
    JSON.stringify(["bun", fixture]),
  ], { RUNTIME_FIXTURE_MODE: mode });
  return { evidence, output, result };
}

function validate(input, output, sha = finalSha, tree = sourceTree) {
  return run(repo, [
    "bun",
    "scripts/release/validate-verify-v2-runtime-evidence.mjs",
    "--input",
    input,
    "--sha",
    sha,
    "--source-tree",
    tree,
    "--registry",
    registry,
    "--output",
    output,
  ]);
}

describe("verify-v2 runtime evidence binding", () => {
  test("captures every real runtime artifact in an exact SHA/tree-bound manifest without git", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-complete");
    try {
      const { output, result } = await capture(root);
      expect(result.exitCode).toBe(0);
      const primary = await readJson(output);
      expect(primary).toMatchObject({
        schemaVersion: 1,
        gate: "PASS",
        finalSha,
        sourceTree,
        command: { exitCode: 0 },
        runtimeEvidence: {
          schemaVersion: 1,
          artifactCount: runtimePaths.length,
        },
      });
      expect(primary.runtimeEvidence.artifacts.map((entry) => entry.path)).toEqual(runtimePaths);
      expect(primary.runtimeEvidence.artifacts.every((entry) =>
        entry.sha256.startsWith("sha256:") && entry.bytes > 0
      )).toBe(true);
      expect(await readJson(resolve(root, "verify-ops/production-build.json"))).toEqual({
        sourceSha: finalSha,
        sourceTree,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails capture when a governed runtime artifact is missing", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-missing");
    try {
      const { output, result } = await capture(root, "missing");
      expect(result.exitCode).not.toBe(0);
      expect(await readJson(output)).toMatchObject({ schemaVersion: 1, gate: "FAIL" });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails validation when a captured runtime artifact changes", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-changed");
    try {
      const { evidence, output, result } = await capture(root);
      expect(result.exitCode).toBe(0);
      await writeFile(resolve(evidence, "live-d1.json"), "changed\n");
      const verdict = resolve(root, "changed-verdict.json");
      expect(validate(output, verdict).exitCode).not.toBe(0);
      expect((await readJson(verdict)).reason).toContain("digest mismatch");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails capture when a governed runtime artifact is a symlink", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-symlink");
    try {
      const { output, result } = await capture(root, "symlink");
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output)).reason).toContain("regular file");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails validation for a manifest from another SHA or source tree", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-foreign");
    try {
      const { output, result } = await capture(root);
      expect(result.exitCode).toBe(0);
      const verdict = resolve(root, "foreign-verdict.json");
      expect(validate(output, verdict, "c".repeat(40), "d".repeat(40)).exitCode).not.toBe(0);
      expect((await readJson(verdict)).reason).toContain("source identity");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails capture when the runtime evidence directory is replaced during snapshotting", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-directory-race");
    try {
      const fixture = await writeFixtureCommand(root);
      const evidence = resolve(root, "verify-ops");
      expect(run(root, ["bun", fixture], {
        SOMEWHERE_OPS_EVIDENCE_DIR: evidence,
        RUNTIME_FIXTURE_MODE: "complete",
      }).exitCode).toBe(0);
      await expect(createVerifyV2RuntimeEvidence({
        sha: finalSha,
        sourceTree,
        registry,
        evidenceDir: evidence,
        command: {
          argv: ["bun", fixture],
          exitCode: 0,
          stdoutSha256: `sha256:${"0".repeat(64)}`,
          stderrSha256: `sha256:${"1".repeat(64)}`,
        },
        afterFirstSnapshot: async () => {
          await rename(evidence, resolve(root, "replaced-verify-ops"));
          await mkdir(evidence);
          for (const path of runtimePaths) {
            await writeFile(resolve(evidence, path), `replacement:${path}\n`);
          }
        },
      })).rejects.toThrow("root changed");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("fails capture when an already-snapshotted artifact changes before the set is bound", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-artifact-race");
    try {
      const fixture = await writeFixtureCommand(root);
      const evidence = resolve(root, "verify-ops");
      expect(run(root, ["bun", fixture], {
        SOMEWHERE_OPS_EVIDENCE_DIR: evidence,
        RUNTIME_FIXTURE_MODE: "complete",
      }).exitCode).toBe(0);
      await expect(createVerifyV2RuntimeEvidence({
        sha: finalSha,
        sourceTree,
        registry,
        evidenceDir: evidence,
        command: {
          argv: ["bun", fixture],
          exitCode: 0,
          stdoutSha256: `sha256:${"0".repeat(64)}`,
          stderrSha256: `sha256:${"1".repeat(64)}`,
        },
        afterFirstSnapshot: async () => {
          await writeFile(resolve(evidence, runtimePaths[0]), "changed-after-snapshot\n");
        },
      })).rejects.toThrow("changed after snapshot");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
