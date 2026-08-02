import { describe, expect, test } from "bun:test";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createVerifyV2RuntimeEvidence } from "../lib/verify-v2-runtime-evidence.mjs";
import {
  finalSha,
  registry,
  sourceTree,
} from "./verify-v2-runtime-evidence.fixture.mjs";
import {
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
} from "./release-testkit.mjs";
import {
  runtimePaths,
  writeFixtureCommand,
} from "./runtime-semantic-fixture.mjs";

describe("verify-v2 runtime evidence snapshot races", () => {
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
