import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  readJson,
  removeTemporaryDirectory,
  run,
  temporaryDirectory,
  writeJson,
} from "./release-testkit.mjs";
import { writeFile } from "node:fs/promises";

const repo = resolve(import.meta.dir, "../../..");
const sha = "a".repeat(40);
const tree = "b".repeat(40);
const plan = "c".repeat(64);
const policyDigest = "d".repeat(64);
const policyPath = "prepared/navigation-v2-calibration-1.json";

function lane(laneId, externalGate = "PASS") {
  return {
    schemaVersion: 1,
    lane: laneId,
    finalSha: sha,
    sourceTree: tree,
    planSha256: `sha256:${plan}`,
    policy: { path: policyPath, sha256: `sha256:${policyDigest}` },
    repositoryGate: "PASS",
    externalGate,
    checksDigest: `sha256:${"e".repeat(64)}`,
    cleanupDigest: `sha256:${"f".repeat(64)}`,
  };
}

describe("Final verdict separation", () => {
  test("repository passes while missing external authorities remain explicit BLOCK", async () => {
    const root = await temporaryDirectory("final-verdict");
    try {
      const preparation = resolve(root, "preparation.json");
      await writeJson(preparation, {
        schemaVersion: 1,
        preparationGate: "PASS",
        finalSha: sha,
        sourceTree: tree,
        reviewedPlan: { path: "prepared/plan.md", sha256: `sha256:${plan}` },
        policy: { kind: "calibration", path: policyPath, sha256: `sha256:${policyDigest}` },
      });
      for (const id of ["F1", "F2", "F3", "F4"]) {
        await writeJson(resolve(root, `${id}.json`), lane(id, id === "F3" ? "BLOCK" : "PASS"));
      }
      await writeJson(resolve(root, "external.json"), {
        schemaVersion: 1,
        finalSha: sha,
        gates: [
          { id: "cloudflare-production", gate: "BLOCK", reason: "MISSING_AUTHORITY" },
          { id: "physical-iphone", gate: "BLOCK", reason: "MISSING_DEVICE_EVIDENCE" },
        ],
        releaseGate: "BLOCK",
      });
      await writeJson(resolve(root, "cleanup.json"), {
        schemaVersion: 1,
        gate: "PASS",
        serverCount: 0,
        browserContextCount: 0,
        openPorts: [],
        tempRoots: [],
      });
      const output = resolve(root, "verdict.json");
      const result = run(repo, [
        "bun",
        "scripts/release/validate-final-verdict.mjs",
        "--preparation",
        preparation,
        "--sha",
        sha,
        "--source-tree",
        tree,
        "--plan-sha256",
        plan,
        "--policy",
        policyPath,
        "--policy-sha256",
        policyDigest,
        "--f1",
        resolve(root, "F1.json"),
        "--f2",
        resolve(root, "F2.json"),
        "--f3",
        resolve(root, "F3.json"),
        "--f4",
        resolve(root, "F4.json"),
        "--external",
        resolve(root, "external.json"),
        "--cleanup",
        resolve(root, "cleanup.json"),
        "--output",
        output,
      ]);
      expect(result.exitCode).toBe(0);
      const verdict = await readJson(output);
      expect(verdict.repositoryReady).toBe("PASS");
      expect(verdict.releaseReady).toBe("BLOCK");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("foreign lane SHA can never yield repository PASS", async () => {
    const root = await temporaryDirectory("foreign-lane");
    try {
      const mutated = lane("F1");
      mutated.finalSha = "9".repeat(40);
      await writeJson(resolve(root, "lane.json"), mutated);
      const result = run(repo, [
        "bun",
        "scripts/release/validate-lane-verdict.mjs",
        "--validate-existing",
        resolve(root, "lane.json"),
        "--lane",
        "F1",
        "--sha",
        sha,
        "--source-tree",
        tree,
        "--plan-sha256",
        plan,
        "--policy",
        policyPath,
        "--policy-sha256",
        policyDigest,
      ]);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("plain text containing PASS cannot satisfy structured lane cleanup", async () => {
    const root = await temporaryDirectory("cleanup-shape");
    try {
      const checks = resolve(root, "checks.json");
      const cleanup = resolve(root, "cleanup.txt");
      await writeJson(checks, {
        schemaVersion: 1,
        gate: "PASS",
        lane: "F1",
        checks: [],
        registryDigest: `sha256:${"e".repeat(64)}`,
        missing: [],
      });
      await writeFile(cleanup, "PASS\n");
      const result = run(repo, [
        "bun",
        "scripts/release/validate-lane-verdict.mjs",
        "--lane",
        "F1",
        "--sha",
        sha,
        "--source-tree",
        tree,
        "--plan-sha256",
        plan,
        "--policy",
        policyPath,
        "--policy-sha256",
        policyDigest,
        "--registry",
        "scripts/release/final-lane-checks-v1.json",
        "--checks",
        checks,
        "--cleanup",
        cleanup,
        "--output",
        resolve(root, "verdict.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("a foreign command receipt cannot be promoted into a local lane verdict", async () => {
    const root = await temporaryDirectory("foreign-command");
    try {
      const registry = resolve(root, "checks-registry.json");
      const primary = resolve(root, "primary.json");
      const receipt = resolve(root, "command-check.json");
      const checks = resolve(root, "checks.json");
      const cleanup = resolve(root, "cleanup.json");
      await writeJson(registry, { schemaVersion: 1, lanes: { F1: ["check"] } });
      await writeJson(primary, { schemaVersion: 1, gate: "PASS" });
      const primaryHash = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(primary).arrayBuffer())
        .digest("hex");
      await writeJson(receipt, {
        schemaVersion: 1,
        gate: "PASS",
        lane: "F1",
        checkId: "check",
        finalSha: "9".repeat(40),
        sourceTree: tree,
        planSha256: `sha256:${plan}`,
        policy: { path: policyPath, sha256: `sha256:${policyDigest}` },
        primary: {
          path: primary,
          sha256: `sha256:${primaryHash}`,
          bytes: Bun.file(primary).size,
        },
      });
      const receiptHash = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(receipt).arrayBuffer())
        .digest("hex");
      const registryHash = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(registry).arrayBuffer())
        .digest("hex");
      await writeJson(checks, {
        schemaVersion: 1,
        gate: "PASS",
        lane: "F1",
        registryDigest: `sha256:${registryHash}`,
        missing: [],
        checks: [{
          id: "check",
          classification: "repository",
          gate: "PASS",
          receipt,
          receiptSha256: `sha256:${receiptHash}`,
          primarySha256: `sha256:${primaryHash}`,
        }],
      });
      await writeJson(cleanup, {
        schemaVersion: 1,
        gate: "PASS",
        portClosed: true,
        browserContextCount: 0,
        tempRootRemoved: true,
      });
      const result = run(repo, [
        "bun",
        "scripts/release/validate-lane-verdict.mjs",
        "--lane",
        "F1",
        "--sha",
        sha,
        "--source-tree",
        tree,
        "--plan-sha256",
        plan,
        "--policy",
        policyPath,
        "--policy-sha256",
        policyDigest,
        "--registry",
        registry,
        "--checks",
        checks,
        "--cleanup",
        cleanup,
        "--output",
        resolve(root, "verdict.json"),
      ]);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
