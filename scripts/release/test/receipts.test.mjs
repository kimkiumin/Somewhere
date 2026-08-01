import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";
import { snapshotRegularFile } from "../lib/release-core.mjs";

const repo = resolve(import.meta.dir, "../../..");
const plan = "c".repeat(64);
const policy = "d".repeat(64);

async function initializeSourceRepository(root) {
  const source = resolve(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(resolve(source, "tracked.txt"), "source\n");
  expect(run(repo, ["git", "-C", source, "init", "--quiet"]).exitCode).toBe(0);
  expect(run(repo, ["git", "-C", source, "config", "user.name", "Release Test"]).exitCode).toBe(0);
  expect(run(repo, ["git", "-C", source, "config", "user.email", "release@example.invalid"]).exitCode).toBe(0);
  expect(run(repo, ["git", "-C", source, "add", "tracked.txt"]).exitCode).toBe(0);
  expect(run(repo, ["git", "-C", source, "commit", "--quiet", "-m", "fixture"]).exitCode).toBe(0);
  return {
    source,
    sha: run(repo, ["git", "-C", source, "rev-parse", "HEAD"]).stdout.toString().trim(),
    tree: run(repo, ["git", "-C", source, "rev-parse", "HEAD^{tree}"]).stdout.toString().trim(),
  };
}

function captureArguments({ lane, checkId, source, sha, tree, primary, receipt, argv }) {
  return [
    "bun",
    resolve(repo, "scripts/release/capture-command-receipt.mjs"),
    "--lane",
    lane,
    "--check-id",
    checkId,
    "--sha",
    sha,
    "--source-tree",
    tree,
    "--plan-sha256",
    plan,
    "--policy",
    "contracts/policy/navigation-v2-calibration-1.json",
    "--policy-sha256",
    policy,
    "--primary",
    primary,
    "--primary-mode",
    "native",
    "--receipt",
    receipt,
    "--cwd",
    source,
    "--argv-json",
    JSON.stringify(argv),
  ];
}

describe("Command and evidence receipts", () => {
  test("captures exact argv, primary digest, stdout, and zero exit", async () => {
    const root = await temporaryDirectory("capture");
    try {
      const fixture = await initializeSourceRepository(root);
      const primary = resolve(root, "evidence/primary.json");
      const receipt = resolve(root, "evidence/command.json");
      const argv = [
        "bun",
        "-e",
        `await Bun.write(${JSON.stringify(primary)}, JSON.stringify({schemaVersion:1,gate:"PASS"})+"\\n")`,
      ];
      const result = run(repo, captureArguments({
        lane: "FINAL",
        checkId: "fixture",
        ...fixture,
        primary,
        receipt,
        argv,
      }));
      expect(result.exitCode).toBe(0);
      const captured = await readJson(receipt);
      expect(captured.gate).toBe("PASS");
      expect(captured.lane).toBe("FINAL");
      expect(captured.argv).toEqual(argv);
      expect(captured.primary.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(captured.stdout.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("captures an expected external binding block without failing the harness", async () => {
    const root = await temporaryDirectory("capture-binding-block");
    try {
      const fixture = await initializeSourceRepository(root);
      const primary = resolve(root, "evidence/device.json");
      const receipt = resolve(root, "evidence/command.json");
      const argv = [
        "bun",
        "-e",
        `await Bun.write(${JSON.stringify(primary)}, JSON.stringify({schemaVersion:1,bindingGate:"BLOCK",reason:"RC_ABSENT"})+"\\n");process.exitCode=2`,
      ];
      const result = run(repo, captureArguments({
        lane: "F3",
        checkId: "device-verdict",
        ...fixture,
        primary,
        receipt,
        argv,
      }));
      expect(result.exitCode).toBe(0);
      expect(await readJson(receipt)).toMatchObject({ gate: "BLOCK", exitCode: 2 });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a symlink emitted as a command primary", async () => {
    const root = await temporaryDirectory("capture-symlink");
    try {
      const fixture = await initializeSourceRepository(root);
      const primary = resolve(root, "evidence/primary.json");
      const target = resolve(root, "evidence/target.json");
      const receipt = resolve(root, "evidence/command.json");
      const argv = [
        "bun",
        "-e",
        `import {mkdirSync,symlinkSync,writeFileSync} from "node:fs";mkdirSync(${JSON.stringify(resolve(root, "evidence"))},{recursive:true});writeFileSync(${JSON.stringify(target)},'{"schemaVersion":1,"gate":"PASS"}\\n');symlinkSync(${JSON.stringify(target)},${JSON.stringify(primary)})`,
      ];
      const result = run(repo, captureArguments({
        lane: "F1",
        checkId: "fixture",
        ...fixture,
        primary,
        receipt,
        argv,
      }));
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(receipt))).toMatchObject({
        schemaVersion: 1,
        gate: "FAIL",
        reason: "command primary must be a regular file",
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a primary replaced by a symlink after command capture", async () => {
    const root = await temporaryDirectory("capture-swap");
    try {
      const fixture = await initializeSourceRepository(root);
      const laneRoot = resolve(root, "evidence/F1");
      const primary = resolve(laneRoot, "primary.json");
      const receipt = resolve(laneRoot, "command-fixture.json");
      const registry = resolve(root, "registry.json");
      const argv = [
        "bun",
        "-e",
        `await Bun.write(${JSON.stringify(primary)}, '{"schemaVersion":1,"gate":"PASS"}\\n')`,
      ];
      expect(run(repo, captureArguments({
        lane: "F1",
        checkId: "fixture",
        ...fixture,
        primary,
        receipt,
        argv,
      })).exitCode).toBe(0);
      const replacement = resolve(root, "replacement.json");
      await writeFile(replacement, "{\"schemaVersion\":1,\"gate\":\"PASS\"}\n");
      await rm(primary);
      await symlink(replacement, primary);
      await writeJson(registry, { schemaVersion: 1, lanes: { F1: ["fixture"] } });
      const output = resolve(laneRoot, "checks.json");
      const result = run(repo, [
        "bun",
        "scripts/release/assemble-lane-checks.mjs",
        "--lane",
        "F1",
        "--registry",
        registry,
        "--root",
        resolve(root, "evidence"),
        "--output",
        output,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output))).toMatchObject({ schemaVersion: 1, gate: "FAIL" });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a regular file changed between the descriptor read and identity recheck", async () => {
    const root = await temporaryDirectory("snapshot-race");
    try {
      const path = resolve(root, "primary.json");
      await writeFile(path, "{\"gate\":\"PASS\",\"value\":1}\n");
      await expect(snapshotRegularFile(path, "racing primary", async () => {
        await writeFile(path, "{\"gate\":\"PASS\",\"value\":2}\n");
      })).rejects.toThrow("racing primary changed while reading");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("evidence manifest rejects duplicate and digest-mismatched paths", async () => {
    const root = await temporaryDirectory("manifest");
    try {
      await writeFile(resolve(root, "artifact.txt"), "safe\n");
      const hash = new Bun.CryptoHasher("sha256").update("safe\n").digest("hex");
      const manifest = resolve(root, "manifest.sha256");
      await writeFile(manifest, `${hash}  artifact.txt\n${hash}  artifact.txt\n`);
      const output = resolve(root, "verdict.json");
      const result = run(repo, [
        "bun",
        "scripts/release/verify-evidence-manifest.mjs",
        "--manifest",
        manifest,
        "--scope",
        "preparation",
        "--output",
        output,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(output)).gate).toBe("FAIL");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("evidence manifest rejects a symlink even when target bytes match", async () => {
    const root = await temporaryDirectory("manifest-symlink");
    try {
      const outside = resolve(root, "outside.txt");
      await writeFile(outside, "safe\n");
      await symlink(outside, resolve(root, "linked.txt"));
      const hash = new Bun.CryptoHasher("sha256").update("safe\n").digest("hex");
      const manifest = resolve(root, "manifest.sha256");
      await writeFile(manifest, `${hash}  linked.txt\n`);
      const result = run(repo, [
        "bun",
        "scripts/release/verify-evidence-manifest.mjs",
        "--manifest",
        manifest,
        "--scope",
        "preparation",
        "--output",
        resolve(root, "verdict.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("lane assembly rejects a missing registered receipt", async () => {
    const root = await temporaryDirectory("lane");
    try {
      await mkdir(resolve(root, "F1"), { recursive: true });
      const result = run(repo, [
        "bun",
        "scripts/release/assemble-lane-checks.mjs",
        "--lane",
        "F1",
        "--registry",
        "scripts/release/final-lane-checks-v1.json",
        "--root",
        root,
        "--output",
        resolve(root, "F1/checks.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(resolve(root, "F1/checks.json"))).gate).toBe("BLOCK");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("lane assembly rejects an unregistered command receipt", async () => {
    const root = await temporaryDirectory("lane-extra");
    try {
      await mkdir(resolve(root, "F1"), { recursive: true });
      await writeJson(resolve(root, "F1/command-unregistered.json"), {
        schemaVersion: 1,
        lane: "F1",
        checkId: "unregistered",
      });
      const result = run(repo, [
        "bun",
        "scripts/release/assemble-lane-checks.mjs",
        "--lane",
        "F1",
        "--registry",
        "scripts/release/final-lane-checks-v1.json",
        "--root",
        root,
        "--output",
        resolve(root, "F1/checks.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
      expect((await readJson(resolve(root, "F1/checks.json"))).gate).toBe("FAIL");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("scope production registry is accepted by the production scanner", async () => {
    const root = await temporaryDirectory("scope-scan");
    try {
      const artifact = resolve(root, "app.js");
      await writeFile(artifact, "console.log('safe production bundle')\n");
      const digest = new Bun.CryptoHasher("sha256")
        .update(await readFile(artifact))
        .digest("hex");
      const receipt = resolve(root, "build-receipt.json");
      await writeJson(receipt, {
        schemaVersion: 2,
        artifacts: [{
          path: "app.js",
          sha256: `sha256:${digest}`,
          bytes: (await readFile(artifact)).byteLength,
          kind: "app-asset",
        }],
      });
      const output = resolve(root, "scan.json");
      const result = run(repo, [
        "bun",
        "scripts/release/scan-production.mjs",
        "--build-receipt",
        receipt,
        "--final-root",
        root,
        "--deny",
        "scripts/release/v2-must-not-v1.json",
        "--output",
        output,
      ]);
      expect(result.exitCode).toBe(0);
      expect((await readJson(output)).gate).toBe("PASS");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
