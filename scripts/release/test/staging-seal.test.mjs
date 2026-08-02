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

async function digest(path) {
  return new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer())
    .digest("hex");
}

async function fixture(root, overrides = {}) {
  const verdict = resolve(root, "final-verdict.json");
  await writeJson(verdict, {
    schemaVersion: 1,
    finalSha: sha,
    sourceTree: tree,
    repositoryReady: "PASS",
    releaseReady: "BLOCK",
    lanes: ["F1", "F2", "F3", "F4"].map((lane) => ({
      lane,
      repositoryGate: "PASS",
      externalGate: lane === "F3" ? "BLOCK" : "PASS",
    })),
    externalGate: "BLOCK",
    externalDigest: `sha256:${"c".repeat(64)}`,
    cleanupDigest: `sha256:${"d".repeat(64)}`,
    ...overrides,
  });
  const verdictDigest = await digest(verdict);
  const manifest = resolve(root, "terminal-manifest.sha256");
  await writeFile(manifest, `${verdictDigest}  final-verdict.json\n`);
  const manifestDigest = await digest(manifest);
  const tagMessage = resolve(root, "tag-message.txt");
  await writeFile(tagMessage, [
    "Somewhere V2 reviewed release candidate",
    `Somewhere-Repository-Verdict-SHA256: ${verdictDigest}`,
    `Somewhere-Terminal-Manifest-SHA256: ${manifestDigest}`,
    "",
  ].join("\n"));
  return { verdict, verdictDigest, manifest, manifestDigest, tagMessage };
}

function verify(root, files) {
  return run(repo, [
    "bun", "scripts/release/verify-staging-seal.mjs",
    "--verdict", files.verdict,
    "--verdict-sha256", files.verdictDigest,
    "--manifest", files.manifest,
    "--manifest-sha256", files.manifestDigest,
    "--sha", sha,
    "--source-tree", tree,
    "--tag-message", files.tagMessage,
    "--output", resolve(root, "staging-seal.json"),
  ]);
}

describe("Protected staging repository seal", () => {
  test("accepts a digest-bound exact-SHA repository PASS while release remains BLOCK", async () => {
    const root = await temporaryDirectory("staging-seal");
    try {
      const files = await fixture(root);
      const result = verify(root, files);

      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(await readJson(resolve(root, "staging-seal.json"))).toMatchObject({
        gate: "PASS",
        finalSha: sha,
        sourceTree: tree,
        repositoryVerdictSha256: `sha256:${files.verdictDigest}`,
        terminalManifestSha256: `sha256:${files.manifestDigest}`,
      });
    } finally {
      await removeTemporaryDirectory(root);
    }
  });

  test("rejects a release PASS and a foreign tree even when their digests are recomputed", async () => {
    for (const overrides of [
      { releaseReady: "PASS" },
      { sourceTree: "9".repeat(40) },
    ]) {
      const root = await temporaryDirectory("staging-seal-forgery");
      try {
        const files = await fixture(root, overrides);
        expect(verify(root, files).exitCode).not.toBe(0);
      } finally {
        await removeTemporaryDirectory(root);
      }
    }
  });

  test("rejects a tag that does not bind both approved seal digests", async () => {
    const root = await temporaryDirectory("staging-seal-tag");
    try {
      const files = await fixture(root);
      await writeFile(files.tagMessage, [
        "Somewhere V2 reviewed release candidate",
        `Somewhere-Repository-Verdict-SHA256: ${files.verdictDigest}`,
        "",
      ].join("\n"));

      const result = verify(root, files);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("STAGING_TAG_SEAL_BINDING_MISSING");
    } finally {
      await removeTemporaryDirectory(root);
    }
  });
});
