import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyPreparedBuild } from "../lib/prepared-build.mjs";
import { sha256 } from "../lib/release-core.mjs";
import {
  capture,
  finalSha,
  preparedFixture,
  registry,
  repo,
  sourceTree,
} from "./verify-v2-runtime-evidence.fixture.mjs";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";
import { writeFixtureCommand } from "./runtime-semantic-fixture.mjs";

describe("verify-v2 prepared runtime evidence", () => {
  test("derives its fixture source tree without Git metadata", async () => {
    // Given
    const root = await temporaryDirectory("verify-v2-runtime-gitless-fixture");
    try {
      const archive = resolve(root, "source.tar");
      const checkout = resolve(root, "checkout");
      expect(run(repo, [
        "tar",
        "-cf",
        archive,
        "bun.lock",
        "package.json",
        "app/package.json",
        "contracts/package.json",
        "server/package.json",
        "server/test/async-alarm-todo12.runtime.ts",
        "server/test/journey-do-cloudflare.runtime.ts",
        "server/test/task14-feedback-epoch.test.ts",
        "scripts/release",
      ]).exitCode).toBe(0);
      await mkdir(checkout);
      expect(run(repo, ["tar", "-xf", archive, "-C", checkout]).exitCode).toBe(0);

      // When
      const probe = run(checkout, [
        "bun",
        "-e",
        'const {sourceTree}=await import("./scripts/release/test/verify-v2-runtime-evidence.fixture.mjs");if(!/^[a-f0-9]{40}$/.test(sourceTree))process.exit(23)',
      ]);

      // Then
      expect(probe.exitCode).toBe(0);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("binds exact runtime evidence to the one prepared build and source archive", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-exact-prepared");
    try {
      const { evidence, output, result } = await capture(root, "complete", true);
      expect(result.exitCode).toBe(0);
      expect(await readJson(output)).toMatchObject({
        gate: "PASS",
        runtimeEvidence: { mode: "exact-prepared" },
      });
      expect(await readJson(resolve(evidence, "production-build.json"))).toMatchObject({
        artifactRole: "prepared-release-candidate-reference",
        sourceSha: finalSha,
        sourceTree,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a self-consistent prepared tool identity not installed in the exact checkout", async () => {
    const root = await temporaryDirectory("verify-v2-runtime-toolchain-mismatch");
    try {
      const fixture = await writeFixtureCommand(root);
      const prepared = await preparedFixture(root);
      const receipt = await readJson(prepared.receipt);
      const vite = receipt.provenance.tools.vite;
      vite.version = "99.0.0";
      vite.package.resolvedPath = "node_modules/forged-vite/package.json";
      vite.package.sha256 = sha256("forged vite package");
      vite.binary.resolvedPath = "node_modules/forged-vite/bin/vite.js";
      vite.binary.sha256 = sha256("forged vite binary");
      const { digest: _previousDigest, ...provenanceBody } = receipt.provenance;
      receipt.provenance.digest = sha256(JSON.stringify(provenanceBody));
      await writeJson(prepared.receipt, receipt);
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
        resolve(root, "verify-ops"),
        "--output",
        output,
        "--argv-json",
        JSON.stringify(["bun", fixture]),
        "--prepared-build-root",
        prepared.buildRoot,
        "--prepared-build-receipt",
        prepared.receipt,
        "--prepared-source-archive",
        prepared.sourceArchive,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output)).reason).toContain("provenance");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a self-consistent forged source archive outside the asserted Git tree", async () => {
    // Given
    const root = await temporaryDirectory("verify-v2-runtime-forged-source");
    try {
      const prepared = await preparedFixture(root);
      const forgedRoot = resolve(root, "forged");
      const forgedManifest = resolve(forgedRoot, "package.json");
      await mkdir(forgedRoot);
      const forgedBytes = Buffer.from('{"name":"forged-stale-source"}\n');
      await writeFile(forgedManifest, forgedBytes);
      expect(run(repo, ["tar", "--delete", "-f", prepared.sourceArchive, "package.json"]).exitCode)
        .toBe(0);
      expect(run(repo, [
        "tar",
        "--append",
        "-f",
        prepared.sourceArchive,
        "-C",
        forgedRoot,
        "package.json",
      ]).exitCode).toBe(0);
      const receipt = await readJson(prepared.receipt);
      receipt.provenance.workspaceManifests[0].sha256 = sha256(forgedBytes);
      const { digest: _previousDigest, ...provenanceBody } = receipt.provenance;
      receipt.provenance.digest = sha256(JSON.stringify(provenanceBody));
      await writeJson(prepared.receipt, receipt);

      // When
      const verification = verifyPreparedBuild({
        sha: finalSha,
        sourceTree,
        repo,
        buildRoot: prepared.buildRoot,
        receipt: prepared.receipt,
        sourceArchive: prepared.sourceArchive,
      });

      // Then
      await expect(verification).rejects.toThrow("source tree");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
