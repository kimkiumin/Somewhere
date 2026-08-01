import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyPatchEquivalentEvidenceIdentity } from "../lib/evidence-commit-identity.mjs";
import { git, snapshotRegularFile } from "../lib/release-core.mjs";
import { removeTemporaryDirectory, temporaryDirectory } from "./release-testkit.mjs";

const roots = [];

afterEach(async () => {
  while (roots.length > 0) await removeTemporaryDirectory(roots.pop());
});

async function fixture() {
  const repo = await temporaryDirectory("evidence-identity");
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "Somewhere Test"]);
  await git(repo, ["config", "user.email", "test@somewhere.invalid"]);
  await writeFile(resolve(repo, "README.md"), "base\n");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "base"]);
  await git(repo, ["checkout", "-b", "reviewed"]);
  await writeFile(resolve(repo, "feature.txt"), "reviewed feature\n");
  await git(repo, ["add", "feature.txt"]);
  await git(repo, ["commit", "-m", "reviewed feature"]);
  const reviewedCommitSha = await git(repo, ["rev-parse", "HEAD"]);
  await git(repo, ["checkout", "main"]);
  await writeFile(resolve(repo, "unrelated.txt"), "different base\n");
  await git(repo, ["add", "unrelated.txt"]);
  await git(repo, ["commit", "-m", "different base"]);
  const mismatchCommitSha = await git(repo, ["rev-parse", "HEAD"]);
  await git(repo, ["cherry-pick", reviewedCommitSha]);
  const landedCommitSha = await git(repo, ["rev-parse", "HEAD"]);
  return { repo, reviewedCommitSha, mismatchCommitSha, landedCommitSha };
}

async function evidenceSnapshot(repo, headSha, contents) {
  const path = resolve(repo, "evidence.json");
  await writeFile(path, contents ?? `${JSON.stringify({ headSha })}\n`);
  return { path, snapshot: await snapshotRegularFile(path, "test evidence") };
}

describe("historical evidence commit identity", () => {
  test("accepts a reviewed commit whose stable patch equals the landed commit", async () => {
    const { repo, reviewedCommitSha, landedCommitSha } = await fixture();
    const { snapshot } = await evidenceSnapshot(repo, reviewedCommitSha);

    const identity = await verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: snapshot,
      commitField: "headSha",
      landedCommitSha,
    });

    expect(identity.reviewedCommitSha).toBe(reviewedCommitSha);
    expect(identity.landedCommitSha).toBe(landedCommitSha);
    expect(identity.reviewedTree).not.toBe(identity.landedTree);
    expect(identity.stablePatchId).toMatch(/^[a-f0-9]{40}$/u);
  });

  test("rejects a historical commit whose patch differs from the landed commit", async () => {
    const { repo, mismatchCommitSha, landedCommitSha } = await fixture();
    const { snapshot } = await evidenceSnapshot(repo, mismatchCommitSha);

    await expect(verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: snapshot,
      commitField: "headSha",
      landedCommitSha,
    })).rejects.toThrow("patch does not match");
  });

  test("rejects malformed JSON, an invalid SHA, and an unreadable commit", async () => {
    const { repo, landedCommitSha } = await fixture();
    const malformed = await evidenceSnapshot(repo, "", "{");
    await expect(verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: malformed.snapshot,
      commitField: "headSha",
      landedCommitSha,
    })).rejects.toThrow("not valid JSON");

    const invalid = await evidenceSnapshot(repo, "not-a-sha");
    await expect(verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: invalid.snapshot,
      commitField: "headSha",
      landedCommitSha,
    })).rejects.toThrow("commit is invalid");

    const unreadable = await evidenceSnapshot(repo, "0".repeat(40));
    await expect(verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: unreadable.snapshot,
      commitField: "headSha",
      landedCommitSha,
    })).rejects.toThrow();
  });

  test("uses the retained snapshot when the evidence path is replaced later", async () => {
    const { repo, reviewedCommitSha, mismatchCommitSha, landedCommitSha } = await fixture();
    const { path, snapshot } = await evidenceSnapshot(repo, reviewedCommitSha);
    await writeFile(path, `${JSON.stringify({ headSha: mismatchCommitSha })}\n`);

    const identity = await verifyPatchEquivalentEvidenceIdentity({
      repo,
      evidenceSnapshot: snapshot,
      commitField: "headSha",
      landedCommitSha,
    });

    expect(identity.reviewedCommitSha).toBe(reviewedCommitSha);
  });
});
