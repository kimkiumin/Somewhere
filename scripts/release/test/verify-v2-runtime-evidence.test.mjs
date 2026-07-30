import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  capture,
  finalSha,
  sourceTree,
  validate,
} from "./verify-v2-runtime-evidence.fixture.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  temporaryDirectory,
} from "./release-testkit.mjs";
import { runtimePaths } from "./runtime-semantic-fixture.mjs";

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
        artifactRole: "local-diagnostic",
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

  test("rejects a release artifact mislabeled as the runtime diagnostic build", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-build-role");
    try {
      const { output, result } = await capture(root, "release-build-role");
      expect(result.exitCode).not.toBe(0);
      expect(await readJson(output)).toMatchObject({ gate: "FAIL" });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
